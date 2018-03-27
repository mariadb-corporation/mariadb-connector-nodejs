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
    this._sendCmd = null;
    this._sendQueue = new Queue();
    this._receiveCmd = null;
    this._receiveQueue = new Queue();

    this._out = new PacketOutputStream(this.opts, this.info);
    this._addCommand = this._addCommandEnable;
    this._addCommand(new Handshake(this), false);

    this.timeoutRef = null;
    this._closing = null;
    this._connected = null;
    this._socket = null;

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

    if (this._connected) {
      callback(null);
    } else {
      this._events.once(
        "connect",
        function() {
          this._connected = true;
          setImmediate(callback, null);
        }.bind(this)
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
      _values = !Array.isArray(values) ? [values] : values;
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
    if (this._receiveCmd || this._receiveQueue.length > 0) {
      //socket is closed, but server may still be processing a huge select
      //only possibility is to kill process by another thread
      //TODO reuse a pool connection to avoid connection creation
      const self = this;
      const killCon = new Connection(this.opts);
      killCon.query("KILL " + this.info.threadId, () => {
        const err = Utils.createError("Connection destroyed, command was killed", true, self.info);
        if (!this._receiveCmd || !this._receiveCmd.onPacketReceive) {
          while (
            (this._receiveCmd = this._receiveQueue.shift()) &&
            !this._receiveCmd.onPacketReceive
          );
        }

        if (self._receiveCmd && self._receiveCmd.onPacketReceive) {
          if (self._receiveCmd.onResult) {
            self._receiveCmd.onResult(err);
          } else {
            self._receiveCmd.emit("error", err);
          }
        }
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

  //*****************************************************************
  // internal methods
  //*****************************************************************

  _initSocket() {
    if (this.opts.connectTimeout) {
      this.timeoutRef = setTimeout(
        this._connectTimeoutReached.bind(this),
        this.opts.connectTimeout
      );
    }

    this._events.once(
      "connect",
      function() {
        this._connected = true;
        this._clearConnectTimeout();
      }.bind(this)
    );

    if (this.opts.socketPath) {
      this._socket = Net.connect(this.opts.socketPath);
    } else {
      this._socket = Net.connect(this.opts.port, this.opts.host);
    }

    let packetInputStream = new PacketInputStream(this._dispatchPacket.bind(this));
    this._socket.on("error", this._socketError.bind(this));
    this._socket.on("data", chunk => packetInputStream.onData(chunk));
    this._events.on("server_error", err => {
      this._fatalError.call(this, err);
    });
    this._events.on(
      "collation_changed",
      function() {
        this._out = new PacketOutputStream(this.opts, this.info);
        this._out.setWriter(buffer => this._socket.write(buffer));
      }.bind(this)
    );
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
    if (!this._closing) {
      this._fatalError(err);
    }
  }

  _dispatchPacket(packet, header) {
    if (!this._receiveCmd || !this._receiveCmd.onPacketReceive) {
      while ((this._receiveCmd = this._receiveQueue.shift()) && !this._receiveCmd.onPacketReceive);
    }

    if (this.opts.debug && packet && this._receiveCmd) {
      console.log(
        "<== conn:%d %s (%d,%d)\n%s",
        this.info.threadId ? this.info.threadId : -1,
        this._receiveCmd.onPacketReceive
          ? this._receiveCmd.constructor.name + "." + this._receiveCmd.onPacketReceive.name
          : this._receiveCmd.constructor.name,
        packet.off,
        packet.end,
        Utils.log(packet.buf, packet.off, packet.end, header)
      );
    }

    if (this._receiveCmd) {
      this._receiveCmd.handle(packet, this._out, this.opts, this.info);
      return;
    }

    if (packet && packet.peek() === 0xff) {
      //can receive unexpected error packet from server/proxy
      //to inform that connection is closed (usually by timeout)
      let err = packet.readError(this.info);
      if (err.fatal) {
        this._events.emit("error", err);
        this.close();
      }
    } else {
      let err = Utils.createError(
        "receiving packet from server without active commands",
        true,
        this.info
      );
      this._events.emit("error", err);
      this.close();
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
        conn._nextReceiveCmd();
        setImmediate(conn._nextSendCmd.bind(conn));
      });
    }

    if (!this._sendCmd && this._sendQueue.isEmpty()) {
      this._sendCmd = cmd;
      this._receiveQueue.push(cmd);
      this._sendCmd.init(this._out, this.opts, this.info);
    } else {
      this._sendQueue.push(cmd);
      this._receiveQueue.push(cmd);
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
    err.fatal = true;
    //prevent any new action
    this._addCommand = this._addCommandDisabled;
    //disabled events
    this._socket.destroy();
    this._closing = true;

    if (this._receiveCmd && this._receiveCmd.onPacketReceive && this._receiveCmd.onResult) {
      setImmediate(this._receiveCmd.onResult, err);
    }

    let receiveCmd;
    while ((receiveCmd = this._receiveQueue.shift())) {
      if (receiveCmd.onPacketReceive && receiveCmd.onResult) {
        setImmediate(receiveCmd.onResult, err);
      }
    }

    this._events.emit("error", err);
    this._events.emit("end");

    this._clear();
  }

  _nextSendCmd() {
    if ((this._sendCmd = this._sendQueue.shift())) {
      this._sendCmd.init(this._out, this.opts, this.info);
    }
  }

  _nextReceiveCmd() {
    this._receiveCmd = this._receiveQueue.shift();
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
