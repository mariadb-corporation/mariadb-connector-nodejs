"use strict";

const EventEmitter = require("events");
const Queue = require("denque");
const Net = require("net");
const PacketInputStream = require("./io/packet_input_stream");
const PacketOutputStream = require("./io/packet_output_stream");
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

    this.addCommand = this._addCommandEnable;
    this.info = { threadId: -1 };
    this.out = new PacketOutputStream(this.opts, this.info);
    this.addCommand(new Handshake(this));
    this._initSocket();
  }

  //*****************************************************************
  // API methods from mysql/mysql2 drivers from compatibility
  //*****************************************************************

  /**
   * Connect event with callback.
   *
   * @param callback
   */
  connect(callback) {
    if (!callback) return;
    this.events.once("connect", () => callback(null, false));
  }

  changeUser(options, callback) {
    //TODO
  }

  beginTransaction(options, callback) {
    //TODO
  }

  commit(options, callback) {
    //TODO
  }

  rollback(options, callback) {
    //TODO
  }

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

    const cmd = new Query(this.events, _options, _sql, _values, _cb, cb);
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
    this._addCommandEnable(new Quit(this.events, callback));
  }

  /**
   * Force connection termination by closing the underlying socket and killing server process if any.
   */
  destroy() {
    this._clearConnectTimeout();
    this.addCommand = this._addCommandDisabled;
    this._closing = true;
    this._commands.clear();

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

  escape(value) {
    //TODO ?
  }

  escapeId(value) {
    //TODO ?
  }

  format(sql, values) {
    //TODO ?
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
    if (!this._info.serverVersion)
      throw "cannot know if server information until connection is established";
    return this._info.serverVersion;
  }

  isMariaDB() {
    if (!this._info.serverVersion)
      throw "cannot know if server is MariaDB until connection is established";
    return this._info.serverVersion.mariaDb;
  }

  hasMinVersion(major, minor, patch) {
    if (!major) major = 0;
    if (!minor) minor = 0;
    if (!patch) patch = 0;

    if (!this._info.serverVersion)
      throw "cannot know if server version until connection is established";

    let ver = this._info.serverVersion;
    return (
      ver.major > major ||
      (ver.major === major && ver.minor > minor) ||
      (ver.major === major && ver.minor === minor && ver.patch >= patch)
    );
  }

  //*****************************************************************
  // internal methods
  //*****************************************************************

  _initSocket() {
    //TODO handle pipe

    if (this.opts.connectTimeout) {
      this.timeoutRef = setTimeout(
        this._connectTimeoutReached.bind(this),
        this.opts.connectTimeout
      );
      this.events.once("connect", this._clearConnectTimeout.bind(this));
    }

    let socket;
    if (this.opts.socketPath) {
      socket = Net.connect(this.opts.socketPath);
    } else {
      socket = Net.connect(this.opts.port, this.opts.host);
    }

    let packetInputStream = new PacketInputStream(this);
    let conn = this;
    socket.on("error", conn._fatalError.bind(conn));
    socket.on("data", chunk => packetInputStream.onData(chunk));

    this.out.setWriter(buffer => this._socket.write(buffer));

    this._socket = socket;
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
    secureSocket.on("error", this._fatalError.bind(this));
    secureSocket.on("data", chunk => packetInputStream.onData(chunk));
    secureSocket.on("secureConnect", () => {
      events.emit("secureConnect");
      callback();
    });

    this.out.setWriter(buffer => secureSocket.write(buffer));
  }

  _connectTimeoutReached() {
    this._clearConnectTimeout();
    this._info = null;
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
