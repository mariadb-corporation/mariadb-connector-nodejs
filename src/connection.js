"use strict";

const EventEmitter = require("events");
const Queue = require("denque");
const Net = require("net");
const PacketInputStream = require("./io/packet_input_stream");
const PacketOutputStream = require("./io/packet_output_stream");
const ServerStatus = require("./const/server-status");
const ConnectionInformation = require("./misc/connection-information");
const tls = require("tls");

/*commands*/
const Handshake = require("./cmd/handshake/handshake");
const Quit = require("./cmd/quit");
const Ping = require("./cmd/ping");
const Utils = require("./misc/utils");
const Query = require("./cmd/query");

class Connection {
  constructor(options) {
    //public info
    this.opts = options;
    this.info = new ConnectionInformation();

    //internal
    this._events = new EventEmitter();
    this._sendQueue = new Queue();
    this._receiveQueue = new Queue();

    this._out = new PacketOutputStream(this.opts, this.info);
    this.timeoutRef = null;
    this._closing = null;
    this._connected = null;
    this._socket = null;
    this._addCommand = this._addCommandEnable;
    this._registerEvents();
    this._registerHandshakeCmd();
    this._initSocket();

    Object.defineProperty(this, "threadId", {
      get() {
        return this.info ? this.info.threadId : undefined;
      }
    });
  }

  //*****************************************************************
  // API methods from mysql/mysql2 drivers from compatibility
  //*****************************************************************

  /**
   * Connect event with callback.
   *
   * @param callback(error)
   *
   */
  connect(callback) {
    if (!callback) return;

    if (this._closing) {
      callback(Utils.createError("Connection closed", true, this.info));
      return;
    }

    if (this._connected === null) {
      this._events.once("connect", () => setImmediate(callback, null));
      this._events.once("_connect_err", err => callback(err));
    } else {
      callback(
        this._connected ? null : new Error("Error during connection, error has already been thrown")
      );
    }
  }

  changeUser(options, callback) {
    //TODO
  }

  /**
   * Start transaction
   *
   * @param options   query option
   * @param callback  callback function
   * @returns {*} command
   */
  beginTransaction(options, callback) {
    if (!options) {
      return this.query("START TRANSACTION", callback);
    }

    if (!callback && typeof options === "function") {
      return this.query("START TRANSACTION", options);
    }

    options.sql = "START TRANSACTION";
    return this.query(options, callback);
  }

  /**
   * Commit a transaction.
   *
   * @param options   query option
   * @param callback  callback function
   * @returns {*} command if commit was needed only
   */
  commit(options, callback) {
    return this._changeTransaction(options, callback, "COMMIT");
  }

  /**
   * Roll back a transaction.
   *
   * @param options   query option
   * @param callback  callback function
   * @returns {*} command if commit was needed only
   */
  rollback(options, callback) {
    return this._changeTransaction(options, callback, "ROLLBACK");
  }

  /**
   * Execute query using binary protocol.
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  object / array of placeholder values (not mandatory)
   * @param cb      function that will be called after reception of error/results.
   */
  execute(sql, values, cb) {
    //TODO implement
    //temporary use query
    return this.query(sql, values, cb);
  }

  /**
   * Execute query using text protocol.
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  object / array of placeholder values (not mandatory)
   * @param cb      function that will be called after reception of error/results.
   */
  query(sql, values, cb) {
    let _options, _sql, _values, _cb;
    let _pipelining = this.opts.pipelining;
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

    const cmd = new Query(this._events, _options, _sql, _values, _cb);
    return this._addCommand(cmd, _pipelining);
  }

  ping(options, callback) {
    const _cb = typeof options === "function" ? options : callback;
    return this._addCommand(new Ping(this._events, _cb), false);
  }

  /**
   * Terminate connection gracefully.
   *
   * @param callback when done
   * @returns {*} quit command
   */
  end(callback) {
    this._clearConnectTimeout();
    const currentAddCmd = this._addCommand;
    this._addCommand = this._addCommandDisabled;
    this._closing = true;
    currentAddCmd.call(
      this,
      new Quit(
        this._events,
        function() {
          this._clear();
          if (callback) setImmediate(callback);
        }.bind(this)
      ),
      false
    );
  }

  /**
   * Force connection termination by closing the underlying socket and killing server process if any.
   */
  destroy() {
    this._clearConnectTimeout();
    this._addCommand = this._addCommandDisabled;
    this._closing = true;
    this._sendQueue.clear();
    if (this._receiveQueue.length > 0) {
      //socket is closed, but server may still be processing a huge select
      //only possibility is to kill process by another thread
      //TODO reuse a pool connection to avoid connection creation
      const self = this;
      const killCon = new Connection(this.opts);
      killCon.query("KILL " + this.info.threadId, () => {
        const err = Utils.createError("Connection destroyed, command was killed", true, self.info);
        let receiveCmd;
        while ((receiveCmd = self._receiveQueue.shift())) {
          if (receiveCmd.onPacketReceive) {
            if (receiveCmd.onResult) {
              receiveCmd.onResult(err);
            } else {
              receiveCmd.emit("error", err);
            }
          }
        }
        process.nextTick(() => {
          if (self._socket) self._socket.destroy;
        });
        killCon.end();
      });
    } else {
      this._socket.destroy();
    }
    this._clear();
  }

  pause() {
    //TODO
  }

  resume() {
    //TODO
  }

  on(eventName, listener) {
    this._events.on(eventName, listener);
  }

  once(eventName, listener) {
    this._events.once(eventName, listener);
  }

  escape(value) {
    throw new Error(
      "Connection.escape intentionally not implemented. please use Connection.query(sql, values), it will be more secure and faster"
    );
  }

  escapeId(value) {
    throw new Error(
      "Connection.escapeId intentionally not implemented. please use Connection.query(sql, values), it will be more secure and faster"
    );
  }

  format(sql, values) {
    throw new Error(
      "Connection.format intentionally not implemented. please use Connection.query(sql, values), it will be more secure and faster"
    );
  }

  //*****************************************************************
  // additional public methods
  //*****************************************************************

  serverVersion() {
    return this.info.getServerVersion();
  }

  isMariaDB() {
    return this.info.isMariaDB();
  }

  hasMinVersion(major, minor, patch) {
    return this.info.hasMinVersion(major, minor, patch);
  }

  /**
   * Change option "debug" during connection.
   * @param val   debug value
   */
  debug(val) {
    this.opts.debug = val;
  }

  //*****************************************************************
  // internal methods
  //*****************************************************************
  _registerEvents() {
    this._events.on(
      "collation_changed",
      function() {
        this._out = new PacketOutputStream(this.opts, this.info);
        this._out.setWriter(buffer => this._socket.write(buffer));
      }.bind(this)
    );
  }

  _registerHandshakeCmd() {
    const handshake = new Handshake(
      this,
      function(err) {
        this._clearConnectTimeout();
        if (err) {
          this._connected = false;
          if (this._events.listenerCount("_connect_err") > 0) {
            this._events.emit("_connect_err", err);
          } else {
            this._events.emit("error", err);
          }
        } else {
          this._connected = true;
          this._events.emit("connect");
          this._events.on("_db_fatal_error", err => this._fatalError.call(this, err));
        }
      }.bind(this)
    );
    this._addCommand(handshake, false);
  }

  _initSocket() {
    if (this.opts.connectTimeout) {
      this.timeoutRef = setTimeout(
        this._connectTimeoutReached.bind(this),
        this.opts.connectTimeout
      );
    }

    if (this.opts.socketPath) {
      this._socket = Net.connect(this.opts.socketPath);
    } else {
      this._socket = Net.connect(this.opts.port, this.opts.host);
    }

    let packetInputStream = new PacketInputStream(this._dispatchPacket.bind(this));
    this._socket.on("error", this._socketError.bind(this));
    this._socket.on("data", chunk => packetInputStream.onData(chunk));
    this._out.setWriter(buffer => this._socket.write(buffer));
  }

  _createSecureContext(callback) {
    if (!tls.TLSSocket) {
      this._handleFatalError(
        Utils.createError("TLS connection required Node.js 0.11.4+", true, this.info)
      );
    }

    //TODO add pfx option to pass PKCS12 encoded key
    //TODO add secureProtocol option to permit selecting protocol
    let secureSocket = new tls.TLSSocket(this._socket, {
      rejectUnauthorized: this.opts.ssl ? this.opts.ssl.rejectUnauthorized : false,
      secureContext: tls.createSecureContext(this.opts.ssl)
    });

    let packetInputStream = new PacketInputStream(this);

    let events = this._events;
    secureSocket.on("error", this._socketError.bind(this));
    secureSocket.on("data", chunk => packetInputStream.onData(chunk));
    secureSocket.on("secureConnect", () => {
      events.emit("secureConnect");
      callback();
    });

    this._out.setWriter(buffer => secureSocket.write(buffer));
  }

  _socketError(err) {
    //socket fail between socket creation and before authentication
    if (this._connected === null) {
      this._clearConnectTimeout();
      this._connected = false;
      this._events.emit("_connect_err", err);
      this._events.emit("error", err);
      return;
    }

    this._fatalError(err);
  }

  _dispatchPacket(packet, header) {
    let receiveCmd;
    while ((receiveCmd = this._receiveQueue.peek())) {
      if (receiveCmd.onPacketReceive) break;
      this._receiveQueue.shift();
    }

    if (this.opts.debug && packet) {
      console.log(
        "<== conn:%d %s (%d,%d)\n%s",
        this.info.threadId ? this.info.threadId : -1,
        receiveCmd
          ? receiveCmd.onPacketReceive
            ? receiveCmd.constructor.name + "." + receiveCmd.onPacketReceive.name
            : receiveCmd.constructor.name
          : "no command",
        packet.pos,
        packet.end,
        Utils.log(packet.buf, packet.pos, packet.end, header)
      );
    }

    if (receiveCmd) {
      if (!receiveCmd.handle(packet, this._out, this.opts, this.info)) {
        this._receiveQueue.shift();
      }
      return;
    }

    if (packet && packet.peek() === 0xff) {
      //can receive unexpected error packet from server/proxy
      //to inform that connection is closed (usually by timeout)
      let err = packet.readError(this.info);
      if (err.fatal) {
        this._events.emit("error", err);
        this.end();
      }
    } else if (!this._closing) {
      let err = Utils.createError(
        "receiving packet from server without active commands\n" +
          "conn:" +
          (this.info.threadId ? this.info.threadId : -1) +
          "(" +
          packet.pos +
          "," +
          packet.end +
          ")\n" +
          Utils.log(packet.buf, packet.pos, packet.end, header),
        true,
        this.info
      );
      this._events.emit("error", err);
      this.end();
    }
  }

  _changeTransaction(options, callback, sql) {
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
      !(this.info.status & ServerStatus.STATUS_AUTOCOMMIT) &&
      this.info.status & ServerStatus.STATUS_IN_TRANS
    ) {
      const cmd = new Query(this._events, _options, sql, null, _cb);
      return this._addCommand(cmd, false);
    }

    if (_cb) _cb();
    return null;
  }

  _connectTimeoutReached() {
    this._clearConnectTimeout();
    this._socket.destroy && this._socket.destroy();
    this._receiveQueue.shift(); //remove handshake packet
    const err = Utils.createError("Connection timeout", true, this.info);
    this._fatalError(err);
  }

  _clearConnectTimeout() {
    if (this.timeoutRef) {
      clearTimeout(this.timeoutRef);
      this.timeoutRef = null;
    }
  }

  _addCommandEnable(cmd, pipelining) {
    let conn = this;

    if (pipelining) {
      cmd.once("send_end", () => setImmediate(conn._nextSendCmd.bind(conn)));
    } else {
      cmd.once("end", () => {
        setImmediate(conn._nextSendCmd.bind(conn));
      });
    }

    this._sendQueue.push(cmd);
    this._receiveQueue.push(cmd);
    if (this._sendQueue.length === 1) {
      process.nextTick(conn._nextSendCmd.bind(conn));
    }
    return cmd;
  }

  _addCommandDisabled(cmd, pipelining) {
    const err = Utils.createError(
      "Cannot execute new commands: connection closed\n" + cmd.displaySql(),
      true,
      this.info
    );
    if (cmd.onResult) {
      cmd.onResult(err);
    } else throw err;
  }

  /**
   * Fatal unexpected error : closing connection, and throw exception.
   *
   * @param err error
   * @private
   */
  _fatalError(err) {
    if (this._closing) return;
    this._closing = true;

    err.fatal = true;
    //prevent any new action
    this._addCommand = this._addCommandDisabled;
    //disabled events
    this._socket.destroy();

    let receiveCmd;
    while ((receiveCmd = this._receiveQueue.shift())) {
      if (receiveCmd.onPacketReceive && receiveCmd.onResult) {
        setImmediate(receiveCmd.onResult, err);
      }
    }
    if (this._events.listenerCount("error") > 0) {
      this._events.emit("error", err);
      this._events.emit("end");
      this._clear();
    } else {
      this._events.emit("end");
      this._clear();
      throw err;
    }
  }

  _nextSendCmd() {
    let sendCmd;
    if ((sendCmd = this._sendQueue.shift())) {
      sendCmd.init(this._out, this.opts, this.info);
    }
  }

  _clear() {
    this._clearConnectTimeout();
    this._sendQueue.clear();
    this._out = null;
    this._socket = null;
    this._events.removeAllListeners();
  }
}

module.exports = Connection;
