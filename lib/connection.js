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
const Parse = require('./misc/parse');
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
const Stream = require('./cmd/stream');
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
function Connection(options) {
  //*****************************************************************
  // public API functions
  //*****************************************************************

  /**
   * Connect event
   *
   * @returns {Promise} promise
   */
  this.connect = () => {
    switch (_status) {
      case Status.NOT_CONNECTED:
        _status = Status.CONNECTING;
        return new Promise(function (resolve, reject) {
          _registerHandshakeCmd(resolve, reject);
        });

      case Status.CLOSING:
      case Status.CLOSED:
        const err = Errors.createFatalError('Connection closed', Errors.ER_CONNECTION_ALREADY_CLOSED, info);
        if (opts.logger.error) opts.logger.error(err);
        return Promise.reject(err);

      case Status.CONNECTING:
      case Status.AUTHENTICATING:
        const errAuth = Errors.createFatalError('Connection is already connecting', Errors.ER_ALREADY_CONNECTING, info);
        if (opts.logger.error) opts.logger.error(errAuth);
        return Promise.reject(errAuth);
    }
    //status Connected
    return Promise.resolve(this);
  };

  /**
   * Permit to change user during connection.
   * All user variables will be reset, Prepare commands will be released.
   * !!! mysql has a bug when CONNECT_ATTRS capability is set, that is default !!!!
   *
   * @param options   connection options
   * @returns {Promise} promise
   */
  this.changeUser = (options) => {
    if (!info.isMariaDB()) {
      const err = Errors.createError(
        'method changeUser not available for MySQL server due to Bug #83472',
        Errors.ER_MYSQL_CHANGE_USER_BUG,
        info,
        '0A000'
      );
      if (opts.logger.error) opts.logger.error(err);
      return Promise.reject(err);
    }

    return new Promise(function (resolve, reject) {
      _addCommand(
        new ChangeUser(
          options,
          opts,
          (res) => {
            if (options && options.collation) opts.collation = options.collation;
            resolve(res);
          },
          _authFailHandler.bind(this, (err) => {
            if (opts.logger.error) opts.logger.error(err);
            reject(err);
          }),
          _addCommand.bind(this)
        )
      );
    });
  };

  /**
   * Start transaction
   *
   * @returns {Promise} promise
   */
  this.beginTransaction = () => {
    return this.query('START TRANSACTION');
  };

  /**
   * Commit a transaction.
   *
   * @returns {Promise} command if commit was needed only
   */
  this.commit = () => {
    return _changeTransaction('COMMIT');
  };

  /**
   * Roll back a transaction.
   *
   * @returns {Promise} promise
   */
  this.rollback = () => {
    return _changeTransaction('ROLLBACK');
  };

  /**
   * Execute query using text protocol.
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  object / array of placeholder values (not mandatory)
   * @returns {Promise} promise
   */
  this._queryPromise = (sql, values) => {
    let _cmdOpt,
      _sql,
      _values = values;
    if (typeof sql === 'object') {
      _cmdOpt = sql;
      _sql = _cmdOpt.sql;
      if (_cmdOpt.values) _values = _cmdOpt.values;
    } else {
      _sql = sql;
    }

    return new Promise(function (resolve, reject) {
      const cmd = new Query(
        resolve,
        (err) => {
          if (opts.logger.error) opts.logger.error(err);
          reject(err);
        },
        _cmdOpt,
        opts,
        _sql,
        _values
      );
      if (opts.trace) Error.captureStackTrace(cmd);
      _addCommand(cmd);
    });
  };

  this._executePromise = (prepare, values, cmdOpts) => {
    return new Promise(function (resolve, reject) {
      const cmd = new Execute(
        resolve,
        (err) => {
          if (opts.logger.error) opts.logger.error(err);
          reject(err);
        },
        cmdOpts,
        opts,
        prepare,
        values
      );
      if (opts.trace) Error.captureStackTrace(cmd);
      _addCommand(cmd);
    });
  };

  this._prepareAndExecutePromise = (sql, values) => {
    let _cmdOpt,
      _sql,
      _values = values;
    if (typeof sql === 'object') {
      _cmdOpt = sql;
      _sql = _cmdOpt.sql;
      if (_cmdOpt.values) _values = _cmdOpt.values;
    } else {
      _sql = sql;
    }

    return this._prepareInnerPromise(_sql, _cmdOpt).then((prepare) => {
      return new Promise(function (resolve, reject) {
        const cmd = new Execute(
          (res) => {
            prepare.close();
            return resolve(res);
          },
          (err) => {
            if (opts.logger.error) opts.logger.error(err);
            reject(err);
          },
          _cmdOpt,
          opts,
          prepare,
          _values
        );
        if (opts.trace) Error.captureStackTrace(cmd);
        _addCommand(cmd);
      });
    });
  };

  this._preparePromise = function (sql) {
    let _cmdOpt, _sql;
    if (typeof sql === 'object') {
      _cmdOpt = sql;
      _sql = _cmdOpt.sql;
    } else {
      _sql = sql;
    }
    return this._prepareInnerPromise(_sql, opts);
  };

  this._prepareInnerPromise = function (sql, cmdOpt) {
    const self = this;
    return new Promise(function (resolve, reject) {
      const cmd = new Prepare(
        resolve,
        (err) => {
          if (opts.logger.error) opts.logger.error(err);
          reject(err);
        },
        cmdOpt,
        opts,
        sql,
        self
      );
      if (opts.trace) Error.captureStackTrace(cmd);
      _addCommand(cmd);
    });
  };

  /**
   * Execute batch using text protocol.
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param initialValues  object / array of placeholder values (not mandatory)
   * @returns {Promise} promise
   */
  this._batchPromise = (sql, initialValues) => {
    let _options,
      _sql,
      _values = initialValues;
    if (typeof sql === 'object') {
      _options = sql;
      _sql = _options.sql;
      if (_options.values) _values = _options.values;
    } else {
      _sql = sql;
    }

    if (!_values) {
      const err = Errors.createError('Batch must have values set', Errors.ER_BATCH_WITH_NO_VALUES, info, 'HY000', _sql);
      if (opts.logger.error) opts.logger.error(err);
      return Promise.reject(err);
    }

    const self = this;
    return new Promise(function (resolve, reject) {
      self
        ._prepareInnerPromise(_sql, _options)
        .then((prepare) => {
          const usePlaceHolder = (_options && _options.namedPlaceholders) || opts.namedPlaceholders;
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

          let useBulk = canUseBulk(vals, _options);
          if (useBulk) {
            const cmd = new BatchBulk(
              (res) => {
                prepare.close();
                return resolve(res);
              },
              (err) => {
                if (opts.logger.error) opts.logger.error(err);
                reject(err);
              },
              _options,
              opts,
              prepare,
              vals
            );
            if (opts.trace) Error.captureStackTrace(cmd);
            _addCommand(cmd);
          } else {
            const executes = [];
            for (let i = 0; i < vals.length; i++) {
              executes.push(self._executePromise(prepare, vals[i], _options));
            }
            Promise.all(executes)
              .then((res) => {
                prepare.close();
                if (_options && _options.fullResult) {
                  resolve(res);
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
                    resolve(new OkPacket(affectedRows, insertId, warningStatus));
                  } else {
                    // results have result-set. example :'INSERT ... RETURNING'
                    // aggregate results
                    const rs = [];
                    rs.meta = res.meta;
                    res.forEach((row) => {
                      Array.prototype.push.apply(rs, row);
                    });
                    rs.meta = res.meta;
                    resolve(rs);
                  }
                  return;
                }
              })
              .catch(reject);
          }
        })
        .catch((err) => {
          reject(err);
        });
    });
  };

  /**
   * Execute query returning a Readable Object that will emit columns/data/end/error events
   * to permit streaming big result-set
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  object / array of placeholder values (not mandatory)
   * @returns {Readable}
   */
  this.queryStream = (sql, values) => {
    let _cmdOpt,
      _sql,
      _values = values;
    if (typeof sql === 'object') {
      _cmdOpt = sql;
      _sql = _cmdOpt.sql;
      if (sql.values) _values = sql.values;
    } else {
      _sql = sql;
    }

    const cmd = new Stream(_cmdOpt, opts, _sql, _values, _socket);
    if (opts.logger.error) cmd.on('error', opts.logger.error);
    if (opts.trace) Error.captureStackTrace(cmd);
    _addCommand(cmd);
    return cmd.inStream;
  };

  /**
   * Send an empty MySQL packet to ensure connection is active, and reset @@wait_timeout
   * @param timeout (optional) timeout value in ms. If reached, throw error and close connection
   * @returns {Promise} promise
   */
  this.ping = (timeout) => {
    return new Promise(function (resolve, reject) {
      if (timeout) {
        if (timeout < 0) {
          const err = Errors.createError(
            'Ping cannot have negative timeout value',
            Errors.ER_BAD_PARAMETER_VALUE,
            info,
            '0A000'
          );
          if (opts.logger.error) opts.logger.error(err);
          reject(err);
          return;
        }
        const tOut = setTimeout(() => {
          const err = Errors.createFatalError('Ping timeout', Errors.ER_PING_TIMEOUT, info, '0A000');
          if (opts.logger.error) opts.logger.error(err);
          reject(err);
          // close connection
          _addCommand = _addCommandDisabled;
          clearTimeout(_timeout);
          if (_status !== Status.CLOSING && _status !== Status.CLOSED) {
            _sendQueue.clear();
            _status = Status.CLOSED;
            _socket.destroy();
          }
          _clear();
        }, timeout);
        return _addCommand(
          new Ping(
            () => {
              clearTimeout(tOut);
              resolve();
            },
            (err) => {
              if (opts.logger.error) opts.logger.error(err);
              clearTimeout(tOut);
              reject(err);
            }
          )
        );
      }
      return _addCommand(new Ping(resolve, reject));
    });
  };

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
  this.reset = () => {
    if ((info.isMariaDB() && info.hasMinVersion(10, 2, 4)) || (!info.isMariaDB() && info.hasMinVersion(5, 7, 3))) {
      return new Promise(function (resolve, reject) {
        return _addCommand(
          new Reset(resolve, (err) => {
            if (opts.logger.error) opts.logger.error(err);
            reject(err);
          })
        );
      });
    }
    const err = new Error(
      `Reset command not permitted for server ${this.info.serverVersion} (requires server MariaDB version 10.2.4+ or MySQL 5.7.3+)`
    );
    if (opts.logger.error) opts.logger.error(err);
    return Promise.reject(err);
  };

  /**
   * Indicates the state of the connection as the driver knows it
   * @returns {boolean}
   */
  this.isValid = () => {
    return _status === Status.CONNECTED;
  };

  /**
   * Terminate connection gracefully.
   *
   * @returns {Promise} promise
   */
  this.end = () => {
    _addCommand = _addCommandDisabled;
    clearTimeout(_timeout);

    if (_status !== Status.CLOSING && _status !== Status.CLOSED && _status !== Status.NOT_CONNECTED) {
      _status = Status.CLOSING;
      return new Promise(function (resolve, reject) {
        const ended = () => {
          _status = Status.CLOSED;
          _socket.destroy();
          _socket.unref();
          _clear();
          _receiveQueue.clear();
          resolve();
        };
        const quitCmd = new Quit(ended, ended);
        _sendQueue.push(quitCmd);
        _receiveQueue.push(quitCmd);
        if (_sendQueue.length === 1) {
          process.nextTick(_nextSendCmd.bind(this));
        }
      });
    }
    return Promise.resolve();
  };

  /**
   * Alias for destroy.
   */
  this.close = function () {
    this.destroy();
  };

  /**
   * Force connection termination by closing the underlying socket and killing server process if any.
   */
  this.destroy = () => {
    _addCommand = _addCommandDisabled;
    clearTimeout(_timeout);
    if (_status !== Status.CLOSING && _status !== Status.CLOSED) {
      _status = Status.CLOSING;
      _sendQueue.clear();
      if (_receiveQueue.length > 0) {
        //socket is closed, but server may still be processing a huge select
        //only possibility is to kill process by another thread
        //TODO reuse a pool connection to avoid connection creation
        const self = this;
        const killCon = new Connection(opts);
        killCon
          .connect()
          .then(() => {
            //*************************************************
            //kill connection
            //*************************************************
            const killResHandler = () => {
              const destroyError = Errors.createFatalError(
                'Connection destroyed, command was killed',
                Errors.ER_CMD_NOT_EXECUTED_DESTROYED,
                info
              );
              if (opts.logger.error) opts.logger.error(destroyError);
              socketErrorDispatchToQueries(destroyError);
              process.nextTick(() => {
                if (_socket) _socket.destroy();
              });
              _status = Status.CLOSED;
              killCon.end().catch(() => {});
            };

            killCon.query(`KILL ${info.threadId}`).then(killResHandler).catch(killResHandler);
          })
          .catch((err) => {
            //*************************************************
            //failing to create a kill connection, end normally
            //*************************************************
            const ended = () => {
              let sock = _socket;
              _clear();
              _status = Status.CLOSED;
              setImmediate(resolve);
              sock.destroy();
              _receiveQueue.clear();
            };
            const quitCmd = new Quit(ended, ended);
            _sendQueue.push(quitCmd);
            _receiveQueue.push(quitCmd);
            if (_sendQueue.length === 1) {
              process.nextTick(_nextSendCmd.bind(self));
            }
          });
      } else {
        _status = Status.CLOSED;
        _socket.destroy();
      }
    }
    _clear();
  };

  this.pause = () => {
    _socket.pause();
  };

  this.resume = () => {
    _socket.resume();
  };

  this.format = (sql, values) => {
    const err = Errors.createError(
      '"Connection.format intentionally not implemented. please use Connection.query(sql, values), it will be more secure and faster',
      Errors.ER_NOT_IMPLEMENTED_FORMAT,
      info,
      '0A000'
    );
    if (opts.logger.error) opts.logger.error(err);
    throw err;
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
    if (!info.serverVersion) {
      const err = new Error('cannot know if server information until connection is established');
      if (opts.logger.error) opts.logger.error(err);
      throw err;
    }

    return info.serverVersion.raw;
  };

  /**
   * Change option "debug" during connection.
   * @param val   debug value
   */
  this.debug = (val) => {
    if (typeof val === 'boolean') {
      if (val && !opts.logger.network) opts.logger.network = console.log;
    } else if (typeof val === 'function') {
      opts.logger.network = val;
    }
    opts.emit('debug', val);
  };

  this.debugCompress = (val) => {
    if (val) {
      if (typeof val === 'boolean') {
        opts.debugCompress = val;
        if (val && !opts.logger.network) opts.logger.network = console.log;
      } else if (typeof val === 'function') {
        opts.debugCompress = true;
        opts.logger.network = val;
      }
    } else opts.debugCompress = false;
  };

  //*****************************************************************
  // internal public testing methods
  //*****************************************************************

  function TestMethods() {}

  TestMethods.prototype.getCollation = () => {
    return info.collation;
  };

  TestMethods.prototype.getSocket = () => {
    return _socket;
  };

  this.__tests = new TestMethods();

  //*****************************************************************
  // internal methods
  //*****************************************************************

  this._status = () => {
    return _status;
  };

  /**
   * Execute query using text protocol with callback emit columns/data/end/error
   * events to permit streaming big result-set
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  object / array of placeholder values (not mandatory)
   * @param cb      callback
   * @returns {Query} query
   */
  this._queryCallback = (sql, values, cb) => {
    let _cmdOpts,
      _sql,
      _values = values,
      _cb = cb;

    if (typeof values === 'function') {
      _cb = values;
      _values = undefined;
    }

    if (typeof sql === 'object') {
      _cmdOpts = sql;
      _sql = _cmdOpts.sql;
      if (sql.values) _values = sql.values;
    } else {
      _sql = sql;
    }

    const cmd = new Query(
      _cb
        ? (rows) => {
            const meta = rows.meta;
            delete rows.meta;
            _cb(null, rows, meta);
          }
        : () => {},
      _cb ? _cb : () => {},
      _cmdOpts,
      opts,
      _sql,
      _values
    );

    cmd.handleNewRows = (row) => {
      cmd._rows[cmd._responseIndex].push(row);
      cmd.emit('data', row);
    };

    if (opts.trace) Error.captureStackTrace(cmd);
    _addCommand(cmd);
    return cmd;
  };

  /**
   * Execute a batch
   * events to permit streaming big result-set
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  object / array of placeholder values (not mandatory)
   * @param cb      callback
   */
  this._batchCallback = (sql, values, cb) => {
    let _values = values,
      _cb = cb;

    if (typeof values === 'function') {
      _cb = values;
      _values = undefined;
    }

    if (typeof sql === 'object') {
      if (sql.values) _values = sql.values;
    }

    this._batchPromise(sql, _values)
      .then((res) => {
        if (_cb) _cb(null, res);
      })
      .catch((err) => {
        if (_cb) _cb(err);
      });
  };

  /**
   * Use multiple COM_STMT_EXECUTE or COM_STMT_BULK_EXECUTE
   *
   * @param values current batch values
   * @param _options batch option
   * @return {boolean} indicating if can use bulk command
   */
  const canUseBulk = (values, _options) => {
    // not using info.isMariaDB() directly in case of callback use,
    // without connection being completely finished.
    let useBulk =
      info.serverVersion &&
      info.serverVersion.mariaDb &&
      info.hasMinVersion(10, 2, 7) &&
      opts.bulk &&
      (info.serverCapabilities & Capabilities.MARIADB_CLIENT_STMT_BULK_OPERATIONS) > BigInt(0);
    if (_options && _options.fullResult) return false;
    if (useBulk) {
      //ensure that there is no stream object
      if (values !== undefined) {
        if (!opts.namedPlaceholders) {
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
  };

  /**
   * Add handshake command to queue.
   *
   * @private
   */
  const _registerHandshakeCmd = (resolve, rejected) => {
    const _authFail = _authFailHandler.bind(this, (err) => {
      if (opts.logger.error) opts.logger.error(err);
      rejected(err);
    });
    const _authSucceed = _authSucceedHandler.bind(this, resolve, _authFail);

    const handshake = new Handshake(
      _authSucceed,
      _authFail,
      _createSecureContext.bind(this, _authFail),
      _addCommandEnable.bind(this),
      _getSocket
    );
    Error.captureStackTrace(handshake);

    handshake.once('end', () => {
      if (!opts.collation) {
        opts.emit('collation', info.collation);
      }

      process.nextTick(_nextSendCmd);
    });

    _receiveQueue.push(handshake);
    _initSocket(_authFail);
  };

  const _executeSessionVariableQuery = () => {
    if (opts.sessionVariables) {
      const values = [];
      let sessionQuery = 'set ';
      let keys = Object.keys(opts.sessionVariables);
      if (keys.length > 0) {
        return new Promise(function (resolve, reject) {
          for (let k = 0; k < keys.length; ++k) {
            sessionQuery += (k !== 0 ? ',' : '') + '@@' + keys[k].replace(/[^a-z0-9_]/gi, '') + '=?';
            values.push(opts.sessionVariables[keys[k]]);
          }
          const errorHandling = (initialErr) => {
            const err = Errors.createFatalError(
              `Error setting session variable (value ${JSON.stringify(opts.sessionVariables)}). Error: ${
                initialErr.message
              }`,
              Errors.ER_SETTING_SESSION_ERROR,
              info,
              '08S01',
              sessionQuery
            );
            if (opts.logger.error) opts.logger.error(err);
            reject(err);
          };
          const cmd = new Query(resolve, errorHandling, null, opts, sessionQuery, values);
          if (opts.trace) Error.captureStackTrace(cmd);
          _addCommand(cmd);
        });
      }
    }
    return Promise.resolve();
  };

  /**
   * Asking server timezone if not set in case of 'auto'
   * @returns {Promise<void>}
   * @private
   */
  const _checkServerTimezone = () => {
    if (opts.timezone === 'auto') {
      return this._queryPromise('SELECT @@system_time_zone stz, @@time_zone tz').then((res) => {
        const serverTimezone = res[0].tz === 'SYSTEM' ? res[0].stz : res[0].tz;
        const serverZone = moment.tz.zone(serverTimezone);
        if (serverZone) {
          const localTz = moment.tz.guess();
          if (serverTimezone === localTz) {
            //db server and client use same timezone, avoid any conversion
            opts.tz = null;
          } else {
            opts._localTz = localTz;
            opts.tz = serverTimezone;
          }
        } else {
          const err = Errors.createFatalError(
            `Automatic timezone setting fails. Server timezone '${serverTimezone}' does't have a corresponding IANA timezone. Option timezone must be set according to server timezone`,
            Errors.ER_WRONG_AUTO_TIMEZONE,
            info
          );
          if (opts.logger.error) opts.logger.error(err);
          return Promise.reject(err);
        }
        return Promise.resolve();
      });
    }
    if (opts.tz && !opts.skipSetTimezone) {
      let tz = opts.tz;
      if (opts.tz === 'Etc/UTC') {
        tz = '+00:00';
      } else if (opts.tz.startsWith('Etc/GMT')) {
        let zone = moment.tz.zone(opts.tz);
        tz = zone.abbrs[0] + ':00';
      }

      return this._queryPromise('SET time_zone=?', tz)
        .then((res) => {
          return Promise.resolve();
        })
        .catch((err) => {
          if (opts.logger.error) opts.logger.error(err);
          console.log(
            `warning: setting timezone '${opts.tz}' fails on server.\n look at https://mariadb.com/kb/en/mysql_tzinfo_to_sql/ to load IANA timezone.\nSetting timezone can be disabled with option \`skipSetTimezone\``
          );
          return Promise.resolve();
        });
    }
    return Promise.resolve();
  };

  const _checkServerVersion = () => {
    if (!opts.forceVersionCheck) {
      return Promise.resolve();
    }
    return this._queryPromise('SELECT @@VERSION AS v').then((res) => {
      info.serverVersion.raw = res[0].v;
      info.serverVersion.mariaDb = info.serverVersion.raw.includes('MariaDB');
      ConnectionInformation.parseVersionString(info);
      return Promise.resolve();
    });
  };

  const _executeInitQuery = () => {
    if (opts.initSql) {
      const initialArr = Array.isArray(opts.initSql) ? opts.initSql : [opts.initSql];
      const initialPromises = [];
      initialArr.forEach((sql) => {
        initialPromises.push(this._queryPromise(sql));
      });

      return Promise.all(initialPromises).catch((initialErr) => {
        const err = Errors.createFatalError(
          `Error executing initial sql command: ${initialErr.message}`,
          Errors.ER_INITIAL_SQL_ERROR,
          info
        );
        if (opts.logger.error) opts.logger.error(err);
        return Promise.reject(err);
      });
    }
    return Promise.resolve();
  };

  const _executeSessionTimeout = () => {
    if (opts.queryTimeout) {
      if (info.isMariaDB() && info.hasMinVersion(10, 1, 2)) {
        const query = `SET max_statement_time=${opts.queryTimeout / 1000}`;
        this._queryPromise(query).catch((initialErr) => {
          const err = Errors.createFatalError(
            `Error setting session queryTimeout: ${initialErr.message}`,
            Errors.ER_INITIAL_TIMEOUT_ERROR,
            info,
            '08S01',
            query
          );
          if (opts.logger.error) opts.logger.error(err);
          return Promise.reject(err);
        });
      } else {
        const err = Errors.createError(
          `Can only use queryTimeout for MariaDB server after 10.1.1. queryTimeout value: ${opts.queryTimeout}`,
          Errors.ER_TIMEOUT_NOT_SUPPORTED,
          info,
          'HY000',
          opts.queryTimeout
        );
        if (opts.logger.error) opts.logger.error(err);
        return Promise.reject(err);
      }
    }
    return Promise.resolve();
  };

  const _getSocket = () => {
    return _socket;
  };

  /**
   * Initialize socket and associate events.
   * @private
   */
  const _initSocket = (authFailHandler) => {
    if (opts.socketPath) {
      _socket = Net.connect(opts.socketPath);
    } else {
      _socket = Net.connect(opts.port, opts.host);
    }

    if (opts.connectTimeout) {
      _timeout = setTimeout(_connectTimeoutReached, opts.connectTimeout, authFailHandler, Date.now());
    }

    const _socketError = _socketErrorHandler.bind(this, authFailHandler);

    _socket.on('data', _in.onData.bind(_in));
    _socket.on('error', _socketError);
    _socket.on('end', _socketError);
    _socket.on(
      'connect',
      function () {
        clearTimeout(_timeout);
        if (_status === Status.CONNECTING) {
          _status = Status.AUTHENTICATING;
          _socketConnected = true;
          _socket.setTimeout(opts.socketTimeout, _socketTimeoutReached.bind(this, authFailHandler));
          _socket.setNoDelay(true);

          // keep alive for socket. This won't reset server wait_timeout use pool option idleTimeout for that
          if (opts.keepAliveDelay) {
            _socket.setKeepAlive(true, opts.keepAliveDelay);
          }
        }
      }.bind(this)
    );

    _socket.writeBuf = (buf) => _socket.write(buf);
    _socket.flush = () => {};
    _out.setStream(_socket);
  };

  /**
   * Authentication success result handler.
   *
   * @private
   */
  const _authSucceedHandler = (resolve, rejected) => {
    //enable packet compression according to option
    if (opts.compress) {
      if (info.serverCapabilities & Capabilities.COMPRESS) {
        _out.setStream(new CompressionOutputStream(_socket, opts, info));
        _in = new CompressionInputStream(_in, _receiveQueue, opts, info);
        _socket.removeAllListeners('data');
        _socket.on('data', _in.onData.bind(_in));
      } else {
        const err = Errors.createError(
          "connection is configured to use packet compression, but the server doesn't have this capability",
          Errors.ER_COMPRESSION_NOT_SUPPORTED,
          info
        );
        if (opts.logger.error) opts.logger.error(err);
        console.error(err);
      }
    }

    _addCommand = opts.pipelining ? _addCommandEnablePipeline : _addCommandEnable;

    const commands = _waitingAuthenticationQueue.toArray();
    commands.forEach((cmd) => {
      _addCommand(cmd);
    });

    const errorInitialQueries = (err) => {
      if (!err.fatal) this.end().catch((err) => {});
      process.nextTick(rejected, err);
    };
    _status = Status.INIT_CMD;
    _executeSessionVariableQuery()
      .then(() => {
        return _checkServerTimezone();
      })
      .then(() => {
        return _checkServerVersion();
      })
      .then(() => {
        return _executeInitQuery();
      })
      .then(() => {
        return _executeSessionTimeout();
      })
      .then(() => {
        _status = Status.CONNECTED;
        process.nextTick(resolve, this);
      })
      .catch(errorInitialQueries);
  };

  /**
   * Authentication failed result handler.
   *
   * @private
   */
  const _authFailHandler = (reject, err) => {
    process.nextTick(reject, err);
    //remove handshake command
    _receiveQueue.shift();

    _fatalError(err, true);
  };

  /**
   * Create TLS socket and associate events.
   *
   * @param rejected  rejected function when error
   * @param callback  callback function when done
   * @private
   */
  const _createSecureContext = (rejected, callback) => {
    const _socketError = _socketErrorHandler.bind(this, (err) => {
      if (opts.logger.error) opts.logger.error(err);
      rejected(err);
    });
    const sslOption = Object.assign({}, opts.ssl, {
      servername: opts.host,
      socket: _socket
    });

    try {
      const secureSocket = tls.connect(sslOption, callback);

      secureSocket.on('data', _in.onData.bind(_in));
      secureSocket.on('error', _socketError);
      secureSocket.on('end', _socketError);
      secureSocket.writeBuf = (buf) => secureSocket.write(buf);
      secureSocket.flush = () => {};

      _socket.removeAllListeners('data');
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
  const _unexpectedPacket = function (packet) {
    if (packet && packet.peek() === 0xff) {
      //can receive unexpected error packet from server/proxy
      //to inform that connection is closed (usually by timeout)
      let err = packet.readError(info);
      if (err.fatal && _status !== Status.CLOSING && _status !== Status.CLOSED) {
        this.emit('error', err);
        if (opts.logger.error) opts.logger.error(err);
        this.end();
      }
    } else if (_status !== Status.CLOSING && _status !== Status.CLOSED) {
      const err = Errors.createFatalError(
        `receiving packet from server without active commands\nconn:${info.threadId ? info.threadId : -1}(${
          packet.pos
        },${packet.end})\n${Utils.log(opts, packet.buf, packet.pos, packet.end)}`,
        Errors.ER_UNEXPECTED_PACKET,
        info
      );
      if (opts.logger.error) opts.logger.error(err);
      this.emit('error', err);
      this.destroy();
    }
  };

  /**
   * Change transaction state.
   *
   * @param sql sql
   * @returns {Promise} promise
   * @private
   */
  const _changeTransaction = (sql) => {
    //if command in progress, driver cannot rely on status and must execute query
    if (_status === Status.CLOSING || _status === Status.CLOSED) {
      const err = Errors.createFatalError(
        'Cannot execute new commands: connection closed',
        Errors.ER_CMD_CONNECTION_CLOSED,
        info,
        '08S01',
        sql
      );
      if (opts.logger.error) opts.logger.error(err);
      return Promise.reject(err);
    }

    //Command in progress => must execute query
    //or if no command in progress, can rely on status to know if query is needed
    if (_receiveQueue.peekFront() || info.status & ServerStatus.STATUS_IN_TRANS) {
      return new Promise(function (resolve, reject) {
        const cmd = new Query(
          resolve,
          (err) => {
            if (opts.logger.error) opts.logger.error(err);
            reject(err);
          },
          null,
          opts,
          sql,
          null
        );
        if (opts.trace) Error.captureStackTrace(cmd);
        _addCommand(cmd);
      });
    }
    return Promise.resolve();
  };

  /**
   * Handle connection timeout.
   *
   * @private
   */
  const _connectTimeoutReached = function (authFailHandler, initialConnectionTime) {
    _timeout = null;
    const handshake = _receiveQueue.peekFront();
    const err = Errors.createFatalError(
      `Connection timeout: failed to create socket after ${Date.now() - initialConnectionTime}ms`,
      Errors.ER_CONNECTION_TIMEOUT,
      info,
      '08S01',
      null,
      handshake ? handshake.stack : null
    );
    if (opts.logger.error) opts.logger.error(err);
    authFailHandler(err);
  };

  /**
   * Handle socket timeout.
   *
   * @private
   */
  const _socketTimeoutReached = function () {
    const err = Errors.createFatalError('socket timeout', Errors.ER_SOCKET_TIMEOUT, info);
    if (opts.logger.error) opts.logger.error(err);
    _fatalError(err, true);
  };

  /**
   * Add command to waiting queue until authentication.
   *
   * @param cmd         command
   * @returns {*}       current command
   * @private
   */
  const _addCommandQueue = (cmd) => {
    _waitingAuthenticationQueue.push(cmd);
    return cmd;
  };

  /**
   * Add command to command sending and receiving queue.
   *
   * @param cmd         command
   * @returns {*}       current command
   * @private
   */
  const _addCommandEnable = (cmd) => {
    cmd.once('end', () => {
      if (!_sendQueue.isEmpty()) {
        setImmediate(_nextSendCmd);
      }
    });

    //send immediately only if no current active receiver
    if (_sendQueue.isEmpty() || !_receiveQueue.peekFront()) {
      _receiveQueue.push(cmd);
      cmd.start(_out, opts, info);
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
  const _addCommandEnablePipeline = (cmd) => {
    cmd.once('send_end', () => {
      if (!_sendQueue.isEmpty()) {
        setImmediate(_nextSendCmd);
      }
    });

    _receiveQueue.push(cmd);
    if (_sendQueue.isEmpty()) {
      cmd.start(_out, opts, info);
      if (cmd.sending) {
        _sendQueue.push(cmd);
        cmd.prependOnceListener('send_end', () => {
          _sendQueue.shift();
        });
      }
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
  const _addCommandDisabled = (cmd) => {
    const err = cmd.throwNewError(
      'Cannot execute new commands: connection closed',
      true,
      info,
      '08S01',
      Errors.ER_CMD_CONNECTION_CLOSED
    );
    if (opts.logger.error) opts.logger.error(err);
  };

  /**
   * Handle socket error.
   *
   * @param authFailHandler   authentication handler
   * @param err               socket error
   * @private
   */
  const _socketErrorHandler = function (authFailHandler, err) {
    if (_status === Status.CLOSING || _status === Status.CLOSED) return;
    if (_socket) {
      _socket.writeBuf = () => {};
      _socket.flush = () => {};
    }

    //socket has been ended without error
    if (!err) {
      err = Errors.createFatalError('socket has unexpectedly been closed', Errors.ER_SOCKET_UNEXPECTED_CLOSE, info);
    } else {
      err.fatal = true;
      this.sqlState = 'HY000';
    }

    switch (_status) {
      case Status.CONNECTING:
      case Status.AUTHENTICATING:
        const currentCmd = _receiveQueue.peekFront();
        if (currentCmd && currentCmd.stack && err) {
          err.stack += '\n From event:\n' + currentCmd.stack.substring(currentCmd.stack.indexOf('\n') + 1);
        }
        authFailHandler(err);
        break;

      default:
        _fatalError(err, false);
    }
  };

  /**
   * Fatal unexpected error : closing connection, and throw exception.
   *
   * @param self    current connection
   * @private
   */
  const _fatalErrorHandler = function (self) {
    return function (err, avoidThrowError) {
      if (_status === Status.CLOSING || _status === Status.CLOSED) {
        socketErrorDispatchToQueries(err);
        return;
      }
      const mustThrowError = _status !== Status.CONNECTING;
      _status = Status.CLOSING;

      //prevent executing new commands
      _addCommand = _addCommandDisabled;

      if (_socket) {
        _socket.removeAllListeners('error');
        _socket.removeAllListeners('timeout');
        _socket.removeAllListeners('close');
        _socket.removeAllListeners('data');
        if (!_socket.destroyed) _socket.destroy();
        _socket = undefined;
      }
      _status = Status.CLOSED;

      const errorThrownByCmd = socketErrorDispatchToQueries(err);
      if (mustThrowError) {
        if (opts.logger.error) opts.logger.error(err);
        if (self.listenerCount('error') > 0) {
          self.emit('error', err);
          self.emit('end');
          _clear();
        } else {
          self.emit('end');
          _clear();
          //error will be thrown if no error listener and no command did throw the exception
          if (!avoidThrowError && !errorThrownByCmd) throw err;
        }
      } else {
        _clear();
      }
    };
  };

  /**
   * Dispatch fatal error to current running queries.
   *
   * @param err        the fatal error
   * @return {boolean} return if error has been relayed to queries
   */
  const socketErrorDispatchToQueries = (err) => {
    let receiveCmd;
    let errorThrownByCmd = false;
    while ((receiveCmd = _receiveQueue.shift())) {
      if (receiveCmd && receiveCmd.onPacketReceive) {
        errorThrownByCmd = true;
        setImmediate(receiveCmd.throwError.bind(receiveCmd), err, info);
      }
    }
    return errorThrownByCmd;
  };

  /**
   * Will send next command in queue if any.
   *
   * @private
   */
  const _nextSendCmd = () => {
    let sendCmd;
    if ((sendCmd = _sendQueue.shift())) {
      if (sendCmd.sending) {
        _sendQueue.unshift(sendCmd);
      } else {
        sendCmd.start(_out, opts, info);
        if (sendCmd.sending) {
          sendCmd.prependOnceListener('send_end', () => {
            _sendQueue.shift();
          });
          _sendQueue.unshift(sendCmd);
        }
      }
    }
  };

  /**
   * Clearing connection variables when ending.
   *
   * @private
   */
  const _clear = () => {
    _sendQueue.clear();
    opts.removeAllListeners();
    _out = undefined;
    _socket = undefined;
  };

  //*****************************************************************
  // internal variables
  //*****************************************************************

  EventEmitter.call(this);
  const opts = Object.assign(new EventEmitter(), options);
  const info = new ConnectionInformation(opts);
  const _sendQueue = new Queue();
  const _receiveQueue = new Queue();
  const _waitingAuthenticationQueue = new Queue();
  let _status = Status.NOT_CONNECTED;
  let _socketConnected = false;
  let _socket = null;
  let _timeout = null;
  let _addCommand = _addCommandQueue;
  const _fatalError = _fatalErrorHandler(this);
  let _out = new PacketOutputStream(opts, info);
  let _in = new PacketInputStream(_unexpectedPacket.bind(this), _receiveQueue, _out, opts, info);
  if (opts.prepareCacheLength > 0) {
    info._prepareCache.onEviction = function (key, value) {
      value.unCache();
    }.bind(this);
  }
  this.on('close_prepare', (prepareResultPacket) => {
    _addCommand(
      new ClosePrepare(
        () => {},
        () => {},
        prepareResultPacket
      )
    );
  });
  this.query = this._queryPromise;
  this.prepare = this._preparePromise;
  this.execute = this._prepareAndExecutePromise;
  this.batch = this._batchPromise;
  this.escape = Utils.escape.bind(this, opts, info);
  this.escapeId = Utils.escapeId.bind(this, opts, info);

  //add alias threadId for mysql/mysql2 compatibility
  Object.defineProperty(this, 'threadId', {
    get() {
      return info ? info.threadId : undefined;
    }
  });
  Object.defineProperty(this, 'info', {
    get() {
      return info;
    }
  });
}

util.inherits(Connection, EventEmitter);

module.exports = Connection;
