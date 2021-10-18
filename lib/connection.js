'use strict';

const EventEmitter = require('events');
const util = require('util');
const Queue = require('denque');
const Net = require('net');
const PacketInputStream = require('./io/packet-input-stream');
const PacketOutputStream = require('./io/packet-output-stream');
const CompressionInputStream = require('./io/compression-input-stream');
const CompressionOutputStream = require('./io/compression-output-stream');
const ServerStatus = require('./const/server-status');
const ConnectionInformation = require('./misc/connection-information');
const tls = require('tls');
const Errors = require('./misc/errors');
const Utils = require('./misc/utils');
const Capabilities = require('./const/capabilities');
const moment = require('moment-timezone');

/*commands*/
const Handshake = require('./cmd/handshake/handshake');
const Quit = require('./cmd/quit');
const Ping = require('./cmd/ping');
const Reset = require('./cmd/reset');
const Query = require('./cmd/query');
const Prepare = require('./cmd/prepare');
const OkPacket = require('./cmd/class/ok-packet');
const Execute = require('./cmd/execute');
const ClosePrepare = require('./cmd/close-prepare');
const BatchBulk = require('./cmd/batch-bulk');
const ChangeUser = require('./cmd/change-user');
const { Status } = require('./const/connection_status');

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
class Connection extends EventEmitter {
  opts;
  sendQueue = new Queue();
  receiveQueue = new Queue();
  waitingAuthenticationQueue = new Queue();
  status = Status.NOT_CONNECTED;
  socketConnected = false;
  socket = null;
  timeout = null;
  addCommand;
  streamOut;
  streamIn;
  info;

  constructor(options) {
    super();

    this.opts = Object.assign(new EventEmitter(), options);
    this.info = new ConnectionInformation(this.opts);
    this.addCommand = this.addCommandQueue;
    this.streamOut = new PacketOutputStream(this.opts, this.info);
    this.streamIn = new PacketInputStream(
      this.unexpectedPacket.bind(this),
      this.receiveQueue,
      this.streamOut,
      this.opts,
      this.info
    );

    if (this.opts.prepareCacheLength > 0) {
      this.info._prepareCache.onEviction = (key, value) => value.unCache();
    }
    this.on(
      'close_prepare',
      function (prepareResultPacket) {
        this.addCommand(
          new ClosePrepare(
            () => {},
            () => {},
            prepareResultPacket
          )
        );
      }.bind(this)
    );
    this.escape = Utils.escape.bind(this, this.opts, this.info);
    this.escapeId = Utils.escapeId.bind(this, this.opts, this.info);
  }

  //*****************************************************************
  // public methods
  //*****************************************************************

  /**
   * Connect event
   *
   * @returns {Promise} promise
   */
  connect() {
    const conn = this;
    switch (this.status) {
      case Status.NOT_CONNECTED:
        this.status = Status.CONNECTING;
        return new Promise(function (resolve, reject) {
          conn.registerHandshakeCmd(resolve, reject);
        });

      case Status.CLOSING:
      case Status.CLOSED:
        const err = Errors.createFatalError('Connection closed', Errors.ER_CONNECTION_ALREADY_CLOSED, this.info);
        if (this.opts.logger.error) this.opts.logger.error(err);
        return Promise.reject(err);

      case Status.CONNECTING:
      case Status.AUTHENTICATING:
        const errAuth = Errors.createFatalError(
          'Connection is already connecting',
          Errors.ER_ALREADY_CONNECTING,
          this.info
        );
        if (this.opts.logger.error) this.opts.logger.error(errAuth);
        return Promise.reject(errAuth);
    }
    //status Connected
    return Promise.resolve(this);
  }

  executePromise(values, cmdOpts, prepare, resolve, reject) {
    const cmd = new Execute(
      resolve,
      function (err) {
        if (this.opts.logger.error) this.opts.logger.error(err);
        reject(err);
      }.bind(this),
      cmdOpts,
      this.opts,
      prepare,
      values
    );
    if (this.opts.trace) Error.captureStackTrace(cmd);
    this.addCommand(cmd);
  }

  batch(_sql, _options, _values) {
    if (!_sql) {
      const err = Errors.createError('sql parameter is mandatory', Errors.ER_UNDEFINED_SQL, this.info, 'HY000');
      if (this.opts.logger.error) this.opts.logger.error(err);
      return Promise.reject(err);
    }
    if (!_values) {
      const err = Errors.createError(
        'Batch must have values set',
        Errors.ER_BATCH_WITH_NO_VALUES,
        this.info,
        'HY000',
        _sql
      );
      if (this.opts.logger.error) this.opts.logger.error(err);
      return Promise.reject(err);
    }

    return new Promise(this.prepare.bind(this, _options, _sql, this.executePromise.bind(this))).then((prepare) => {
      const usePlaceHolder = (_options && _options.namedPlaceholders) || this.opts.namedPlaceholders;
      let vals;
      if (Array.isArray(_values)) {
        if (usePlaceHolder) {
          vals = _values;
        } else if (Array.isArray(_values[0])) {
          vals = _values;
        } else if (prepare.parameters.length === 1) {
          vals = [];
          for (let i = 0; i < _values.length; i++) {
            vals.push([_values[i]]);
          }
        } else {
          vals = [_values];
        }
      } else {
        vals = [[_values]];
      }

      let useBulk = this._canUseBulk(vals, _options);
      if (useBulk) {
        return new Promise(this.executeBulkPromise.bind(this, vals, _options, prepare));
      } else {
        const executes = [];
        for (let i = 0; i < vals.length; i++) {
          executes.push(prepare.execute(vals[i], _options));
        }
        return Promise.all(executes).then(
          function (res) {
            prepare.close();
            if (_options && _options.fullResult) {
              return Promise.resolve(res);
            } else {
              // aggregate results
              const firstResult = res[0];
              if (firstResult instanceof OkPacket) {
                let affectedRows = 0;
                const insertId = firstResult.insertId;
                const warningStatus = firstResult.warningStatus;
                for (let i = 0; i < res.length; i++) {
                  affectedRows += res[i].affectedRows;
                }
                return Promise.resolve(new OkPacket(affectedRows, insertId, warningStatus));
              } else {
                // results have result-set. example :'INSERT ... RETURNING'
                // aggregate results
                const rs = [];
                rs.meta = res.meta;
                res.forEach((row) => {
                  Array.prototype.push.apply(rs, row);
                });
                rs.meta = res.meta;
                return Promise.resolve(rs);
              }
              return;
            }
          }.bind(this)
        );
      }
    });
  }

  executeBulkPromise(values, cmdOpts, prepare, resolve, reject) {
    const cmd = new BatchBulk(
      (res) => {
        prepare.close();
        return resolve(res);
      },
      function (err) {
        if (this.opts.logger.error) this.opts.logger.error(err);
        reject(err);
      }.bind(this),
      cmdOpts,
      this.opts,
      prepare,
      values
    );
    if (this.opts.trace) Error.captureStackTrace(cmd);
    this.addCommand(cmd);
  }

  /**
   * Send an empty MySQL packet to ensure connection is active, and reset @@wait_timeout
   * @param timeout (optional) timeout value in ms. If reached, throw error and close connection
   */
  ping(timeout, resolve, reject) {
    if (timeout) {
      if (timeout < 0) {
        const err = Errors.createError(
          'Ping cannot have negative timeout value',
          Errors.ER_BAD_PARAMETER_VALUE,
          this.info,
          '0A000'
        );
        if (this.opts.logger.error) this.opts.logger.error(err);
        reject(err);
        return;
      }
      let tOut = setTimeout(
        function () {
          tOut = undefined;
          const err = Errors.createFatalError('Ping timeout', Errors.ER_PING_TIMEOUT, this.info, '0A000');
          if (this.opts.logger.error) this.opts.logger.error(err);
          // close connection
          this.addCommand = this.addCommandDisabled;
          clearTimeout(this.timeout);
          if (this.status !== Status.CLOSING && this.status !== Status.CLOSED) {
            this.sendQueue.clear();
            this.status = Status.CLOSED;
            this.socket.destroy();
          }
          this.clear();
          reject(err);
        }.bind(this),
        timeout
      );
      this.addCommand(
        new Ping(
          () => {
            if (tOut) {
              clearTimeout(tOut);
              resolve();
            }
          },
          (err) => {
            if (this.opts.logger.error) this.opts.logger.error(err);
            clearTimeout(tOut);
            reject(err);
          }
        )
      );
      return;
    }
    this.addCommand(new Ping(resolve, reject));
  }

  /**
   * Send a reset command that will
   * - rollback any open transaction
   * - reset transaction isolation level
   * - reset session variables
   * - delete user variables
   * - remove temporary tables
   * - remove all PREPARE statement
   *
   * @returns {Promise} promise
   */
  reset(resolve, reject) {
    if (
      (this.info.isMariaDB() && this.info.hasMinVersion(10, 2, 4)) ||
      (!this.info.isMariaDB() && this.info.hasMinVersion(5, 7, 3))
    ) {
      const resetCmd = new Reset(resolve, reject);
      this.addCommand(resetCmd);
      return;
    }

    const err = new Error(
      `Reset command not permitted for server ${this.info.serverVersion.raw} (requires server MariaDB version 10.2.4+ or MySQL 5.7.3+)`
    );
    if (this.opts.logger.error) this.opts.logger.error(err);
    reject(err);
  }

  /**
   * Indicates the state of the connection as the driver knows it
   * @returns {boolean}
   */
  isValid() {
    return this.status === Status.CONNECTED;
  }

  /**
   * Terminate connection gracefully.
   */
  end(resolve, reject) {
    this.addCommand = this.addCommandDisabled;
    clearTimeout(this.timeout);

    if (this.status < Status.CLOSING && this.status !== Status.NOT_CONNECTED) {
      this.status = Status.CLOSING;
      const ended = () => {
        this.status = Status.CLOSED;
        this.socket.destroy();
        this.socket.unref();
        this.clear();
        this.receiveQueue.clear();
        resolve();
      };
      const quitCmd = new Quit(ended, ended);
      this.sendQueue.push(quitCmd);
      this.receiveQueue.push(quitCmd);
      if (this.sendQueue.length === 1) {
        process.nextTick(this.nextSendCmd.bind(this));
      }
    } else resolve();
  }

  /**
   * Force connection termination by closing the underlying socket and killing server process if any.
   */
  destroy() {
    this.addCommand = this.addCommandDisabled;
    clearTimeout(this.timeout);
    if (this.status < Status.CLOSING) {
      this.status = Status.CLOSING;
      this.sendQueue.clear();
      if (this.receiveQueue.length > 0) {
        //socket is closed, but server may still be processing a huge select
        //only possibility is to kill process by another thread
        //TODO reuse a pool connection to avoid connection creation
        const self = this;
        const killCon = new Connection(this.opts);
        killCon
          .connect()
          .then(function () {
            //*************************************************
            //kill connection
            //*************************************************
            const killResHandler = function (err) {
              const destroyError = Errors.createFatalError(
                'Connection destroyed, command was killed',
                Errors.ER_CMD_NOT_EXECUTED_DESTROYED,
                self.info
              );
              if (self.opts.logger.error) self.opts.logger.error(destroyError);
              self.socketErrorDispatchToQueries(destroyError);
              if (self.socket) process.nextTick(self.socket.destroy());
              self.status = Status.CLOSED;
              new Promise(killCon.end.bind(killCon)).catch(() => {});
            };
            new Promise(killCon.query.bind(killCon, null, `KILL ${self.info.threadId}`, undefined)).finally(
              killResHandler
            );
          })
          .catch((err) => {
            //*************************************************
            //failing to create a kill connection, end normally
            //*************************************************
            const ended = () => {
              let sock = self.socket;
              self.clear();
              self.status = Status.CLOSED;
              setImmediate(resolve);
              sock.destroy();
              self.receiveQueue.clear();
            };
            const quitCmd = new Quit(ended, ended);
            self.sendQueue.push(quitCmd);
            self.receiveQueue.push(quitCmd);
            if (self.sendQueue.length === 1) {
              process.nextTick(self.nextSendCmd.bind(self));
            }
          });
      } else {
        this.status = Status.CLOSED;
        this.socket.destroy();
      }
    }
    this.clear();
  }

  pause() {
    this.socket.pause();
  }

  resume() {
    this.socket.resume();
  }

  format(sql, values) {
    const err = Errors.createError(
      '"Connection.format intentionally not implemented. please use Connection.query(sql, values), it will be more secure and faster',
      Errors.ER_NOT_IMPLEMENTED_FORMAT,
      this.info,
      '0A000'
    );
    if (this.opts.logger.error) this.opts.logger.error(err);
    throw err;
  }

  //*****************************************************************
  // additional public methods
  //*****************************************************************

  /**
   * return current connected server version information.
   *
   * @returns {*}
   */
  serverVersion() {
    if (!this.info.serverVersion) {
      const err = new Error('cannot know if server information until connection is established');
      if (this.opts.logger.error) this.opts.logger.error(err);
      throw err;
    }

    return this.info.serverVersion.raw;
  }

  /**
   * Change option "debug" during connection.
   * @param val   debug value
   */
  debug(val) {
    if (typeof val === 'boolean') {
      if (val && !this.opts.logger.network) this.opts.logger.network = console.log;
    } else if (typeof val === 'function') {
      this.opts.logger.network = val;
    }
    this.opts.emit('debug', val);
  }

  debugCompress(val) {
    if (val) {
      if (typeof val === 'boolean') {
        this.opts.debugCompress = val;
        if (val && !this.opts.logger.network) this.opts.logger.network = console.log;
      } else if (typeof val === 'function') {
        this.opts.debugCompress = true;
        this.opts.logger.network = val;
      }
    } else this.opts.debugCompress = false;
  }

  //*****************************************************************
  // internal public testing methods
  //*****************************************************************

  get __tests() {
    return new TestMethods(this.info.collation, this.socket);
  }

  //*****************************************************************
  // internal methods
  //*****************************************************************

  /**
   * Use multiple COM_STMT_EXECUTE or COM_STMT_BULK_EXECUTE
   *
   * @param values current batch values
   * @param _options batch option
   * @return {boolean} indicating if can use bulk command
   */
  _canUseBulk(values, _options) {
    // not using info.isMariaDB() directly in case of callback use,
    // without connection being completely finished.
    let useBulk =
      this.info.serverVersion &&
      this.info.serverVersion.mariaDb &&
      this.info.hasMinVersion(10, 2, 7) &&
      this.opts.bulk &&
      (this.info.serverCapabilities & Capabilities.MARIADB_CLIENT_STMT_BULK_OPERATIONS) > BigInt(0);
    if (_options && _options.fullResult) return false;
    if (useBulk) {
      //ensure that there is no stream object
      if (values !== undefined) {
        if (!this.opts.namedPlaceholders) {
          //ensure that all parameters have same length
          //single array is considered as an array of single element.
          const paramLen = Array.isArray(values[0]) ? values[0].length : values[0] ? 1 : 0;
          if (paramLen === 0) return false;
          for (let r = 0; r < values.length; r++) {
            let row = values[r];
            if (!Array.isArray(row)) row = [row];
            if (paramLen !== row.length) {
              return false;
            }
            for (let j = 0; j < paramLen; j++) {
              const val = row[j];
              if (
                val !== null &&
                typeof val === 'object' &&
                typeof val.pipe === 'function' &&
                typeof val.read === 'function'
              ) {
                return false;
              }
            }
          }
        } else {
          for (let r = 0; r < values.length; r++) {
            let row = values[r];
            const keys = Object.keys(row);
            for (let j = 0; j < keys.length; j++) {
              const val = row[keys[j]];
              if (
                val !== null &&
                typeof val === 'object' &&
                typeof val.pipe === 'function' &&
                typeof val.read === 'function'
              ) {
                return false;
              }
            }
          }
        }
      }
    }
    return useBulk;
  }

  /**
   * Add handshake command to queue.
   *
   * @private
   */
  registerHandshakeCmd(resolve, rejected) {
    const _authFail = this.authFailHandler.bind(
      this,
      function (err) {
        if (this.opts.logger.error) this.opts.logger.error(err);
        rejected(err);
      }.bind(this)
    );
    const _authSucceed = this.authSucceedHandler.bind(this, resolve, _authFail);

    const handshake = new Handshake(
      _authSucceed,
      _authFail,
      this.createSecureContext.bind(this, _authFail),
      this.addCommandEnable.bind(this),
      this.getSocket.bind(this)
    );
    Error.captureStackTrace(handshake);

    handshake.once(
      'end',
      function () {
        if (!this.opts.collation) {
          this.opts.emit('collation', this.info.collation);
        }

        process.nextTick(this.nextSendCmd.bind(this));
      }.bind(this)
    );

    this.receiveQueue.push(handshake);
    this.streamInitSocket(_authFail);
  }

  executeSessionVariableQuery() {
    if (this.opts.sessionVariables) {
      const values = [];
      let sessionQuery = 'set ';
      let keys = Object.keys(this.opts.sessionVariables);
      if (keys.length > 0) {
        return new Promise(
          function (resolve, reject) {
            for (let k = 0; k < keys.length; ++k) {
              sessionQuery += (k !== 0 ? ',' : '') + '@@' + keys[k].replace(/[^a-z0-9_]/gi, '') + '=?';
              values.push(this.opts.sessionVariables[keys[k]]);
            }
            const errorHandling = (initialErr) => {
              const err = Errors.createFatalError(
                `Error setting session variable (value ${JSON.stringify(this.opts.sessionVariables)}). Error: ${
                  initialErr.message
                }`,
                Errors.ER_SETTING_SESSION_ERROR,
                this.info,
                '08S01',
                sessionQuery
              );
              if (this.opts.logger.error) this.opts.logger.error(err);
              reject(err);
            };
            const cmd = new Query(resolve, errorHandling, null, this.opts, sessionQuery, values);
            if (this.opts.trace) Error.captureStackTrace(cmd);
            this.addCommand(cmd);
          }.bind(this)
        );
      }
    }
    return Promise.resolve();
  }

  /**
   * Asking server timezone if not set in case of 'auto'
   * @returns {Promise<void>}
   * @private
   */
  checkServerTimezone() {
    if (this.opts.timezone === 'auto') {
      return new Promise(this.query.bind(this, null, 'SELECT @@system_time_zone stz, @@time_zone tz', undefined)).then(
        (res) => {
          const serverTimezone = res[0].tz === 'SYSTEM' ? res[0].stz : res[0].tz;
          const serverZone = moment.tz.zone(serverTimezone);
          if (serverZone) {
            const localTz = moment.tz.guess();
            if (serverTimezone === localTz) {
              //db server and client use same timezone, avoid any conversion
              this.opts.tz = null;
            } else {
              this.opts._localTz = localTz;
              this.opts.tz = serverTimezone;
            }
          } else {
            const err = Errors.createFatalError(
              `Automatic timezone setting fails. Server timezone '${serverTimezone}' does't have a corresponding IANA timezone. Option timezone must be set according to server timezone`,
              Errors.ER_WRONG_AUTO_TIMEZONE,
              this.info
            );
            if (this.opts.logger.error) this.opts.logger.error(err);
            return Promise.reject(err);
          }
          return Promise.resolve();
        }
      );
    }
    if (this.opts.tz && !this.opts.skipSetTimezone) {
      let tz = this.opts.tz;
      if (this.opts.tz === 'Etc/UTC') {
        tz = '+00:00';
      } else if (this.opts.tz.startsWith('Etc/GMT')) {
        let zone = moment.tz.zone(this.opts.tz);
        tz = zone.abbrs[0] + ':00';
      }
      return new Promise(this.query.bind(this, null, 'SET time_zone=?', [tz]))
        .then(() => {
          return Promise.resolve();
        })
        .catch((err) => {
          if (this.opts.logger.error) this.opts.logger.error(err);
          console.log(
            `warning: setting timezone '${this.opts.tz}' fails on server.\n look at https://mariadb.com/kb/en/mysql_tzinfo_to_sql/ to load IANA timezone.\nSetting timezone can be disabled with option \`skipSetTimezone\``
          );
          return Promise.resolve();
        });
    }
    return Promise.resolve();
  }

  checkServerVersion() {
    if (!this.opts.forceVersionCheck) {
      return Promise.resolve();
    }
    return new Promise(this.query.bind(this, null, 'SELECT @@VERSION AS v', undefined)).then(
      function (res) {
        this.info.serverVersion.raw = res[0].v;
        this.info.serverVersion.mariaDb = this.info.serverVersion.raw.includes('MariaDB');
        ConnectionInformation.parseVersionString(this.info);
        return Promise.resolve();
      }.bind(this)
    );
  }

  executeInitQuery() {
    if (this.opts.initSql) {
      const initialArr = Array.isArray(this.opts.initSql) ? this.opts.initSql : [this.opts.initSql];
      const initialPromises = [];
      initialArr.forEach((sql) => {
        initialPromises.push(new Promise(this.query.bind(this, null, sql, undefined)));
      });

      return Promise.all(initialPromises).catch((initialErr) => {
        const err = Errors.createFatalError(
          `Error executing initial sql command: ${initialErr.message}`,
          Errors.ER_INITIAL_SQL_ERROR,
          this.info
        );
        if (this.opts.logger.error) this.opts.logger.error(err);
        return Promise.reject(err);
      });
    }
    return Promise.resolve();
  }

  executeSessionTimeout() {
    if (this.opts.queryTimeout) {
      if (this.info.isMariaDB() && this.info.hasMinVersion(10, 1, 2)) {
        const query = `SET max_statement_time=${this.opts.queryTimeout / 1000}`;
        new Promise(this.query.bind(this, null, query, undefined)).catch(
          function (initialErr) {
            const err = Errors.createFatalError(
              `Error setting session queryTimeout: ${initialErr.message}`,
              Errors.ER_INITIAL_TIMEOUT_ERROR,
              this.info,
              '08S01',
              query
            );
            if (this.opts.logger.error) this.opts.logger.error(err);
            return Promise.reject(err);
          }.bind(this)
        );
      } else {
        const err = Errors.createError(
          `Can only use queryTimeout for MariaDB server after 10.1.1. queryTimeout value: ${this.opts.queryTimeout}`,
          Errors.ER_TIMEOUT_NOT_SUPPORTED,
          this.info,
          'HY000',
          this.opts.queryTimeout
        );
        if (this.opts.logger.error) this.opts.logger.error(err);
        return Promise.reject(err);
      }
    }
    return Promise.resolve();
  }

  getSocket() {
    return this.socket;
  }

  /**
   * Initialize socket and associate events.
   * @private
   */
  streamInitSocket(authFailHandler) {
    if (this.opts.socketPath) {
      this.socket = Net.connect(this.opts.socketPath);
    } else if (this.opts.stream) {
      if (typeof this.opts.stream === 'function') {
        const tmpSocket = this.opts.stream(
          function (err, stream) {
            if (err) {
              authFailHandler(err);
              return;
            } else if (stream) {
              this.socket = stream;
              this.socketInit(authFailHandler);
            } else {
              this.socket = Net.connect(this.opts.port, this.opts.host);
              this.socketInit(authFailHandler);
            }
          }.bind(this)
        );
        if (tmpSocket) {
          this.socket = tmpSocket;
          this.socketInit(authFailHandler);
        }
      } else {
        const err = Errors.createError(
          'stream option is not a function. stream must be a function with (error, callback) parameter',
          Errors.ER_BAD_PARAMETER_VALUE,
          this.info
        );
        authFailHandler(err);
      }
      return;
    } else {
      this.socket = Net.connect(this.opts.port, this.opts.host);
    }

    this.socketInit(authFailHandler);
  }

  socketInit(authFailHandler) {
    if (this.opts.connectTimeout) {
      this.timeout = setTimeout(
        this.connectTimeoutReached.bind(this),
        this.opts.connectTimeout,
        authFailHandler,
        Date.now()
      );
    }

    const socketError = this.socketErrorHandler.bind(this, authFailHandler);

    this.socket.on('data', this.streamIn.onData.bind(this.streamIn));
    this.socket.on('error', socketError);
    this.socket.on('end', socketError);
    this.socket.on(
      'connect',
      function () {
        clearTimeout(this.timeout);
        if (this.status === Status.CONNECTING) {
          this.status = Status.AUTHENTICATING;
          this.socketConnected = true;
          this.socket.setTimeout(this.opts.socketTimeout, this.socketTimeoutReached.bind(this, authFailHandler));
          this.socket.setNoDelay(true);

          // keep alive for socket. This won't reset server wait_timeout use pool option idleTimeout for that
          if (this.opts.keepAliveDelay) {
            this.socket.setKeepAlive(true, this.opts.keepAliveDelay);
          }
        }
      }.bind(this)
    );

    this.socket.writeBuf = (buf) => this.socket.write(buf);
    this.socket.flush = () => {};
    this.streamOut.setStream(this.socket);
  }

  /**
   * Authentication success result handler.
   *
   * @private
   */
  authSucceedHandler(resolve, rejected) {
    //enable packet compression according to option
    if (this.opts.compress) {
      if (this.info.serverCapabilities & Capabilities.COMPRESS) {
        this.streamOut.setStream(new CompressionOutputStream(this.socket, this.opts, this.info));
        this.streamIn = new CompressionInputStream(this.streamIn, this.receiveQueue, this.opts, this.info);
        this.socket.removeAllListeners('data');
        this.socket.on('data', this.streamIn.onData.bind(this.streamIn));
      } else {
        const err = Errors.createError(
          "connection is configured to use packet compression, but the server doesn't have this capability",
          Errors.ER_COMPRESSION_NOT_SUPPORTED,
          this.info
        );
        if (this.opts.logger.error) this.opts.logger.error(err);
      }
    }

    this.addCommand = this.opts.pipelining ? this.addCommandEnablePipeline : this.addCommandEnable;

    const commands = this.waitingAuthenticationQueue.toArray();
    commands.forEach((cmd) => {
      this.addCommand(cmd);
    });

    const errorInitialQueries = (err) => {
      if (!err.fatal)
        this.end(
          () => {},
          () => {}
        );
      process.nextTick(rejected, err);
    };
    this.status = Status.INIT_CMD;
    this.executeSessionVariableQuery()
      .then(this.checkServerTimezone.bind(this))
      .then(this.checkServerVersion.bind(this))
      .then(this.executeInitQuery.bind(this))
      .then(this.executeSessionTimeout.bind(this))
      .then(
        function () {
          this.status = Status.CONNECTED;
          process.nextTick(resolve, this);
        }.bind(this)
      )
      .catch(errorInitialQueries);
  }

  /**
   * Authentication failed result handler.
   *
   * @private
   */
  authFailHandler(reject, err) {
    process.nextTick(reject, err);
    //remove handshake command
    this.receiveQueue.shift();

    this.fatalError(err, true);
  }

  /**
   * Create TLS socket and associate events.
   *
   * @param rejected  rejected function when error
   * @param callback  callback function when done
   * @private
   */
  createSecureContext(rejected, callback) {
    const socketError = this.socketErrorHandler.bind(
      this,
      function (err) {
        if (this.opts.logger.error) this.opts.logger.error(err);
        rejected(err);
      }.bind(this)
    );
    const sslOption = Object.assign({}, this.opts.ssl, {
      servername: this.opts.host,
      socket: this.socket
    });

    try {
      const secureSocket = tls.connect(sslOption, callback);

      secureSocket.on('data', this.streamIn.onData.bind(this.streamIn));
      secureSocket.on('error', socketError);
      secureSocket.on('end', socketError);
      secureSocket.writeBuf = (buf) => secureSocket.write(buf);
      secureSocket.flush = () => {};

      this.socket.removeAllListeners('data');
      this.socket = secureSocket;

      this.streamOut.setStream(secureSocket);
    } catch (err) {
      socketError(err);
    }
  }

  /**
   * Handle packet when no packet is expected.
   * (there can be an ERROR packet send by server/proxy to inform that connection is ending).
   *
   * @param packet  packet
   * @private
   */
  unexpectedPacket(packet) {
    if (packet && packet.peek() === 0xff) {
      //can receive unexpected error packet from server/proxy
      //to inform that connection is closed (usually by timeout)
      let err = packet.readError(this.info);
      if (err.fatal && this.status < Status.CLOSING) {
        this.emit('error', err);
        if (this.opts.logger.error) this.opts.logger.error(err);
        this.end(
          () => {},
          () => {}
        );
      }
    } else if (this.status < Status.CLOSING) {
      const err = Errors.createFatalError(
        `receiving packet from server without active commands\nconn:${this.info.threadId ? this.info.threadId : -1}(${
          packet.pos
        },${packet.end})\n${Utils.log(this.opts, packet.buf, packet.pos, packet.end)}`,
        Errors.ER_UNEXPECTED_PACKET,
        this.info
      );
      if (this.opts.logger.error) this.opts.logger.error(err);
      this.emit('error', err);
      this.destroy();
    }
  }

  /**
   * Handle connection timeout.
   *
   * @private
   */
  connectTimeoutReached(authFailHandler, initialConnectionTime) {
    this.timeout = null;
    const handshake = this.receiveQueue.peekFront();
    const err = Errors.createFatalError(
      `Connection timeout: failed to create socket after ${Date.now() - initialConnectionTime}ms`,
      Errors.ER_CONNECTION_TIMEOUT,
      this.info,
      '08S01',
      null,
      handshake ? handshake.stack : null
    );
    if (this.opts.logger.error) this.opts.logger.error(err);
    authFailHandler(err);
  }

  /**
   * Handle socket timeout.
   *
   * @private
   */
  socketTimeoutReached() {
    const err = Errors.createFatalError('socket timeout', Errors.ER_SOCKET_TIMEOUT, this.info);
    if (this.opts.logger.error) this.opts.logger.error(err);
    this.fatalError(err, true);
  }

  /**
   * Add command to waiting queue until authentication.
   *
   * @param cmd         command
   * @returns {*}       current command
   * @private
   */
  addCommandQueue(cmd) {
    this.waitingAuthenticationQueue.push(cmd);
    return cmd;
  }

  /**
   * Add command to command sending and receiving queue.
   *
   * @param cmd         command
   * @returns {*}       current command
   * @private
   */
  addCommandEnable(cmd) {
    cmd.once(
      'end',
      function () {
        if (!this.sendQueue.isEmpty()) {
          setImmediate(this.nextSendCmd.bind(this));
        }
      }.bind(this)
    );

    //send immediately only if no current active receiver
    if (this.sendQueue.isEmpty() || !this.receiveQueue.peekFront()) {
      this.receiveQueue.push(cmd);
      cmd.start(this.streamOut, this.opts, this.info);
    } else {
      this.receiveQueue.push(cmd);
      this.sendQueue.push(cmd);
    }
    return cmd;
  }

  /**
   * Add command to command sending and receiving queue using pipelining
   *
   * @param cmd         command
   * @returns {*}       current command
   * @private
   */
  addCommandEnablePipeline(cmd) {
    cmd.once(
      'send_end',
      function () {
        if (!this.sendQueue.isEmpty()) {
          setImmediate(this.nextSendCmd.bind(this));
        }
      }.bind(this)
    );

    this.receiveQueue.push(cmd);
    if (this.sendQueue.isEmpty()) {
      cmd.start(this.streamOut, this.opts, this.info);
      if (cmd.sending) {
        this.sendQueue.push(cmd);
        cmd.prependOnceListener('send_end', this.sendQueue.shift.bind(this.sendQueue));
      }
    } else {
      this.sendQueue.push(cmd);
    }
    return cmd;
  }

  /**
   * Replacing command when connection is closing or closed to send a proper error message.
   *
   * @param cmd         command
   * @private
   */
  addCommandDisabled(cmd) {
    const err = cmd.throwNewError(
      'Cannot execute new commands: connection closed',
      true,
      this.info,
      '08S01',
      Errors.ER_CMD_CONNECTION_CLOSED
    );
    if (this.opts.logger.error) this.opts.logger.error(err);
  }

  /**
   * Handle socket error.
   *
   * @param authFailHandler   authentication handler
   * @param err               socket error
   * @private
   */
  socketErrorHandler(authFailHandler, err) {
    if (this.status >= Status.CLOSING) return;
    if (this.socket) {
      this.socket.writeBuf = () => {};
      this.socket.flush = () => {};
    }

    //socket has been ended without error
    if (!err) {
      err = Errors.createFatalError(
        'socket has unexpectedly been closed',
        Errors.ER_SOCKET_UNEXPECTED_CLOSE,
        this.info
      );
    } else {
      err.fatal = true;
      this.sqlState = 'HY000';
    }

    switch (this.status) {
      case Status.CONNECTING:
      case Status.AUTHENTICATING:
        const currentCmd = this.receiveQueue.peekFront();
        if (currentCmd && currentCmd.stack && err) {
          err.stack += '\n From event:\n' + currentCmd.stack.substring(currentCmd.stack.indexOf('\n') + 1);
        }
        authFailHandler(err);
        break;

      default:
        this.fatalError(err, false);
    }
  }

  /**
   * Fatal unexpected error : closing connection, and throw exception.
   */
  fatalError(err, avoidThrowError) {
    if (this.status >= Status.CLOSING) {
      this.socketErrorDispatchToQueries(err);
      return;
    }
    const mustThrowError = this.status !== Status.CONNECTING;
    this.status = Status.CLOSING;

    //prevent executing new commands
    this.addCommand = this.addCommandDisabled;

    if (this.socket) {
      this.socket.removeAllListeners('error');
      this.socket.removeAllListeners('timeout');
      this.socket.removeAllListeners('close');
      this.socket.removeAllListeners('data');
      if (!this.socket.destroyed) this.socket.destroy();
      this.socket = undefined;
    }
    this.status = Status.CLOSED;

    const errorThrownByCmd = this.socketErrorDispatchToQueries(err);
    if (mustThrowError) {
      if (this.opts.logger.error) this.opts.logger.error(err);
      if (this.listenerCount('error') > 0) {
        this.emit('error', err);
        this.emit('end');
        this.clear();
      } else {
        this.emit('end');
        this.clear();
        //error will be thrown if no error listener and no command did throw the exception
        if (!avoidThrowError && !errorThrownByCmd) throw err;
      }
    } else {
      this.clear();
    }
  }

  /**
   * Dispatch fatal error to current running queries.
   *
   * @param err        the fatal error
   * @return {boolean} return if error has been relayed to queries
   */
  socketErrorDispatchToQueries(err) {
    let receiveCmd;
    let errorThrownByCmd = false;
    while ((receiveCmd = this.receiveQueue.shift())) {
      if (receiveCmd && receiveCmd.onPacketReceive) {
        errorThrownByCmd = true;
        setImmediate(receiveCmd.throwError.bind(receiveCmd), err, this.info);
      }
    }
    return errorThrownByCmd;
  }

  /**
   * Will send next command in queue if any.
   *
   * @private
   */
  nextSendCmd() {
    let sendCmd;
    if ((sendCmd = this.sendQueue.shift())) {
      if (sendCmd.sending) {
        this.sendQueue.unshift(sendCmd);
      } else {
        sendCmd.start(this.streamOut, this.opts, this.info);
        if (sendCmd.sending) {
          this.sendQueue.unshift(sendCmd);
          sendCmd.prependOnceListener('send_end', this.sendQueue.shift.bind(this.sendQueue));
        }
      }
    }
  }

  /**
   * Change transaction state.
   *
   * @param sql sql
   * @returns {Promise} promise
   * @private
   */
  changeTransaction(sql, resolve, reject) {
    //if command in progress, driver cannot rely on status and must execute query
    if (this.status >= Status.CLOSING) {
      const err = Errors.createFatalError(
        'Cannot execute new commands: connection closed',
        Errors.ER_CMD_CONNECTION_CLOSED,
        this.info,
        '08S01',
        sql
      );
      if (this.opts.logger.error) this.opts.logger.error(err);
      return reject(err);
    }

    //Command in progress => must execute query
    //or if no command in progress, can rely on status to know if query is needed
    if (this.receiveQueue.peekFront() || this.info.status & ServerStatus.STATUS_IN_TRANS) {
      const cmd = new Query(
        resolve,
        (err) => {
          if (this.opts.logger.error) this.opts.logger.error(err);
          reject(err);
        },
        null,
        this.opts,
        sql,
        null
      );
      if (this.opts.trace) Error.captureStackTrace(cmd);
      this.addCommand(cmd);
    } else resolve();
  }

  changeUser(options, resolve, reject) {
    if (!this.info.isMariaDB()) {
      const err = Errors.createError(
        'method changeUser not available for MySQL server due to Bug #83472',
        Errors.ER_MYSQL_CHANGE_USER_BUG,
        this.info,
        '0A000'
      );
      if (this.opts.logger.error) this.opts.logger.error(err);
      reject(err);
      return;
    }

    this.addCommand(
      new ChangeUser(
        options,
        this.opts,
        (res) => {
          if (options && options.collation) this.opts.collation = options.collation;
          resolve(res);
        },
        this.authFailHandler.bind(this, (err) => {
          if (this.opts.logger.error) this.opts.logger.error(err);
          reject(err);
        }),
        this.addCommand.bind(this)
      )
    );
  }

  query(_cmdOpt, _sql, _values, resolve, reject) {
    if (!_sql)
      return reject(Errors.createError('sql parameter is mandatory', Errors.ER_UNDEFINED_SQL, this.info, 'HY000'));
    const cmd = new Query(
      resolve,
      (err) => {
        if (this.opts.logger.error) this.opts.logger.error(err);
        reject(err);
      },
      _cmdOpt,
      this.opts,
      _sql,
      _values
    );

    if (this.opts.trace) Error.captureStackTrace(cmd);
    this.addCommand(cmd);
  }

  prepare(_cmdOpt, _sql, executeFct, resolve, reject) {
    if (!_sql)
      return reject(Errors.createError('sql parameter is mandatory', Errors.ER_UNDEFINED_SQL, this.info, 'HY000'));
    const cmd = new Prepare(
      resolve,
      (err) => {
        if (this.opts.logger.error) this.opts.logger.error(err);
        reject(err);
      },
      _cmdOpt,
      this.opts,
      _sql,
      executeFct,
      this
    );
    if (this.opts.trace) Error.captureStackTrace(cmd);
    this.addCommand(cmd);
  }

  /**
   * Clearing connection variables when ending.
   *
   * @private
   */
  clear() {
    this.sendQueue.clear();
    this.opts.removeAllListeners();
    this.streamOut = undefined;
    this.socket = undefined;
  }

  get threadId() {
    return this.info ? this.info.threadId : null;
  }
}

class TestMethods {
  #collation;
  #socket;

  constructor(collation, socket) {
    this.#collation = collation;
    this.#socket = socket;
  }
  getCollation() {
    return this.#collation;
  }

  getSocket() {
    return this.#socket;
  }
}

util.inherits(Connection, EventEmitter);

module.exports = Connection;
