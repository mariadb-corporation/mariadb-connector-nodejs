"use strict";

const EventEmitter = require("events");
const util = require("util");
const Queue = require("denque");
const Net = require("net");
const PacketInputStream = require("./io/packet-input-stream");
const PacketOutputStream = require("./io/packet-output-stream");
const CompressionInputStream = require("./io/compression-input-stream");
const CompressionOutputStream = require("./io/compression-output-stream");
const ServerStatus = require("./const/server-status");
const ConnectionInformation = require("./misc/connection-information");
const tls = require("tls");
const Errors = require("./misc/errors");
const Utils = require("./misc/utils");

/*commands*/
const Handshake = require("./cmd/handshake/handshake");
const Quit = require("./cmd/quit");
const Ping = require("./cmd/ping");
const Query = require("./cmd/query");
const ChangeUser = require("./cmd/change-user");

const Status = {
  NOT_CONNECTED: 1,
  CONNECTING: 2,
  AUTHENTICATING: 3,
  CONNECTED: 4,
  CLOSING: 5,
  CLOSED: 6
};

/**
 * New Connection instance.
 *
 * @param options    connection options
 * @returns Connection instance
 * @constructor
 * @fires Connection#connect
 * @fires Connection#end
 * @fires Connection#error
 *
 */
function Connection(options) {
  //*****************************************************************
  // public API methods from mysql/mysql2 drivers from compatibility
  //*****************************************************************

  /**
   * Connect event with callback.
   *
   * @param callback(error)
   * @returns {Promise} promise if no callback
   */
  this.connect = callback => {
    switch (_status) {
      case Status.NOT_CONNECTED:
        _status = Status.CONNECTING;
        if (callback) {
          _registerHandshakeCmd(callback, callback);
          break;
        }
        return new Promise(function(resolve, reject) {
          _registerHandshakeCmd(resolve, reject);
        });

        break;

      case Status.CLOSING:
      case Status.CLOSED:
        const err = Errors.createError(
          "Connection closed",
          true,
          info,
          "08S01",
          Errors.ER_CONNECTION_ALREADY_CLOSED
        );
        if (callback) return callback(err);
        return Promise.reject(err);

      case Status.CONNECTING:
      case Status.AUTHENTICATING:
        const errConnecting = Errors.createError(
          "Connection is already connecting",
          true,
          info,
          "08S01",
          Errors.ER_ALREADY_CONNECTING
        );
        if (callback) return callback(errConnecting);
        return Promise.reject(errConnecting);

      case Status.CONNECTED:
        if (callback) callback();
        return Promise.resolve();
    }
  };

  /**
   * Permit to change user during connection.
   * All user variables will be reset, Prepare commands will be released.
   * !!! mysql has a bug when CONNECT_ATTRS capability is set, that is default !!!!
   *
   * @param options   connection options
   * @param callback  callback function
   */
  this.changeUser = (options, callback) => {
    if (!this.isMariaDB()) {
      const err = Errors.createError(
        "method changeUser not available for MySQL server due to Bug #83472",
        false,
        info,
        "0A000",
        Errors.ER_MYSQL_CHANGE_USER_BUG
      );
      if (callback) {
        callback(err);
        return;
      }
      throw err;
    }
    let _options, _cb;
    if (typeof options === "function") {
      _cb = options;
      _options = undefined;
    } else {
      _options = options;
      _cb = callback;
    }

    const _changeUserEnd = err => {
      if (_cb) process.nextTick(_cb, err);
      if (err) _fatalError(err, true);
    };

    const cmd = new ChangeUser(_options, _changeUserEnd);
    return _addCommand(cmd);
  };

  /**
   * Start transaction
   *
   * @param options   query option
   * @param callback  callback function
   * @returns {*} command
   */
  this.beginTransaction = (options, callback) => {
    if (!options) {
      return this.query("START TRANSACTION", callback);
    }

    if (!callback && typeof options === "function") {
      return this.query("START TRANSACTION", options);
    }

    options.sql = "START TRANSACTION";
    return this.query(options, callback);
  };

  /**
   * Commit a transaction.
   *
   * @param options   query option
   * @param callback  callback function
   * @returns {*} command if commit was needed only
   */
  this.commit = (options, callback) => {
    return _changeTransaction(options, callback, "COMMIT");
  };

  /**
   * Roll back a transaction.
   *
   * @param options   query option
   * @param callback  callback function
   * @returns {*} command if commit was needed only
   */
  this.rollback = (options, callback) => {
    return _changeTransaction(options, callback, "ROLLBACK");
  };

  /**
   * Execute query using binary protocol.
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  object / array of placeholder values (not mandatory)
   * @param cb      function that will be called after reception of error/results.
   */
  this.execute = (sql, values, cb) => {
    //TODO implement
    //temporary use query
    return this.query(sql, values, cb);
  };

  /**
   * Execute query using text protocol.
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  object / array of placeholder values (not mandatory)
   * @param cb      function that will be called after reception of error/results.
   */
  this.query = (sql, values, cb) => {
    let _options, _sql, _values, _cb;
    if (typeof sql === "object") {
      _options = sql;
      _sql = _options.sql;
    } else {
      _sql = sql;
    }

    if (typeof values === "function") {
      _cb = values;
    } else if (values !== undefined) {
      _values = values;
      _cb = cb;
    }

    const cmd = new Query(_options, _sql, _values, _cb);
    if (opts.trace) Error.captureStackTrace(cmd);
    return _addCommand(cmd);
  };

  /**
   * Send an empty MySQL packet to ensure connection is active, and reset @@wait_timeout
   *
   * @param options   connection options
   * @param callback  callback function
   */
  this.ping = (options, callback) => {
    const _cb = typeof options === "function" ? options : callback;
    return _addCommand(new Ping(_cb));
  };

  /**
   * Check that connection is valid without sending a mysql packet to server.
   * @returns {boolean|*}
   */
  this.isValid = () => {
    //authentication not terminated
    if (_status === Status.CONNECTED) return true;

    return false;
  };

  /**
   * Terminate connection gracefully.
   *
   * @param callback when done
   * @returns {Promise} promise when no callback
   */
  this.end = callback => {
    _addCommand = _addCommandDisabled;
    if (_status === Status.CONNECTING || _status === Status.CONNECTED) {
      _status = Status.CLOSING;
      let quitCmd;
      let promise;
      if (callback) {
        quitCmd = new Quit(() => {
          let sock = _socket;
          _clear();
          _status = Status.CLOSED;
          setImmediate(callback);
          sock.destroy();
        });
      } else {
        promise = new Promise(function(resolve, reject) {
          quitCmd = new Quit(() => {
            let sock = _socket;
            _clear();
            _status = Status.CLOSED;
            setImmediate(resolve);
            sock.destroy();
          });
        });
      }
      _sendQueue.push(quitCmd);
      _receiveQueue.push(quitCmd);
      if (_sendQueue.length === 1) {
        process.nextTick(_nextSendCmd.bind(this));
      }
      return promise;
    }
    return Promise.resolve();
  };

  /**
   * Force connection termination by closing the underlying socket and killing server process if any.
   */
  this.destroy = () => {
    _addCommand = _addCommandDisabled;
    if (_status !== Status.CLOSING && _status != Status.CLOSED) {
      _status = Status.CLOSING;
      _sendQueue.clear();
      if (_receiveQueue.length > 0) {
        //socket is closed, but server may still be processing a huge select
        //only possibility is to kill process by another thread
        //TODO reuse a pool connection to avoid connection creation
        const killCon = new Connection(opts);
        killCon.connect(() => {
          killCon.query("KILL " + info.threadId, () => {
            const err = Errors.createError(
              "Connection destroyed, command was killed",
              true,
              info,
              "08S01",
              Errors.ER_CMD_NOT_EXECUTED_DESTROYED
            );
            let receiveCmd;
            while ((receiveCmd = _receiveQueue.shift())) {
              if (receiveCmd.onPacketReceive) {
                if (receiveCmd.onResult) {
                  receiveCmd.onResult(err);
                } else {
                  receiveCmd.emit("error", err);
                }
              }
            }
            process.nextTick(() => {
              if (_socket) _socket.destroy();
            });
            _status = Status.CLOSED;
            killCon.end();
          });
        });
      } else {
        _status = Status.CLOSED;
        _socket.destroy();
      }
    }
    _clear();
  };

  this.pause = () => {
    //TODO
  };

  this.resume = () => {
    //TODO
  };

  this.escape = value => {
    throw Errors.createError(
      '"Connection.escape intentionally not implemented. please use Connection.query(sql, values), it will be more secure and faster',
      false,
      info,
      "0A000",
      Errors.ER_NOT_IMPLEMENTED_ESCAPE
    );
  };

  this.escapeId = value => {
    throw Errors.createError(
      '"Connection.escapeId intentionally not implemented. please use Connection.query(sql, values), it will be more secure and faster',
      false,
      info,
      "0A000",
      Errors.ER_NOT_IMPLEMENTED_ESCAPEID
    );
  };

  this.format = (sql, values) => {
    throw Errors.createError(
      '"Connection.format intentionally not implemented. please use Connection.query(sql, values), it will be more secure and faster',
      false,
      info,
      "0A000",
      Errors.ER_NOT_IMPLEMENTED_FORMAT
    );
  };

  //*****************************************************************
  // additional public methods
  //*****************************************************************

  /**
   * return current connected server version information.
   *
   * @returns {*}
   */
  this.serverVersion = () => {
    return info.getServerVersion();
  };

  this.isMariaDB = () => {
    return info.isMariaDB();
  };

  this.hasMinVersion = (major, minor, patch) => {
    return info.hasMinVersion(major, minor, patch);
  };

  /**
   * Change option "debug" during connection.
   * @param val   debug value
   */
  this.debug = val => {
    if (opts.compress) {
      opts.debugCompress = val;
      opts.debug = false;
    } else {
      opts.debugCompress = false;
      opts.debug = val;
    }
  };

  //*****************************************************************
  // internal public testing methods
  //*****************************************************************
  function TestMethods() {}
  TestMethods.prototype.getCollation = () => {
    return opts.collation;
  };

  TestMethods.prototype.getSocket = () => {
    return _socket;
  };

  TestMethods.prototype.getInfo = () => {
    return info;
  };

  this.__tests = new TestMethods();

  //*****************************************************************
  // internal methods
  //*****************************************************************

  /**
   * Add handshake command to queue.
   *
   * @private
   */
  const _registerHandshakeCmd = (resolve, rejected) => {
    var authenticationHandler = _authenticationEnd.bind(this, resolve, rejected);

    const handshake = new Handshake(
      authenticationHandler,
      _createSecureContext.bind(this, rejected),
      _addCommand.bind(this),
      _getSocket
    );
    Error.captureStackTrace(handshake);

    handshake.once("end", () => {
      setImmediate(_nextSendCmd);
    });

    _receiveQueue.push(handshake);
    _initSocket(authenticationHandler, rejected);
  };

  const _getSocket = () => {
    return _socket;
  };

  /**
   * Initialize socket and associate events.
   * @private
   */
  const _initSocket = (authenticationHandler, rejected) => {
    if (opts.socketPath) {
      _socket = Net.connect(opts.socketPath);
    } else {
      _socket = Net.connect(opts.port, opts.host);
    }

    if (opts.connectTimeout) {
      _socket.setTimeout(
        opts.connectTimeout,
        _connectTimeoutReached.bind(this, authenticationHandler)
      );
    }

    const _socketError = _socketErrorHandler.bind(this, rejected);

    _socket.on("data", _in.onData.bind(_in));
    _socket.on("error", _socketError);
    _socket.on("end", _socketError);
    _socket.on("timeout", _socketError);
    _socket.on("connect", () => {
      _status = Status.AUTHENTICATING;
      _socketConnected = true;
      _socket.setTimeout(
        opts.socketTimeout,
        _socketTimeoutReached.bind(this, authenticationHandler)
      );
      _socket.setNoDelay(true);
    });

    _socket.writeBuf = _socket.write;
    _socket.flush = () => {};
    _out.setStream(_socket);
  };

  /**
   * Authentication result handler.
   *
   * @private
   */
  const _authenticationEnd = (resolve, reject, err) => {
    if (err) {
      process.nextTick(reject, err);
      //remove handshake command
      _receiveQueue.shift();

      _fatalError(err, true);
    } else {
      //enable packet compression according to option
      if (opts.compress) {
        _out.setStream(new CompressionOutputStream(_socket, opts, info));
        _in = new CompressionInputStream(_in, _receiveQueue, opts, info);
        _socket.removeAllListeners("data");
        _socket.on("data", _in.onData.bind(_in));

        opts.debugCompress = opts.debug;
        opts.debug = false;
      }

      if (opts.pipelining) _addCommand = _addCommandEnablePipeline;
      process.nextTick(resolve);
      _status = Status.CONNECTED;
    }
  };

  /**
   * Create TLS socket and associate events.
   *
   * @param callback  callback function when done
   * @private
   */
  const _createSecureContext = (rejected, callback) => {
    if (!tls.connect) {
      _fatalError(
        Errors.createError(
          "TLS connection required Node.js 0.11.3+",
          true,
          info,
          "42000",
          Errors.ER_NODE_NOT_SUPPORTED_TLS
        )
      );
    }

    const _socketError = _socketErrorHandler.bind(this, rejected);

    const sslOption = Object.assign({}, opts.ssl, {
      servername: opts.host,
      socket: _socket
    });
    try {
      const secureSocket = tls.connect(sslOption, callback);

      secureSocket.on("data", _in.onData.bind(_in));
      secureSocket.on("error", _socketError);
      secureSocket.on("end", _socketError);
      secureSocket.on("timeout", _socketError);
      secureSocket.writeBuf = secureSocket.write;
      secureSocket.flush = () => {};

      _socket.removeAllListeners("data");
      _socket = secureSocket;

      _out.setStream(secureSocket);
    } catch (err) {
      _socketError(err);
    }
  };

  /**
   * Handle packet when no packet is expected.
   * (there can be an ERROR packet send by server/proxy to inform that connection is ending).
   *
   * @param packet  packet
   * @private
   */
  const _unexpectedPacket = function(packet) {
    if (packet && packet.peek() === 0xff) {
      //can receive unexpected error packet from server/proxy
      //to inform that connection is closed (usually by timeout)
      let err = packet.readError(info);
      if (err.fatal) {
        this.emit("error", err);
        end();
      }
    } else if (_status !== Status.CLOSING && _status !== Status.CLOSED) {
      let err = Errors.createError(
        "receiving packet from server without active commands\n" +
          "conn:" +
          (info.threadId ? info.threadId : -1) +
          "(" +
          packet.pos +
          "," +
          packet.end +
          ")\n" +
          Utils.log(opts, packet.buf, packet.pos, packet.end),
        true,
        info,
        "08S01",
        Errors.ER_UNEXPECTED_PACKET
      );
      this.emit("error", err);
      end();
    }
  };

  /**
   * Change transaction state.
   *
   * @param options     connection options
   * @param callback    callback function
   * @param sql         command
   * @returns {command} null or current command
   * @private
   */
  const _changeTransaction = (options, callback, sql) => {
    let _options, _cb;

    if (typeof options === "function") {
      _cb = options;
      _options = null;
    } else {
      _options = options;
      _cb = callback;
    }

    //if command in progress, driver cannot rely on status and must execute query
    let cmdReceive;
    while ((cmdReceive = _receiveQueue.peek())) {
      if (cmdReceive.onPacketReceive) {
        const cmd = new Query(_options, sql, null, _cb);
        if (opts.trace) Error.captureStackTrace(cmd);
        return _addCommand(cmd);
      }
      _receiveQueue.shift();
    }

    //no command in progress, rely on status to know if query is needed
    if (
      !(info.status & ServerStatus.STATUS_AUTOCOMMIT) &&
      info.status & ServerStatus.STATUS_IN_TRANS
    ) {
      const cmd = new Query(_options, sql, null, _cb);
      if (opts.trace) Error.captureStackTrace(cmd);
      return _addCommand(cmd);
    }

    if (_cb) _cb();
    return null;
  };

  /**
   * Handle connection timeout.
   *
   * @private
   */
  const _connectTimeoutReached = function(authenticationHandler) {
    const handshake = _receiveQueue.peek();
    authenticationHandler(
      Errors.createError(
        "Connection timeout",
        true,
        info,
        "08S01",
        Errors.ER_CONNECTION_TIMEOUT,
        handshake ? handshake.stack : null
      )
    );
  };

  /**
   * Handle socket timeout.
   *
   * @private
   */
  const _socketTimeoutReached = function() {
    _status = Status.CLOSED;
    _socket.destroy && _socket.destroy();
    _receiveQueue.shift(); //remove handshake packet
    const err = Errors.createError("socket timeout", true, info, "08S01", Errors.ER_SOCKET_TIMEOUT);
    _fatalError(err, true);
  };

  /**
   * Add command to command sending and receiving queue.
   *
   * @param cmd         command
   * @returns {*}       current command
   * @private
   */
  const _addCommandEnable = cmd => {
    cmd.once("end", () => {
      setImmediate(_nextSendCmd);
    });

    //send immediately only if no current active receiver
    if (_sendQueue.isEmpty() && _status === Status.CONNECTED) {
      let cmdReceive;
      while ((cmdReceive = _receiveQueue.peek())) {
        if (cmdReceive.onPacketReceive) {
          _receiveQueue.push(cmd);
          _sendQueue.push(cmd);
          return cmd;
        }
        _receiveQueue.shift();
      }

      _receiveQueue.push(cmd);
      cmd.init(_out, opts, info);
    } else {
      _receiveQueue.push(cmd);
      _sendQueue.push(cmd);
    }
    return cmd;
  };

  /**
   * Add command to command sending and receiving queue using pipelining
   *
   * @param cmd         command
   * @returns {*}       current command
   * @private
   */
  const _addCommandEnablePipeline = cmd => {
    cmd.once("send_end", () => {
      setImmediate(_nextSendCmd);
    });

    _receiveQueue.push(cmd);
    if (_sendQueue.isEmpty() && _status === Status.CONNECTED) {
      cmd.init(_out, opts, info);
    } else {
      _sendQueue.push(cmd);
    }
    return cmd;
  };

  /**
   * Replacing command when connection is closing or closed to send a proper error message.
   *
   * @param cmd         command
   * @private
   */
  const _addCommandDisabled = cmd => {
    const err = Errors.createError(
      "Cannot execute new commands: connection closed\n" + cmd.displaySql(),
      true,
      info,
      "08S01",
      Errors.ER_CMD_CONNECTION_CLOSED
    );
    if (cmd.onResult) {
      cmd.onResult(err);
    } else cmd.emit("error", err);
  };

  /**
   * Handle socket error.
   *
   * @param self
   * @returns {Function} socket error handle
   * @private
   */
  const _socketErrorHandler = function(reject, err) {
    switch (_status) {
      case Status.AUTHENTICATING:
        _authenticationEnd(null, reject, err);
        break;

      case Status.CLOSING:
      case Status.CLOSED:
        //already handled
        break;

      default:
        //avoid sending new data in closed socket
        _socket.writeBuf = () => {};
        _socket.flush = () => {};

        //socket has been ended without error
        if (!err) {
          if (_socketConnected) {
            err = Errors.createError(
              "socket has unexpectedly been closed",
              true,
              info,
              "08S01",
              Errors.ER_SOCKET_UNEXPECTED_CLOSE
            );
          } else {
            err = Errors.createError(
              "socket connection failed to established",
              true,
              info,
              "08S01",
              Errors.ER_SOCKET_CREATION_FAIL
            );
          }
        }

        //socket fail between socket creation and before authentication
        if (_status === Status.CONNECTING) process.nextTick(reject, err);

        _fatalError(err, false);
    }
  };

  /**
   * Fatal unexpected error : closing connection, and throw exception.
   *
   * @param self
   * @returns {Function} fatal error function
   * @private
   */
  const _fatalErrorHandler = function(self) {
    return function(err, avoidThrowError) {
      if (_status === Status.CLOSING || _status === Status.CLOSED) return;
      const mustThrowError = _status !== Status.CONNECTING;
      _status = Status.CLOSING;

      //prevent executing new commands
      _addCommand = _addCommandDisabled;

      if (_socket) {
        _socket.removeAllListeners("error");
        _socket.removeAllListeners("timeout");
        _socket.removeAllListeners("close");
        _socket.removeAllListeners("data");
        _socket.destroy();
        _socket = undefined;
      }
      _status = Status.CLOSED;

      let receiveCmd;
      let errorThrownByCmd = false;
      while ((receiveCmd = _receiveQueue.shift())) {
        if (receiveCmd && receiveCmd.onPacketReceive) {
          errorThrownByCmd = true;
          process.nextTick(receiveCmd.throwError.bind(receiveCmd), err);
        }
      }
      if (mustThrowError) {
        //TODO to be removed when all use promise
        if (self.listenerCount("error") > 0) {
          self.emit("error", err);
          self.emit("end");
          _clear();
        } else {
          self.emit("end");
          _clear();
          //error will be thrown if no error listener and no command did throw the exception
          if (!avoidThrowError && !errorThrownByCmd) throw err;
        }
      }
    };
  };

  /**
   * Will send next command in queue if any.
   *
   * @private
   */
  const _nextSendCmd = () => {
    let sendCmd;
    if ((sendCmd = _sendQueue.shift())) {
      sendCmd.init(_out, opts, info);
    }
  };

  /**
   * Clearing connection variables when ending.
   *
   * @private
   */
  const _clear = () => {
    _sendQueue.clear();
    _out = undefined;
    _socket = undefined;
  };

  //*****************************************************************
  // internal variables
  //*****************************************************************

  EventEmitter.call(this);
  const opts = Object.assign({}, options);
  const info = new ConnectionInformation();
  const _sendQueue = new Queue();
  const _receiveQueue = new Queue();
  const _fatalError = _fatalErrorHandler(this);
  let _status = Status.NOT_CONNECTED;
  let _socketConnected = false;
  let _socket = null;
  let _addCommand = _addCommandEnable;
  let _out = new PacketOutputStream(opts, info);
  let _in = new PacketInputStream(_unexpectedPacket.bind(this), _receiveQueue, _out, opts, info);

  //add alias threadId for mysql/mysql2 compatibility
  Object.defineProperty(this, "threadId", {
    get() {
      return info ? info.threadId : undefined;
    }
  });
}

util.inherits(Connection, EventEmitter);

module.exports = Connection;
