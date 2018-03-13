"use strict";

const EventEmitter = require("events");
const Queue = require("denque");
const Net = require("net");
const PacketInputStream = require("./io/packet_input_stream");
const PacketOutputStream = require("./io/packet_output_stream");
const ServerStatus = require("./const/server-status");
const tls = require("tls");

/*commands*/
const Handshake = require("./cmd/handshake/handshake");
const Quit = require("./cmd/quit");
const Utils = require("./misc/utils");
const Query = require("./cmd/query");

class Connection {
  constructor(options) {
    this.events = new EventEmitter();
    this.opts = options;
    this.cmd = null;
    this.cmdQueue = new Queue();
    this.info = { threadId: -1 };
    this.out = new PacketOutputStream(this.opts, this.info);

    this.addCommand = this._addCommandEnable;
    this.addCommand(new Handshake(this));

    this._initSocket();
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
      this.events.once("connect", () => callback(null));
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

  _changeTransaction(options, callback, cmd) {
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

      const cmd = new Query(this.events, _options, cmd, null, _cb);
      return this.addCommand(cmd);

    }

    if (!_cb) _cb();
    return null;

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

    if (typeof sql === "object") {
      _options = sql;
      _sql = _options.sql;
    } else {
      _sql = sql;
    }

    if (typeof values === "function") {
      _cb = values;
    } else if (values !== undefined) {
      _values = !Array.isArray(values) ? [values] : values;
      _cb = cb;
    }

    const cmd = new Query(this.events, _options, _sql, _values, _cb);
    return this.addCommand(cmd);
  }

  ping(options, callback) {
    //TODO
  }

  /**
   * Terminate connection gracefully.
   *
   * @param callback when done
   * @returns {*} quit command
   */
  end(callback) {
    this._clearConnectTimeout();
    this.addCommand = this._addCommandDisabled;
    this._closing = true;
    this._addCommandEnable(new Quit(this.events, callback));
  }

  /**
   * Force connection termination by closing the underlying socket and killing server process if any.
   */
  destroy() {
    this._clearConnectTimeout();
    this.addCommand = this._addCommandDisabled;
    this._closing = true;
    this.cmdQueue.clear();

    if (this.cmd) {
      //socket is closed, but server may still be processing a huge select
      //only possibility is to kill process by another thread
      //TODO reuse a pool connection to avoid connection creation
      const self = this;
      const killCon = new Connection(this.opts);
      killCon.query("KILL " + this.threadId, () => {
        if (self.cmd) {
          const err = Utils.createError(
            "Connection destroyed, command was killed",
            true,
            this.info
          );
          if (self.cmd.onResult) {
            self.cmd.onResult(err);
          } else {
            self.cmd.emit("error", err);
          }
        }
        process.nextTick(() => self._socket.destroy());
        killCon.end();
      });
    } else {
      this._socket.destroy();
    }
  }

  pause() {
    //TODO
  }

  resume() {
    //TODO
  }

  on(eventName, listener) {
    this.events.on(eventName, listener);
  }

  once(eventName, listener) {
    this.events.once(eventName, listener);
  }

  //*****************************************************************
  // additional public methods
  //*****************************************************************

  serverVersion() {
    if (!this.info.serverVersion)
      throw "cannot know if server information until connection is established";
    return this.info.serverVersion;
  }

  isMariaDB() {
    if (!this.info.serverVersion)
      throw "cannot know if server is MariaDB until connection is established";
    return this.info.serverVersion.mariaDb;
  }

  hasMinVersion(major, minor, patch) {
    if (!major) major = 0;
    if (!minor) minor = 0;
    if (!patch) patch = 0;

    if (!this.info.serverVersion)
      throw "cannot know if server version until connection is established";

    let ver = this.info.serverVersion;
    return (
      ver.major > major ||
      (ver.major === major && ver.minor > minor) ||
      (ver.major === major && ver.minor === minor && ver.patch >= patch)
    );
  }

  //*****************************************************************
  // internal methods
  //*****************************************************************

  _onConnect() {
    this._clearConnectTimeout();
    this._connected = true;
  }
  _initSocket() {
    //TODO handle pipe

    if (this.opts.connectTimeout) {
      this.timeoutRef = setTimeout(
        this._connectTimeoutReached.bind(this),
        this.opts.connectTimeout
      );
      this.events.once("connect", this._onConnect.bind(this));
    }

    let socket;
    if (this.opts.socketPath) {
      socket = Net.connect(this.opts.socketPath);
    } else {
      socket = Net.connect(this.opts.port, this.opts.host);
    }

    let packetInputStream = new PacketInputStream(this);
    socket.on("error", this._socketError.bind(this));
    socket.on("data", chunk => packetInputStream.onData(chunk));

    this.out.setWriter(buffer => this._socket.write(buffer));

    this._socket = socket;
  }

  _socketError(err) {
    if (!this._closing) {
      this._fatalError(err);
    }
  }

  _dispatchPacket(packet, header) {
    if (this.opts.debug && packet && this.cmd) {
      console.log(
        "<== conn:%d %s (%d,%d)\n%s",
        this.info.threadId ? this.info.threadId : -1,
        this.cmd.onPacketReceive
          ? this.cmd.constructor.name + "." + this.cmd.onPacketReceive.name
          : this.cmd.constructor.name,
        packet.off,
        packet.end,
        Utils.log(packet.buf, packet.off, packet.end, header)
      );
    }

    if (this.cmd) {
      this.cmd.handle(packet, this.out, this.opts, this.info);
      return;
    }

    if (packet && packet.peek() === 0xff) {
      //can receive unexpected error packet from server/proxy
      //to inform that connection is closed (usually by timeout)
      let err = packet.readError(this.info);
      if (err.fatal) {
        this.events.emit("error", err);
        this.close();
      }
    } else {
      let err = Utils.createError(
        "receiving packet from server without active commands",
        true,
        this.info
      );
      this.events.emit("error", err);
      this.close();
    }
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

    let events = this.events;
    secureSocket.on("error", this._socketError.bind(this));
    secureSocket.on("data", chunk => packetInputStream.onData(chunk));
    secureSocket.on("secureConnect", () => {
      events.emit("secureConnect");
      callback();
    });

    this.out.setWriter(buffer => secureSocket.write(buffer));
  }

  _connectTimeoutReached() {
    this._clearConnectTimeout();
    this._socket.destroy && this._socket.destroy();
    const err = Utils.createError("Connection timeout", true, this.info);
    this.info = null;
    this._fatalError(err);
  }

  _clearConnectTimeout() {
    if (this.timeoutRef) {
      clearTimeout(this.timeoutRef);
      this.timeoutRef = null;
    }
  }

  _addCommandEnable(cmd) {
    let conn = this;
    cmd.once("end", () => process.nextTick(() => conn._nextCmd()));
    if (!this.cmd && this.cmdQueue.isEmpty()) {
      this.cmd = cmd;
      this.cmd.init(this.out, this.opts, this.info);
    } else {
      this.cmdQueue.push(cmd);
    }
  }

  _addCommandDisabled(cmd) {
    const err = Utils.createError(
      "Cannot execute new commands: connection closed",
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
    this.addCommand = this._addCommandDisabled;
    this.cmdQueue.clear();
    //disabled events
    this._socket.destroy();
    this._closing = true;
    if (this.cmd && this.cmd.onResult) {
      this.cmd.onResult(err);
    }
    this.events.emit("error", err);
  }

  _nextCmd() {
    if ((this.cmd = this.cmdQueue.shift())) {
      this.cmd.init(this.out, this.opts, this.info);
    }
  }
}

module.exports = Connection;
