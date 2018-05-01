"use strict";

const EventEmitter = require("events");
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

function Connection(options) {
  //*****************************************************************
  // public API methods from mysql/mysql2 drivers from compatibility
  //*****************************************************************

  /**
   * Connect event with callback.
   *
   * @param callback(error)
   *
   */
  this.connect = callback => {
    if (!callback) return;

    if (_closing) {
      callback(
        Errors.createError(
          "Connection closed",
          true,
          info,
          "08S01",
          Errors.ER_CONNECTION_ALREADY_CLOSED
        )
      );
      return;
    }

    if (_connected === null) {
      _onConnect = callback;
    } else {
      callback(
        _connected
          ? null
          : Errors.createError(
              "Connection has already failed to connect",
              true,
              info,
              "08S01",
              Errors.ER_CONNECT_AFTER_CONNECTION_ERR
            )
      );
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

    const cmd = new ChangeUser(_events, _options, _cb);
    return _addCommand(cmd, false);
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
    let _pipelining = opts.pipelining;
    if (typeof sql === "object") {
      _options = sql;
      _sql = _options.sql;
      if (_options.pipelining !== undefined) _pipelining = _options.pipelining;
    } else {
      _sql = sql;
    }

    if (typeof values === "function") {
      _cb = values;
    } else if (values !== undefined) {
      _values = values;
      _cb = cb;
    }

    const cmd = new Query(_events, _options, _sql, _values, _cb);
    return _addCommand(cmd, _pipelining);
  };

  /**
   * Send an empty MySQL packet to ensure connection is active, and reset @@wait_timeout
   *
   * @param options   connection options
   * @param callback  callback function
   */
  this.ping = (options, callback) => {
    const _cb = typeof options === "function" ? options : callback;
    return _addCommand(new Ping(_events, _cb), false);
  };

  /**
   * Terminate connection gracefully.
   *
   * @param callback when done
   * @returns {*} quit command
   */
  this.end = callback => {
    _addCommand = _addCommandDisabled;
    if (!_closing) {
      _closing = true;
      const cmd = new Quit(_events, () => {
        let sock = _socket;
        _clear();
        _connected = false;
        if (callback) setImmediate(callback);
        sock.destroy();
      });
      _sendQueue.push(cmd);
      _receiveQueue.push(cmd);
      if (_sendQueue.length === 1) {
        process.nextTick(_nextSendCmd.bind(this));
      }
    }
  };

  /**
   * Force connection termination by closing the underlying socket and killing server process if any.
   */
  this.destroy = () => {
    _addCommand = _addCommandDisabled;
    _closing = true;
    _sendQueue.clear();
    if (_receiveQueue.length > 0) {
      //socket is closed, but server may still be processing a huge select
      //only possibility is to kill process by another thread
      //TODO reuse a pool connection to avoid connection creation
      const killCon = new Connection(opts);
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
        killCon.end();
      });
    } else {
      _socket.destroy();
    }
    _clear();
  };

  this.pause = () => {
    //TODO
  };

  this.resume = () => {
    //TODO
  };

  this.on = (eventName, listener) => {
    _events.on(eventName, listener);
  };

  this.once = (eventName, listener) => {
    _events.once(eventName, listener);
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
   * Default method called when connection is established (socket + authentication)
   *
   * @param err error if any
   * @private
   */
  const _defaultOnConnect = err => {
    if (err && _events.listenerCount("error") === 0) {
      throw err;
    }
  };

  /**
   * Register connection events.
   *
   * @private
   */
  const _registerEvents = () => {
    _events.once("connect", err => {
      process.nextTick(_onConnect, err);
    });

    _events.on("collation_changed", () => {
      const stream = _out.getStream();
      _out = new PacketOutputStream(opts, info);
      _out.setStream(stream);
    });
  };

  /**
   * Add handshake command to queue.
   *
   * @private
   */
  const _registerHandshakeCmd = () => {
    const handshake = new Handshake(
      _events,
      _succeedAuthentication.bind(this),
      _createSecureContext.bind(this),
      _addCommand.bind(this),
      err => {
        _connected = !err;
        _events.emit("connect", err);
        if (err) _fatalError(err, true);
      }
    );
    _addCommand(handshake, false);
  };

  /**
   * Initialize socket and associate events.
   * @private
   */
  const _initSocket = () => {
    if (opts.socketPath) {
      _socket = Net.connect(opts.socketPath);
    } else {
      _socket = Net.connect(opts.port, opts.host);
    }

    if (opts.connectTimeout) {
      _socket.setTimeout(opts.connectTimeout, _connectTimeoutReached.bind(this));
    }

    _socket.on("data", _in.onData.bind(_in));
    _socket.on("error", _socketError);
    _socket.on("end", _socketError);
    _socket.on("timeout", _socketError);
    _socket.on("connect", () => {
      _socketConnected = true;
      _socket.setTimeout(opts.socketTimeout, _socketTimeoutReached.bind(this));
      _socket.setNoDelay(true);
    });

    _socket.writeBuf = _socket.write;
    _socket.flush = () => {};
    _out.setStream(_socket);
  };

  /**
   * Authentication succeed methods called by handshake to permit activating compression filter.
   *
   * @private
   */
  const _succeedAuthentication = () => {
    if (opts.compress) {
      _out.setStream(new CompressionOutputStream(_socket, opts, info));
      _in = new CompressionInputStream(_in, _receiveQueue, opts, info);
      _socket.removeAllListeners("data");
      _socket.on("data", _in.onData.bind(_in));

      opts.debugCompress = opts.debug;
      opts.debug = false;
    }
  };

  /**
   * Create TLS socket and associate events.
   *
   * @param callback  callback function when done
   * @private
   */
  const _createSecureContext = callback => {
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

    const sslOption = Object.assign({}, opts.ssl, {
      servername: opts.host,
      socket: _socket
    });
    try {
      const secureSocket = tls.connect(sslOption, err => {
        _events.emit("secureConnect");
        callback();
      });

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
   * Handle socket error.
   *
   * @param err   error
   * @private
   */
  const _socketError = err => {
    //socket closed was expected
    if (_closing) return;

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
    if (_connected === null) {
      _connected = false;
      _events.emit("connect", err);
    }

    _fatalError(err, false);
  };

  /**
   * Handle packet when no packet is expected.
   * (there can be an ERROR packet send by server/proxy to inform that connection is ending).
   *
   * @param packet  packet
   * @private
   */
  const _unexpectedPacket = packet => {
    if (packet && packet.peek() === 0xff) {
      //can receive unexpected error packet from server/proxy
      //to inform that connection is closed (usually by timeout)
      let err = packet.readError(info);
      if (err.fatal) {
        _events.emit("error", err);
        end();
      }
    } else if (!_closing) {
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
      _events.emit("error", err);
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

    //TODO ensure that due to node.js threading system, there can't be race condition on status value
    //TODO i.e. if possible race condition, just emit command every time.
    if (
      !(info.status & ServerStatus.STATUS_AUTOCOMMIT) &&
      info.status & ServerStatus.STATUS_IN_TRANS
    ) {
      const cmd = new Query(_events, _options, sql, null, _cb);
      return _addCommand(cmd, false);
    }

    if (_cb) _cb();
    return null;
  };

  /**
   * Handle connection timeout.
   *
   * @private
   */
  const _connectTimeoutReached = () => {
    _connected = false;
    _socket.destroy && _socket.destroy();
    _receiveQueue.shift(); //remove handshake packet
    const err = Errors.createError(
      "Connection timeout",
      true,
      info,
      "08S01",
      Errors.ER_CONNECTION_TIMEOUT
    );
    _events.emit("connect", err);
    _fatalError(err, true);
  };

  /**
   * Handle socket timeout.
   *
   * @private
   */
  const _socketTimeoutReached = () => {
    _connected = false;
    _socket.destroy && _socket.destroy();
    _receiveQueue.shift(); //remove handshake packet
    const err = Errors.createError("socket timeout", true, info, "08S01", Errors.ER_SOCKET_TIMEOUT);
    _events.emit("connect", err);
    _fatalError(err, true);
  };

  /**
   * Add command to command sending and receiving queue.
   *
   * @param cmd         command
   * @param pipelining  can use pipeline
   * @returns {*}       current command
   * @private
   */
  const _addCommandEnable = (cmd, pipelining) => {
    if (pipelining) {
      cmd.once("send_end", () => setImmediate(_nextSendCmd));
    } else {
      cmd.once("end", () => {
        setImmediate(_nextSendCmd);
      });
    }

    _sendQueue.push(cmd);
    _receiveQueue.push(cmd);
    if (_sendQueue.length === 1) {
      process.nextTick(_nextSendCmd);
    }
    return cmd;
  };

  /**
   * Replacing command when connection is closing or closed to send a proper error message.
   *
   * @param cmd         command
   * @param pipelining  can use pipeline
   * @private
   */
  const _addCommandDisabled = (cmd, pipelining) => {
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
   * Fatal unexpected error : closing connection, and throw exception.
   *
   * @param err               error
   * @param avoidThrowError   if not listener on error is registered, must throw error
   * @private
   */
  const _fatalError = (err, avoidThrowError) => {
    if (_closing) return;
    _closing = true;

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

    let receiveCmd;
    let errorThrownByCmd = false;
    while ((receiveCmd = _receiveQueue.shift())) {
      if (receiveCmd && receiveCmd.onPacketReceive) {
        errorThrownByCmd = true;
        process.nextTick(receiveCmd.throwError.bind(receiveCmd), err);
      }
    }

    if (_events.listenerCount("error") > 0) {
      _events.emit("error", err);
      _events.emit("end");
      _clear();
    } else {
      _events.emit("end");
      _clear();
      //error will be thrown if no error listener and no command did throw the exception
      if (!avoidThrowError && !errorThrownByCmd) throw err;
    }
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

  const opts = Object.assign({}, options);
  const info = new ConnectionInformation();
  const _events = new EventEmitter();
  const _sendQueue = new Queue();
  const _receiveQueue = new Queue();

  let _onConnect = _defaultOnConnect;
  let _closing = null;
  let _connected = null;
  let _socketConnected = false;
  let _socket = null;
  let _addCommand = _addCommandEnable;
  let _out = new PacketOutputStream(opts, info);
  let _in = new PacketInputStream(_unexpectedPacket, _receiveQueue, _out, opts, info);

  _registerEvents();
  _registerHandshakeCmd();
  _initSocket();

  //add alias threadId for mysql/mysql2 compatibility
  Object.defineProperty(this, "threadId", {
    get() {
      return info ? info.threadId : undefined;
    }
  });
}

module.exports = Connection;
