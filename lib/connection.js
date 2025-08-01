//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import EventEmitter from 'node:events';
import Queue from 'denque';
import Net from 'node:net';
import PacketInputStream from './io/packet-input-stream.js';
import PacketOutputStream from './io/packet-output-stream.js';
import CompressionInputStream from './io/compression-input-stream.js';
import CompressionOutputStream from './io/compression-output-stream.js';
import * as ServerStatus from './const/server-status.js';
import ConnectionInformation from './misc/connection-information.js';
import tls from 'node:tls';
import * as Errors from './misc/errors.js';
import * as Utils from './misc/utils.js';
import * as Capabilities from './const/capabilities.js';
import ConnectionOptions from './config/connection-options.js';
import Authentication from './cmd/handshake/authentication.js';
import Quit from './cmd/quit.js';
import Ping from './cmd/ping.js';
import Reset from './cmd/reset.js';
import Query from './cmd/query.js';
import Prepare from './cmd/prepare.js';
import OkPacket from './cmd/class/ok-packet.js';
import Execute from './cmd/execute.js';
import ClosePrepare from './cmd/close-prepare.js';
import BatchBulk from './cmd/batch-bulk.js';
import ChangeUser from './cmd/change-user.js';
import * as Status from './const/connection_status.js';
import LruPrepareCache from './lru-prepare-cache.js';
import { promises as fsPromises } from 'node:fs';
import { parseQueries } from './misc/parse.js';
import Collations from './const/collations.js';
import ConnOptions from './config/connection-options.js';

const convertFixedTime = function (tz, conn) {
  if (tz === 'UTC' || tz === 'Etc/UTC' || tz === 'Z' || tz === 'Etc/GMT') {
    return '+00:00';
  } else if (tz.startsWith('Etc/GMT') || tz.startsWith('GMT')) {
    let tzdiff;
    let negate;

    // strangely Etc/GMT+8 = GMT-08:00 = offset -8
    if (tz.startsWith('Etc/GMT')) {
      tzdiff = tz.substring(7);
      negate = !tzdiff.startsWith('-');
    } else {
      tzdiff = tz.substring(3);
      negate = tzdiff.startsWith('-');
    }
    let diff = parseInt(tzdiff.substring(1));
    if (isNaN(diff)) {
      throw Errors.createFatalError(
        `Automatic timezone setting fails. wrong Server timezone '${tz}' conversion to +/-HH:00 conversion.`,
        Errors.client.ER_WRONG_AUTO_TIMEZONE,
        conn.info
      );
    }
    return (negate ? '-' : '+') + (diff >= 10 ? diff : '0' + diff) + ':00';
  }
  return tz;
};
const redirectUrlFormat = /(mariadb|mysql):\/\/(([^/@:]+)?(:([^/]+))?@)?(([^/:]+)(:([0-9]+))?)(\/([^?]+)(\?(.*))?)?$/;

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
  socket = null;
  timeout = null;
  addCommand;
  streamOut;
  streamIn;
  info;
  prepareCache;

  constructor(options) {
    super();

    this.opts = Object.assign(new EventEmitter(), options);
    this.info = new ConnectionInformation(this.opts, this.redirect.bind(this));
    this.prepareCache =
      this.opts.prepareCacheLength > 0 ? new LruPrepareCache(this.info, this.opts.prepareCacheLength) : null;
    this.addCommand = this.addCommandQueue;
    this.streamOut = new PacketOutputStream(this.opts, this.info);
    this.streamIn = new PacketInputStream(
      this.unexpectedPacket.bind(this),
      this.receiveQueue,
      this.streamOut,
      this.opts,
      this.info
    );

    this.on('close_prepare', this._closePrepare.bind(this));
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
    this.status = Status.CONNECTING;
    const authenticationParam = {
      opts: this.opts
    };

    return new Promise(function (resolve, reject) {
      conn.connectRejectFct = reject;
      conn.connectResolveFct = resolve;

      // Add a handshake to msg queue
      const authentication = new Authentication(
        authenticationParam,
        conn.authSucceedHandler.bind(conn),
        conn.authFailHandler.bind(conn),
        conn.createSecureContext.bind(conn),
        conn.getSocket.bind(conn)
      );

      // Capture stack trace for better error reporting
      Error.captureStackTrace(authentication);

      authentication.once('end', () => {
        conn.receiveQueue.shift();

        // conn.info.collation might not be initialized
        // in case of handshake throwing error
        if (!conn.opts.collation && conn.info.collation) {
          conn.opts.emit('collation', conn.info.collation);
        }

        process.nextTick(conn.nextSendCmd.bind(conn));
      });

      conn.receiveQueue.push(authentication);
      conn.streamInitSocket.call(conn);
    });
  }

  /**
   * Execute a prepared statement with the given parameters
   *
   * @param {Object} cmdParam - Command parameters
   * @param {Object} prepare - Prepared statement
   * @param {Function} resolve - Promise resolve function
   * @param {Function} reject - Promise reject function
   */
  executePromise(cmdParam, prepare, resolve, reject) {
    const cmd = new Execute(resolve, this._logAndReject.bind(this, reject), this.opts, cmdParam, prepare);
    this.addCommand(cmd, true);
  }

  /**
   * Execute a batch of the same SQL statement with different parameter sets
   *
   * @param {Object|String} cmdParam - SQL statement or options object
   * @param {function} resolve - promise resolve function
   * @param {function} reject - promise reject function
   */
  batch(cmdParam, resolve, reject) {
    // Validate SQL parameter
    if (!cmdParam.sql) {
      return this.handleMissingSqlError(reject);
    }

    // Validate values parameter
    if (!cmdParam.values) {
      return this.handleMissingValuesError(cmdParam, reject);
    }

    // Execute the batch operation
    this.prepare(
      cmdParam,
      (prepare) => this.executeBatch(cmdParam, prepare, resolve, reject),
      (err) => this._logAndReject(reject, err)
    );
  }

  /**
   * Handle missing SQL parameter error
   *
   * @param {Function} reject - Promise reject function
   * @private
   */
  handleMissingSqlError(reject) {
    const err = Errors.createError(
      'sql parameter is mandatory',
      Errors.client.ER_UNDEFINED_SQL,
      this.info,
      'HY000',
      null,
      false
    );

    // Add stack trace for better debugging
    Error.captureStackTrace(err, this.handleMissingSqlError);
    this._logAndReject(reject, err);
  }

  /**
   * Handle missing values parameter error
   *
   * @param {Object} cmdParam - Command parameters
   * @param {Function} reject - Promise reject function
   * @private
   */
  handleMissingValuesError(cmdParam, reject) {
    const sql = cmdParam.sql;
    // Truncate SQL for debug output if it's too long
    const debugSql = sql.length > this.opts.debugLen ? sql.substring(0, this.opts.debugLen) + '...' : sql;

    const err = Errors.createError(
      'Batch must have values set',
      Errors.client.ER_BATCH_WITH_NO_VALUES,
      this.info,
      'HY000',
      debugSql,
      false,
      cmdParam.stack
    );
    this._logAndReject(reject, err);
  }

  /**
   * Execute batch operation with prepared statement
   *
   * @param {Object} cmdParam - Command parameters
   * @param {Object} prepare - Prepared statement
   * @param {Function} resolve - Promise resolve function
   * @param {Function} reject - Promise reject function
   * @private
   */
  executeBatch(cmdParam, prepare, resolve, reject) {
    const usePlaceHolder = (cmdParam.opts && cmdParam.opts.namedPlaceholders) || this.opts.namedPlaceholders;
    let values = this.formatBatchValues(cmdParam.values, usePlaceHolder, prepare.parameterCount);
    cmdParam.values = values;

    // Determine if bulk protocol can be used
    const useBulk = this._canUseBulk(values, cmdParam.opts);

    if (useBulk) {
      this.executeBulkPromise(cmdParam, prepare, this.opts, resolve, reject);
    } else {
      this.executeIndividualBatches(cmdParam, prepare, resolve, reject);
    }
  }

  /**
   * Execute bulk operation using specialized bulk protocol
   *
   * @param {Object} cmdParam - Command parameters
   * @param {Object} prepare - Prepared statement
   * @param {Object} opts - Options
   * @param {Function} resolve - Promise resolve function
   * @param {Function} reject - Promise reject function
   * @private
   */
  executeBulkPromise(cmdParam, prepare, opts, resolve, reject) {
    const cmd = new BatchBulk(
      (res) => {
        prepare.close();
        return resolve(res);
      },
      (err) => {
        prepare.close();
        if (opts.logger.error) opts.logger.error(err);
        reject(err);
      },
      opts,
      prepare,
      cmdParam
    );
    this.addCommand(cmd, true);
  }

  /**
   * Format batch values into the correct structure
   *
   * @param {Array} values - Original values array
   * @param {Boolean} usePlaceHolder - Whether named placeholders are used
   * @param {Number} parameterCount - Number of parameters in prepared statement
   * @returns {Array} Formatted values array
   * @private
   */
  formatBatchValues(values, usePlaceHolder, parameterCount) {
    // If values is not an array, wrap it
    if (!Array.isArray(values)) {
      return [[values]];
    }

    // For named placeholders, return as is
    if (usePlaceHolder) {
      return values;
    }

    // If already in correct format (array of arrays), return as is
    if (Array.isArray(values[0])) {
      return values;
    }

    // If only one parameter expected, convert flat array to array of single-item arrays
    if (parameterCount === 1) {
      // Pre-allocate result array for better performance
      const result = new Array(values.length);
      for (let i = 0; i < values.length; i++) {
        result[i] = [values[i]];
      }
      return result;
    }

    // Single set of parameters for multiple placeholders
    return [values];
  }

  /**
   * Execute individual batch operations when bulk protocol can't be used
   *
   * @param {Object} cmdParam - Command parameters
   * @param {Object} prepare - Prepared statement
   * @param {Function} resolve - Promise resolve function
   * @param {Function} reject - Promise reject function
   * @private
   */
  executeIndividualBatches(cmdParam, prepare, resolve, reject) {
    const results = [];
    const batchSize = 1000; // Process in chunks to avoid memory issues
    const totalBatches = Math.ceil(cmdParam.values.length / batchSize);

    // Execute by chunks to avoid excessive memory usage
    this.executeBatchChunk(cmdParam, prepare, 0, batchSize, totalBatches, results, resolve, reject);
  }

  /**
   * Execute a chunk of the batch operations
   *
   * @param {Object} cmdParam - Command parameters
   * @param {Object} prepare - Prepared statement
   * @param {Number} chunkIndex - Current chunk index
   * @param {Number} batchSize - Size of each batch chunk
   * @param {Number} totalBatches - Total number of chunks
   * @param {Array} results - Accumulated results
   * @param {Function} resolve - Promise resolve function
   * @param {Function} reject - Promise reject function
   * @private
   */
  executeBatchChunk(cmdParam, prepare, chunkIndex, batchSize, totalBatches, results, resolve, reject) {
    const values = cmdParam.values;
    const startIdx = chunkIndex * batchSize;
    const endIdx = Math.min(startIdx + batchSize, values.length);
    const executes = [];

    // Create execute promises for this chunk
    for (let i = startIdx; i < endIdx; i++) {
      executes.push(prepare.execute(values[i], cmdParam.opts, null, cmdParam.stack));
    }

    // Execute all promises in this chunk
    Promise.all(executes)
      .then(
        (chunkResults) => {
          // Add results from this chunk to accumulated results
          results.push(...chunkResults);

          // If this was the last chunk, process results
          if (chunkIndex === totalBatches - 1) {
            const cmdOpt = Object.assign({}, this.opts, cmdParam.opts);
            this.processBatchResults(results, cmdOpt, cmdParam, resolve);
            prepare.close();
          } else {
            // Process next chunk
            setImmediate(() => {
              this.executeBatchChunk(
                cmdParam,
                prepare,
                chunkIndex + 1,
                batchSize,
                totalBatches,
                results,
                resolve,
                reject
              );
            });
          }
        },
        (err) => {
          prepare.close();
          reject(err);
        }
      )
      .catch((err) => {
        prepare.close();
        reject(err);
      });
  }

  /**
   * Process batch results from individual executions
   *
   * @param {Array} results - Array of individual results
   * @param {Object} cmdOpt - Command options
   * @param {Object} cmdParam - Command parameters
   * @param {Function} resolve - Promise resolve function
   * @private
   */
  processBatchResults(results, cmdOpt, cmdParam, resolve) {
    // Handle empty results case
    if (!results.length) {
      resolve(cmdOpt.metaAsArray ? [[], []] : []);
      return;
    }

    // Return full results when requested
    const fullResult = cmdOpt.fullResult === undefined || cmdOpt.fullResult;
    if (fullResult) {
      if (cmdOpt.metaAsArray) {
        const aggregateResults = results.reduce((accumulator, currentValue) => {
          if (Array.isArray(currentValue[0])) {
            accumulator.push(...currentValue[0]);
          } else if (currentValue[0] instanceof OkPacket) {
            accumulator.push(currentValue[0]);
          } else {
            accumulator.push([currentValue[0]]);
          }
          return accumulator;
        }, []);
        const meta = results[0][1];
        resolve([aggregateResults, meta]);
      } else {
        const aggregateResults = results.reduce((accumulator, currentValue) => {
          if (currentValue instanceof OkPacket) {
            accumulator.push(currentValue);
          } else if (!cmdOpt.rowsAsArray && Array.isArray(currentValue[0])) {
            accumulator.push(...currentValue[0]);
          } else {
            accumulator.push(currentValue[0]);
          }
          return accumulator;
        }, []);
        const meta = results[0].meta;
        Object.defineProperty(aggregateResults, 'meta', {
          value: meta,
          writable: true,
          enumerable: cmdOpt.metaEnumerable
        });
        resolve(aggregateResults);
      }
      return;
    }

    // Get first result to determine result type
    const firstResult = cmdOpt.metaAsArray ? results[0][0] : results[0];

    // Process based on result type
    if (firstResult instanceof OkPacket) {
      this.aggregateOkPackets(results, cmdOpt, resolve);
    } else {
      this.aggregateResultSets(results, cmdOpt, resolve);
    }
  }

  /**
   * Aggregate OK packets from multiple executions
   *
   * @param {Array} results - Array of individual results
   * @param {Object} cmdOpt - Command options
   * @param {Function} resolve - Promise resolve function
   * @private
   */
  aggregateOkPackets(results, cmdOpt, resolve) {
    // Get first packet's insertId and last packet's warning status
    const insertId = results[0].insertId;
    const warningStatus = results[results.length - 1].warningStatus;
    let affectedRows = 0;

    if (cmdOpt.metaAsArray) {
      // Use reduce for better performance with large result sets
      affectedRows = results.reduce((sum, result) => sum + result[0].affectedRows, 0);
      resolve([new OkPacket(affectedRows, insertId, warningStatus), []]);
    } else {
      affectedRows = results.reduce((sum, result) => sum + result.affectedRows, 0);
      resolve(new OkPacket(affectedRows, insertId, warningStatus));
    }
  }

  /**
   * Aggregate result sets from multiple executions
   *
   * @param {Array} results - Array of individual results
   * @param {Object} cmdOpt - Command options
   * @param {Function} resolve - Promise resolve function
   * @private
   */
  aggregateResultSets(results, cmdOpt, resolve) {
    if (cmdOpt.metaAsArray) {
      // Calculate total length to avoid resizing
      const totalLength = results.reduce((sum, row) => sum + (row[0]?.length || 0), 0);
      const rs = new Array(totalLength);

      // Efficiently copy all results into a single array
      let index = 0;
      for (const row of results) {
        if (row[0] && row[0].length) {
          const rowData = row[0];
          for (let i = 0; i < rowData.length; i++) {
            rs[index++] = rowData[i];
          }
        }
      }

      resolve([rs.slice(0, index), results[0][1]]);
    } else {
      // Calculate total length to avoid resizing
      const totalLength = results.reduce((sum, row) => sum + (Array.isArray(row) ? row.length : 0), 0);
      const rs = new Array(totalLength);

      // Efficiently copy all results into a single array
      let index = 0;
      for (const row of results) {
        if (Array.isArray(row) && row.length) {
          for (let i = 0; i < row.length; i++) {
            rs[index++] = row[i];
          }
        }
      }

      // Create final result array and add metadata
      const finalResult = rs.slice(0, index);

      // Add metadata as non-enumerable property
      if (results[0] && results[0].meta) {
        Object.defineProperty(finalResult, 'meta', {
          value: results[0].meta,
          writable: true,
          enumerable: cmdOpt.metaEnumerable
        });
      }

      resolve(finalResult);
    }
  }

  /**
   * Send an empty MySQL packet to ensure connection is active, and reset @@wait_timeout
   * @param {Object} cmdParam - command context
   * @param {Function} resolve - success function
   * @param {Function} reject - rejection function
   */
  ping(cmdParam, resolve, reject) {
    // Handle custom timeout if provided
    if (cmdParam.opts && cmdParam.opts.timeout !== undefined) {
      // Validate timeout value
      if (cmdParam.opts.timeout < 0) {
        const err = Errors.createError(
          'Ping cannot have negative timeout value',
          Errors.client.ER_BAD_PARAMETER_VALUE,
          this.info,
          '0A000'
        );
        this._logAndReject(reject, err);
        return;
      }

      let timeoutRef = setTimeout(
        function () {
          // If a timeout occurs, mark the variable as cleared to avoid double resolve
          timeoutRef = undefined;

          // Create an error with proper details
          const err = Errors.createFatalError('Ping timeout', Errors.client.ER_PING_TIMEOUT, this.info, '0A000');

          // Close connection properly
          this.addCommand = this.addCommandDisabled;
          clearTimeout(this.timeout);

          if (this.status !== Status.CLOSING && this.status !== Status.CLOSED) {
            this.sendQueue.clear();
            this.status = Status.CLOSED;
            this.socket.destroy();
          }

          this.clear();
          this._logAndReject(reject, err);
        }.bind(this),
        cmdParam.opts.timeout
      );

      // Create a ping command with wrapped callbacks to handle timeout
      this.addCommand(
        new Ping(
          cmdParam,
          () => {
            // Successful ping response - clear timeout if it hasn't fired yet
            if (timeoutRef) {
              clearTimeout(timeoutRef);
              resolve();
            }
          },
          (err) => {
            // Error during ping - clear timeout if it hasn't fired yet
            if (timeoutRef) {
              clearTimeout(timeoutRef);
              this._logAndReject(reject, err);
            }
          }
        ),
        true
      );

      return;
    }

    // Simple ping without custom timeout
    this.addCommand(new Ping(cmdParam, resolve, reject), true);
  }

  /**
   * Send a reset command that will
   * - roll back any open transaction
   * - reset transaction isolation level
   * - reset session variables
   * - delete user variables
   * - remove temporary tables
   * - remove all PREPARE statement
   */
  reset(cmdParam, resolve, reject) {
    if (
      (this.info.isMariaDB() && this.info.hasMinVersion(10, 2, 4)) ||
      (!this.info.isMariaDB() && this.info.hasMinVersion(5, 7, 3))
    ) {
      const conn = this;
      const resetCmd = new Reset(
        cmdParam,
        () => {
          if (conn.prepareCache) conn.prepareCache.reset();
          let prom = Promise.resolve();
          // re-execute init query / session query timeout
          prom
            .then(conn.handleCharset.bind(conn))
            .then(conn.handleTimezone.bind(conn))
            .then(conn.executeInitQuery.bind(conn))
            .then(conn.executeSessionTimeout.bind(conn))
            .then(resolve)
            .catch(reject);
        },
        reject
      );
      this.addCommand(resetCmd, true);
      return;
    }

    const err = new Error(
      `Reset command not permitted for server ${
        this.info.serverVersion.raw
      } (requires server MariaDB version 10.2.4+ or MySQL 5.7.3+)`
    );
    err.stack = cmdParam.stack;
    this._logAndReject(reject, err);
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
  end(cmdParam, resolve, reject) {
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
      const quitCmd = new Quit(cmdParam, ended, ended);
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

        // relying on IP in place of DNS to ensure using same server
        const remoteAddress = this.socket.remoteAddress;
        const connOption = remoteAddress ? Object.assign({}, this.opts, { host: remoteAddress }) : this.opts;

        const killCon = new Connection(connOption);
        killCon
          .connect()
          .then(() => {
            //*************************************************
            //kill connection
            //*************************************************
            new Promise(killCon.query.bind(killCon, { sql: `KILL ${self.info.threadId}` })).finally((err) => {
              const destroyError = Errors.createFatalError(
                'Connection destroyed, command was killed',
                Errors.client.ER_CMD_NOT_EXECUTED_DESTROYED,
                self.info
              );
              if (self.opts.logger.error) self.opts.logger.error(destroyError);
              self.socketErrorDispatchToQueries(destroyError);
              if (self.socket) {
                const sok = self.socket;
                process.nextTick(() => {
                  sok.destroy();
                });
              }
              self.status = Status.CLOSED;
              self.clear();
              new Promise(killCon.end.bind(killCon)).catch(() => {});
            });
          })
          .catch(() => {
            //*************************************************
            //failing to create a kill connection, end normally
            //*************************************************
            const ended = () => {
              let sock = self.socket;
              self.clear();
              self.status = Status.CLOSED;
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
        this.clear();
      }
    }
  }

  pause() {
    this.socket.pause();
  }

  resume() {
    this.socket.resume();
  }

  format(sql, values) {
    const err = Errors.createError(
      '"Connection.format intentionally not implemented. please use Connection.query(sql, values), ' +
        'it will be more secure and faster',
      Errors.client.ER_NOT_IMPLEMENTED_FORMAT,
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
   * Determine if the bulk protocol can be used for batch operations
   *
   * @param {Array} values - Batch values array
   * @param {Object} options - Batch options
   * @return {boolean} Whether bulk protocol can be used
   * @private
   */
  _canUseBulk(values, options) {
    // 1. Check compatibility with fullResult option
    if (options && options.fullResult && (this.info.clientCapabilities & Capabilities.BULK_UNIT_RESULTS) === 0n) {
      return false;
    }

    // 2. Determine if bulk operations are enabled
    const bulkEnable =
      options === undefined || options === null
        ? this.opts.bulk
        : options.bulk !== undefined && options.bulk !== null
          ? options.bulk
          : this.opts.bulk;

    // 3. Check if server supports bulk operations
    const serverSupportsBulk =
      this.info.serverVersion &&
      this.info.serverVersion.mariaDb &&
      this.info.hasMinVersion(10, 2, 7) &&
      (this.info.serverCapabilities & Capabilities.MARIADB_CLIENT_STMT_BULK_OPERATIONS) > 0n;

    // If server doesn't support bulk or it's disabled, return false
    if (!serverSupportsBulk || !bulkEnable) {
      return false;
    }

    // 4. No need to validate values if none provided
    if (values === undefined) {
      return true;
    }

    // 5. Validate values based on placeholder type
    if (!this.opts.namedPlaceholders) {
      // For positional parameters
      return this._validatePositionalParameters(values);
    } else {
      // For named parameters
      return this._validateNamedParameters(values);
    }
  }

  /**
   * Validate batch values for positional parameters
   *
   * @param {Array} values - Batch values array
   * @return {boolean} Whether values are valid for bulk protocol
   * @private
   */
  _validatePositionalParameters(values) {
    // Determine expected parameter length
    const paramLen = Array.isArray(values[0]) ? values[0].length : values[0] ? 1 : 0;

    // If no parameters, can't use bulk
    if (paramLen === 0) {
      return false;
    }

    // Check parameter consistency and streaming
    for (const row of values) {
      const rowArray = Array.isArray(row) ? row : [row];

      // All parameter sets must have same length
      if (paramLen !== rowArray.length) {
        return false;
      }

      // Check for streaming data (not permitted)
      for (const val of rowArray) {
        if (this._isStreamingValue(val)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Validate batch values for named parameters
   *
   * @param {Array} values - Batch values array
   * @return {boolean} Whether values are valid for bulk protocol
   * @private
   */
  _validateNamedParameters(values) {
    // Check each row for streaming values
    for (const row of values) {
      for (const val of Object.values(row)) {
        if (this._isStreamingValue(val)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Check if a value is a streaming value
   *
   * @param {*} val - Value to check
   * @return {boolean} Whether value is a streaming value
   * @private
   */
  _isStreamingValue(val) {
    return val != null && typeof val === 'object' && typeof val.pipe === 'function' && typeof val.read === 'function';
  }

  executeSessionVariableQuery() {
    if (this.opts.sessionVariables) {
      const values = [];
      let sessionQuery = 'set ';
      let keys = Object.keys(this.opts.sessionVariables);
      if (keys.length > 0) {
        for (let k = 0; k < keys.length; ++k) {
          sessionQuery += (k !== 0 ? ',' : '') + '@@' + keys[k].replace(/[^a-z0-9_]/gi, '') + '=?';
          values.push(this.opts.sessionVariables[keys[k]]);
        }

        return new Promise(
          this.query.bind(this, {
            sql: sessionQuery,
            values: values
          })
        ).catch((initialErr) => {
          const err = Errors.createFatalError(
            `Error setting session variable (value ${JSON.stringify(this.opts.sessionVariables)}). Error: ${
              initialErr.message
            }`,
            Errors.client.ER_SETTING_SESSION_ERROR,
            this.info,
            '08S01',
            sessionQuery
          );
          if (this.opts.logger.error) this.opts.logger.error(err);
          return Promise.reject(err);
        });
      }
    }
    return Promise.resolve();
  }

  /**
   * set charset to charset/collation if set or utf8mb4 if not.
   * @returns {Promise<void>}
   * @private
   */
  handleCharset() {
    if (this.opts.collation) {
      // if index <= 255, skip command, since collation has already been set during handshake response.
      if (this.opts.collation.index <= 255) return Promise.resolve();
      const charset =
        this.opts.collation.charset === 'utf8' && this.opts.collation.maxLength === 4
          ? 'utf8mb4'
          : this.opts.collation.charset;
      return new Promise(
        this.query.bind(this, {
          sql: `SET NAMES ${charset} COLLATE ${this.opts.collation.name}`
        })
      );
    }

    // MXS-4635: server can some information directly on first Ok_Packet, like not truncated collation
    // in this case, avoid useless SET NAMES utf8mb4 command
    if (
      !this.opts.charset &&
      this.info.collation &&
      this.info.collation.charset === 'utf8' &&
      this.info.collation.maxLength === 4
    ) {
      this.info.collation = Collations.fromCharset('utf8mb4');
      return Promise.resolve();
    }
    const connCharset = this.opts.charset ? this.opts.charset : 'utf8mb4';
    this.info.collation = Collations.fromCharset(connCharset);
    return new Promise(
      this.query.bind(this, {
        sql: `SET NAMES ${connCharset}`
      })
    );
  }

  /**
   * Asking server timezone if not set in case of 'auto'
   * @returns {Promise<void>}
   * @private
   */
  handleTimezone() {
    const conn = this;
    if (this.opts.timezone === 'local') this.opts.timezone = undefined;
    if (this.opts.timezone === 'auto') {
      return new Promise(
        this.query.bind(this, {
          sql: 'SELECT @@system_time_zone stz, @@time_zone tz'
        })
      ).then((res) => {
        const serverTimezone = res[0].tz === 'SYSTEM' ? res[0].stz : res[0].tz;
        const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (serverTimezone === localTz || convertFixedTime(serverTimezone, conn) === convertFixedTime(localTz, conn)) {
          //server timezone is identical to client tz, skipping setting
          this.opts.timezone = localTz;
          return Promise.resolve();
        }
        return this._setSessionTimezone(convertFixedTime(localTz, conn));
      });
    }

    if (this.opts.timezone) {
      return this._setSessionTimezone(convertFixedTime(this.opts.timezone, conn));
    }
    return Promise.resolve();
  }

  _setSessionTimezone(tz) {
    return new Promise(
      this.query.bind(this, {
        sql: 'SET time_zone=?',
        values: [tz]
      })
    ).catch((err) => {
      const er = Errors.createError(
        `setting timezone '${
          tz
        }' fails on server.\n look at https://mariadb.com/kb/en/mysql_tzinfo_to_sql/ to load IANA timezone. `,
        Errors.client.ER_WRONG_IANA_TIMEZONE,
        this.info,
        '08S01',
        null,
        false,
        null,
        null,
        err
      );
      return Promise.reject(er);
    });
  }

  checkServerVersion() {
    if (!this.opts.forceVersionCheck) {
      return Promise.resolve();
    }
    return new Promise(
      this.query.bind(this, {
        sql: 'SELECT @@VERSION AS v'
      })
    ).then(
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
        initialPromises.push(
          new Promise(
            this.query.bind(this, {
              sql: sql
            })
          )
        );
      });

      return Promise.all(initialPromises).catch((initialErr) => {
        const err = Errors.createFatalError(
          `Error executing initial sql command: ${initialErr.message}`,
          Errors.client.ER_INITIAL_SQL_ERROR,
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
        new Promise(
          this.query.bind(this, {
            sql: query
          })
        ).catch(
          function (initialErr) {
            const err = Errors.createFatalError(
              `Error setting session queryTimeout: ${initialErr.message}`,
              Errors.client.ER_INITIAL_TIMEOUT_ERROR,
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
          Errors.client.ER_TIMEOUT_NOT_SUPPORTED,
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
  streamInitSocket() {
    if (this.opts.connectTimeout) {
      this.timeout = setTimeout(this.connectTimeoutReached.bind(this), this.opts.connectTimeout, Date.now());
    }
    if (this.opts.socketPath) {
      this.socket = Net.connect(this.opts.socketPath);
    } else if (this.opts.stream) {
      if (typeof this.opts.stream === 'function') {
        const tmpSocket = this.opts.stream(
          function (err, stream) {
            if (err) {
              this.authFailHandler(err);
              return;
            }
            this.socket = stream ? stream : Net.connect(this.opts.port, this.opts.host);
            this.socketInit();
          }.bind(this)
        );
        if (tmpSocket) {
          this.socket = tmpSocket;
          this.socketInit();
        }
      } else {
        this.authFailHandler(
          Errors.createError(
            'stream option is not a function. stream must be a function with (error, callback) parameter',
            Errors.client.ER_BAD_PARAMETER_VALUE,
            this.info
          )
        );
      }
      return;
    } else {
      this.socket = Net.connect(this.opts.port, this.opts.host);
      this.socket.setNoDelay(true);
    }
    this.socketInit();
  }

  socketInit() {
    this.socket.on('data', this.streamIn.onData.bind(this.streamIn));
    this.socket.on('error', this.socketErrorHandler.bind(this));
    this.socket.on('end', this.socketErrorHandler.bind(this));
    this.socket.on(
      'connect',
      function () {
        if (this.status === Status.CONNECTING) {
          this.status = Status.AUTHENTICATING;
          this.socket.setTimeout(this.opts.socketTimeout, this.socketTimeoutReached.bind(this));
          // Keep alive for socket. This won't reset server wait_timeout use pool option idleTimeout for that
          if (this.opts.keepAliveDelay !== undefined) {
            if (this.opts.keepAliveDelay >= 0) {
              this.socket.setKeepAlive(true, this.opts.keepAliveDelay);
            } else {
              this.socket.setKeepAlive(true);
            }
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
  authSucceedHandler() {
    //enable packet compression according to option
    if (this.opts.compress) {
      if (this.info.serverCapabilities & Capabilities.COMPRESS) {
        this.streamOut.setStream(new CompressionOutputStream(this.socket, this.opts, this.info));
        this.streamIn = new CompressionInputStream(this.streamIn, this.receiveQueue, this.opts, this.info);
        this.socket.removeAllListeners('data');
        this.socket.on('data', this.streamIn.onData.bind(this.streamIn));
      } else if (this.opts.logger.error) {
        this.opts.logger.error(
          Errors.createError(
            "connection is configured to use packet compression, but the server doesn't have this capability",
            Errors.client.ER_COMPRESSION_NOT_SUPPORTED,
            this.info
          )
        );
      }
    }

    this.addCommand = this.opts.pipelining ? this.addCommandEnablePipeline : this.addCommandEnable;
    const conn = this;
    this.status = Status.INIT_CMD;
    this.executeSessionVariableQuery()
      .then(conn.handleCharset.bind(conn))
      .then(this.handleTimezone.bind(this))
      .then(this.checkServerVersion.bind(this))
      .then(this.executeInitQuery.bind(this))
      .then(this.executeSessionTimeout.bind(this))
      .then(() => {
        clearTimeout(this.timeout);
        conn.status = Status.CONNECTED;
        process.nextTick(conn.connectResolveFct, conn);

        const commands = conn.waitingAuthenticationQueue.toArray();
        commands.forEach((cmd) => {
          conn.addCommand(cmd, true);
        });
        conn.waitingAuthenticationQueue = null;

        conn.connectRejectFct = null;
        conn.connectResolveFct = null;
      })
      .catch((err) => {
        if (!err.fatal) {
          const res = () => {
            conn.authFailHandler.call(conn, err);
          };
          conn.end(res, res);
        } else {
          conn.authFailHandler.call(conn, err);
        }
      });
  }

  /**
   * Authentication failed handler.
   *
   * @private
   */
  authFailHandler(err) {
    clearTimeout(this.timeout);
    if (this.connectRejectFct) {
      if (this.opts.logger.error) this.opts.logger.error(err);
      //remove handshake command
      this.receiveQueue.shift();
      this.fatalError(err, true);

      process.nextTick(this.connectRejectFct, err);
      this.connectRejectFct = null;
    }
  }

  /**
   * Create a TLS socket and associate events.
   *
   * @param info current connection information
   * @param callback  callback function when done
   * @private
   */
  createSecureContext(info, callback) {
    info.requireValidCert =
      this.opts.ssl === true ||
      (this.opts.ssl && (this.opts.ssl.rejectUnauthorized === undefined || this.opts.ssl.rejectUnauthorized === true));

    const baseConf = { socket: this.socket };
    if (info.isMariaDB()) {
      // for MariaDB servers, permit self-signed certificated
      // this will be replaced by fingerprint validation with ending OK_PACKET
      baseConf['rejectUnauthorized'] = false;
    }
    const sslOption = this.opts.ssl === true ? baseConf : Object.assign({}, this.opts.ssl, baseConf);

    try {
      const secureSocket = tls.connect(sslOption, callback);
      secureSocket.on('data', this.streamIn.onData.bind(this.streamIn));
      secureSocket.on('error', this.socketErrorHandler.bind(this));
      secureSocket.on('end', this.socketErrorHandler.bind(this));
      secureSocket.writeBuf = (buf) => secureSocket.write(buf);
      secureSocket.flush = () => {};

      this.socket.removeAllListeners('data');
      this.socket = secureSocket;

      this.streamOut.setStream(secureSocket);
    } catch (err) {
      this.socketErrorHandler(err);
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
        Errors.client.ER_UNEXPECTED_PACKET,
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
  connectTimeoutReached(initialConnectionTime) {
    this.timeout = null;
    const handshake = this.receiveQueue.peekFront();
    const err = Errors.createFatalError(
      `Connection timeout: failed to create socket after ${Date.now() - initialConnectionTime}ms`,
      Errors.client.ER_CONNECTION_TIMEOUT,
      this.info,
      '08S01',
      null,
      handshake ? handshake.stack : null
    );
    if (this.opts.logger.error) this.opts.logger.error(err);
    this.authFailHandler(err);
  }

  /**
   * Handle socket timeout.
   *
   * @private
   */
  socketTimeoutReached() {
    clearTimeout(this.timeout);
    const err = Errors.createFatalError('socket timeout', Errors.client.ER_SOCKET_TIMEOUT, this.info);
    if (this.opts.logger.error) this.opts.logger.error(err);
    this.fatalError(err, true);
  }

  /**
   * Add command to the waiting queue until authentication.
   *
   * @param cmd         command
   * @private
   */
  addCommandQueue(cmd) {
    this.waitingAuthenticationQueue.push(cmd);
  }

  /**
   * Add command to command sending and receiving queue.
   *
   * @param cmd         command
   * @param expectResponse queue command response
   * @private
   */
  addCommandEnable(cmd, expectResponse) {
    cmd.once('end', this._sendNextCmdImmediate.bind(this));

    //send immediately only if no current active receiver
    if (this.sendQueue.isEmpty() && this.receiveQueue.isEmpty()) {
      if (expectResponse) this.receiveQueue.push(cmd);
      cmd.start(this.streamOut, this.opts, this.info);
    } else {
      if (expectResponse) this.receiveQueue.push(cmd);
      this.sendQueue.push(cmd);
    }
  }

  /**
   * Add command to command sending and receiving queue using pipelining
   *
   * @param cmd             command
   * @param expectResponse queue command response
   * @private
   */
  addCommandEnablePipeline(cmd, expectResponse) {
    cmd.once('send_end', this._sendNextCmdImmediate.bind(this));

    if (expectResponse) this.receiveQueue.push(cmd);
    if (this.sendQueue.isEmpty()) {
      cmd.start(this.streamOut, this.opts, this.info);
      if (cmd.sending) {
        this.sendQueue.push(cmd);
        cmd.prependOnceListener('send_end', this.sendQueue.shift.bind(this.sendQueue));
      }
    } else {
      this.sendQueue.push(cmd);
    }
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
      Errors.client.ER_CMD_CONNECTION_CLOSED
    );
    if (this.opts.logger.error) this.opts.logger.error(err);
  }

  /**
   * Handle socket error.
   *
   * @param err               socket error
   * @private
   */
  socketErrorHandler(err) {
    if (this.status >= Status.CLOSING) return;
    if (this.socket) {
      this.socket.writeBuf = () => {};
      this.socket.flush = () => {};
    }

    //socket has been ended without error
    if (!err) {
      err = Errors.createFatalError(
        'socket has unexpectedly been closed',
        Errors.client.ER_SOCKET_UNEXPECTED_CLOSE,
        this.info
      );
    } else {
      err.fatal = true;
      err.sqlState = 'HY000';
    }

    switch (this.status) {
      case Status.CONNECTING:
      case Status.AUTHENTICATING:
        const currentCmd = this.receiveQueue.peekFront();
        if (currentCmd && currentCmd.stack && err) {
          err.stack += '\n From event:\n' + currentCmd.stack.substring(currentCmd.stack.indexOf('\n') + 1);
        }
        this.authFailHandler(err);
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
      this.socket.removeAllListeners();
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
        setImmediate(receiveCmd.throwError.bind(receiveCmd, err, this.info));
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
   * @param cmdParam command parameter
   * @param resolve success function to call
   * @param reject error function to call
   * @private
   */
  changeTransaction(cmdParam, resolve, reject) {
    if (this.status >= Status.CLOSING) {
      const err = Errors.createFatalError(
        'Cannot execute new commands: connection closed',
        Errors.client.ER_CMD_CONNECTION_CLOSED,
        this.info,
        '08S01',
        cmdParam.sql
      );
      this._logAndReject(reject, err);
      return;
    }

    //Command in progress => must execute the query,
    //or if no command in progress, can rely on status to know if a query is needed
    if (this.receiveQueue.peekFront() || this.info.status & ServerStatus.STATUS_IN_TRANS) {
      const cmd = new Query(resolve, this._logAndReject.bind(this, reject), this.opts, cmdParam);
      this.addCommand(cmd, true);
    } else resolve();
  }

  changeUser(cmdParam, resolve, reject) {
    if (!this.info.isMariaDB()) {
      const err = Errors.createError(
        'method changeUser not available for MySQL server due to Bug #83472',
        Errors.client.ER_MYSQL_CHANGE_USER_BUG,
        this.info,
        '0A000'
      );
      this._logAndReject(reject, err);
      return;
    }
    if (this.status < Status.CLOSING) {
      this.addCommand = this.addCommandEnable;
    }
    let conn = this;
    if (cmdParam.opts && cmdParam.opts.collation && typeof cmdParam.opts.collation === 'string') {
      const val = cmdParam.opts.collation.toUpperCase();
      cmdParam.opts.collation = Collations.fromName(cmdParam.opts.collation.toUpperCase());
      if (cmdParam.opts.collation === undefined) return reject(new RangeError(`Unknown collation '${val}'`));
    }

    this.addCommand(
      new ChangeUser(
        cmdParam,
        this.opts,
        (res) => {
          if (conn.status < Status.CLOSING && conn.opts.pipelining) conn.addCommand = conn.addCommandEnablePipeline;
          if (cmdParam.opts && cmdParam.opts.collation) conn.opts.collation = cmdParam.opts.collation;
          conn
            .handleCharset()
            .then(() => {
              if (cmdParam.opts && cmdParam.opts.collation) {
                conn.info.collation = cmdParam.opts.collation;
                conn.opts.emit('collation', cmdParam.opts.collation);
              }
              resolve(res);
            })
            .catch((err) => {
              const res = () => conn.authFailHandler.call(conn, err);
              if (!err.fatal) {
                conn.end(res, res);
              } else {
                res();
              }
              reject(err);
            });
        },
        this.authFailHandler.bind(this, reject),
        this.getSocket.bind(this)
      ),
      true
    );
  }

  query(cmdParam, resolve, reject) {
    if (!cmdParam.sql)
      return reject(
        Errors.createError(
          'sql parameter is mandatory',
          Errors.client.ER_UNDEFINED_SQL,
          this.info,
          'HY000',
          null,
          false,
          cmdParam.stack
        )
      );
    const cmd = new Query(resolve, (err) => this._logAndReject(reject, err), this.opts, cmdParam);
    this.addCommand(cmd, true);
  }

  prepare(cmdParam, resolve, reject) {
    if (!cmdParam.sql) {
      reject(Errors.createError('sql parameter is mandatory', Errors.client.ER_UNDEFINED_SQL, this.info, 'HY000'));
      return;
    }
    if (this.prepareCache && (this.sendQueue.isEmpty() || !this.receiveQueue.peekFront())) {
      // no command in queue, database is then considered ok, and cache can be search right now
      const cachedPrepare = this.prepareCache.get(cmdParam.sql);
      if (cachedPrepare) {
        resolve(cachedPrepare);
        return;
      }
    }

    const cmd = new Prepare(resolve, (err) => this._logAndReject(reject, err), this.opts, cmdParam, this);
    this.addCommand(cmd, true);
  }

  prepareExecute(cmdParam, resolve, reject) {
    if (!cmdParam.sql) {
      reject(Errors.createError('sql parameter is mandatory', Errors.client.ER_UNDEFINED_SQL, this.info, 'HY000'));
      return;
    }

    if (this.prepareCache && (this.sendQueue.isEmpty() || !this.receiveQueue.peekFront())) {
      // no command in the queue, the current database is known, so cache can be search right now
      const cachedPrepare = this.prepareCache.get(cmdParam.sql);
      if (cachedPrepare) {
        this.executePromise(
          cmdParam,
          cachedPrepare,
          (res) => {
            resolve(res);
            cachedPrepare.close();
          },
          (err) => {
            reject(err);
            cachedPrepare.close();
          }
        );
        return;
      }
    }

    // permit pipelining PREPARE and EXECUTE if mariadb 10.2.4+ and has no streaming
    const conn = this;
    if (this.opts.pipelining && this.info.isMariaDB() && this.info.hasMinVersion(10, 2, 4)) {
      let hasStreamingValue = false;
      const vals = cmdParam.values ? (Array.isArray(cmdParam.values) ? cmdParam.values : [cmdParam.values]) : [];
      for (let i = 0; i < vals.length; i++) {
        const val = vals[i];
        if (
          val != null &&
          typeof val === 'object' &&
          typeof val.pipe === 'function' &&
          typeof val.read === 'function'
        ) {
          hasStreamingValue = true;
        }
      }
      if (!hasStreamingValue) {
        let nbExecute = 0;
        const executeCommand = new Execute(
          (res) => {
            if (nbExecute++ === 0) {
              executeCommand.prepare.close();
              resolve(res);
            }
          },
          (err) => {
            if (nbExecute++ === 0) {
              if (conn.opts.logger.error) conn.opts.logger.error(err);
              reject(err);
              if (executeCommand.prepare) {
                executeCommand.prepare.close();
              }
            }
          },
          conn.opts,
          cmdParam,
          null
        );
        cmdParam.executeCommand = executeCommand;
        const cmd = new Prepare(
          (prep) => {
            if (nbExecute > 0) prep.close();
          },
          (err) => {
            if (nbExecute++ === 0) {
              if (conn.opts.logger.error) conn.opts.logger.error(err);
              reject(err);
            }
          },
          conn.opts,
          cmdParam,
          conn
        );
        conn.addCommand(cmd, true);
        conn.addCommand(executeCommand, true);
        return;
      }
    }

    // execute PREPARE, then EXECUTE
    const cmd = new Prepare(
      (prepare) => {
        conn.executePromise(
          cmdParam,
          prepare,
          (res) => {
            resolve(res);
            prepare.close();
          },
          (err) => {
            if (conn.opts.logger.error) conn.opts.logger.error(err);
            reject(err);
            prepare.close();
          }
        );
      },
      (err) => {
        if (conn.opts.logger.error) conn.opts.logger.error(err);
        reject(err);
      },
      this.opts,
      cmdParam,
      conn
    );
    conn.addCommand(cmd, true);
  }

  importFile(cmdParam, resolve, reject) {
    const conn = this;
    if (!cmdParam || !cmdParam.file) {
      return reject(
        Errors.createError(
          'SQL file parameter is mandatory',
          Errors.client.ER_MISSING_SQL_PARAMETER,
          conn.info,
          'HY000',
          null,
          false,
          cmdParam.stack
        )
      );
    }

    const prevAddCommand = this.addCommand.bind(conn);

    this.waitingAuthenticationQueue = new Queue();
    this.addCommand = this.addCommandQueue;
    const tmpQuery = function (sql, resolve, reject) {
      const cmd = new Query(
        resolve,
        (err) => {
          if (conn.opts.logger.error) conn.opts.logger.error(err);
          reject(err);
        },
        conn.opts,
        {
          sql: sql,
          opts: {}
        }
      );
      prevAddCommand(cmd, true);
    };

    let prevDatabase = null;
    return (
      cmdParam.skipDbCheck ? Promise.resolve() : new Promise(tmpQuery.bind(conn, 'SELECT DATABASE() as db'))
    ).then((res) => {
      prevDatabase = res ? res[0].db : null;
      if (
        (cmdParam.skipDbCheck && !conn.opts.database) ||
        (!cmdParam.skipDbCheck && !cmdParam.database && !prevDatabase)
      ) {
        return reject(
          Errors.createError(
            'Database parameter is not set and no database is selected',
            Errors.client.ER_MISSING_DATABASE_PARAMETER,
            conn.info,
            'HY000',
            null,
            false,
            cmdParam.stack
          )
        );
      }
      const searchDbPromise = cmdParam.database
        ? new Promise(tmpQuery.bind(conn, `USE \`${cmdParam.database.replace(/`/gi, '``')}\``))
        : Promise.resolve();
      return searchDbPromise.then(() => {
        const endingFunction = () => {
          if (conn.status < Status.CLOSING) {
            conn.addCommand = conn.addCommandEnable.bind(conn);
            if (conn.status < Status.CLOSING && conn.opts.pipelining) {
              conn.addCommand = conn.addCommandEnablePipeline.bind(conn);
            }
            const commands = conn.waitingAuthenticationQueue.toArray();
            commands.forEach((cmd) => conn.addCommand(cmd, true));
            conn.waitingAuthenticationQueue = null;
          }
        };
        return fsPromises
          .open(cmdParam.file, 'r')
          .then(async (fd) => {
            const buf = {
              buffer: Buffer.allocUnsafe(16384),
              offset: 0,
              end: 0
            };

            const queryPromises = [];
            let cmdError = null;
            while (!cmdError) {
              try {
                const res = await fd.read(buf.buffer, buf.end, buf.buffer.length - buf.end, null);
                if (res.bytesRead === 0) {
                  // end of file reached.
                  fd.close().catch(() => {});
                  if (cmdError) {
                    endingFunction();
                    reject(cmdError);
                    return;
                  }
                  await Promise.allSettled(queryPromises)
                    .then(() => {
                      // reset connection to initial database if was set
                      if (
                        !cmdParam.skipDbCheck &&
                        prevDatabase &&
                        cmdParam.database &&
                        cmdParam.database !== prevDatabase
                      ) {
                        return new Promise(tmpQuery.bind(conn, `USE \`${prevDatabase.replace(/`/gi, '``')}\``));
                      }
                      return Promise.resolve();
                    })
                    .then(() => {
                      endingFunction();
                      if (cmdError) {
                        reject(cmdError);
                      } else {
                        resolve();
                      }
                    })
                    .catch((err) => {
                      endingFunction();
                      reject(err);
                    });
                  return;
                } else {
                  buf.end += res.bytesRead;
                  const queries = parseQueries(buf);
                  const queryIntermediatePromise = queries.flatMap((element) => {
                    return new Promise(tmpQuery.bind(conn, element)).catch((err) => {
                      cmdError = err;
                    });
                  });

                  queryPromises.push(...queryIntermediatePromise);
                  if (buf.offset === buf.end) {
                    buf.offset = 0;
                    buf.end = 0;
                  } else {
                    // ensure that buffer can at least read 8k bytes,
                    // either by copying remaining data on used part or growing buffer
                    if (buf.offset > 8192) {
                      // reuse buffer, copying remaining data begin of buffer
                      buf.buffer.copy(buf.buffer, 0, buf.offset, buf.end);
                      buf.end -= buf.offset;
                      buf.offset = 0;
                    } else if (buf.buffer.length - buf.end < 8192) {
                      // grow buffer
                      const tmpBuf = Buffer.allocUnsafe(buf.buffer.length << 1);
                      buf.buffer.copy(tmpBuf, 0, buf.offset, buf.end);
                      buf.buffer = tmpBuf;
                      buf.end -= buf.offset;
                      buf.offset = 0;
                    }
                  }
                }
              } catch (e) {
                fd.close().catch(() => {});
                endingFunction();
                Promise.allSettled(queryPromises).catch(() => {});
                return reject(
                  Errors.createError(
                    e.message,
                    Errors.client.ER_SQL_FILE_ERROR,
                    conn.info,
                    'HY000',
                    null,
                    false,
                    cmdParam.stack
                  )
                );
              }
            }
            if (cmdError) {
              endingFunction();
              reject(cmdError);
            }
          })
          .catch((err) => {
            endingFunction();
            if (err.code === 'ENOENT') {
              return reject(
                Errors.createError(
                  `SQL file parameter '${cmdParam.file}' doesn't exists`,
                  Errors.client.ER_MISSING_SQL_FILE,
                  conn.info,
                  'HY000',
                  null,
                  false,
                  cmdParam.stack
                )
              );
            }
            return reject(
              Errors.createError(
                err.message,
                Errors.client.ER_SQL_FILE_ERROR,
                conn.info,
                'HY000',
                null,
                false,
                cmdParam.stack
              )
            );
          });
      });
    });
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

  /**
   * Redirecting connection to server indicated value.
   * @param value server host string
   * @param resolve promise result when done
   */
  redirect(value, resolve) {
    if (this.opts.permitRedirect && value) {
      // redirect only if :
      // * when pipelining, having received all waiting responses.
      // * not in a transaction
      if (this.receiveQueue.length <= 1 && (this.info.status & ServerStatus.STATUS_IN_TRANS) === 0) {
        this.info.redirectRequest = null;
        const matchResults = value.match(redirectUrlFormat);
        if (!matchResults) {
          if (this.opts.logger.error)
            this.opts.logger.error(
              new Error(
                'error parsing redirection string ' +
                  value +
                  ". format must be 'mariadb/mysql://[<user>[:<password>]@]<host>[:<port>]/[<db>[?<opt1>=<value1>" +
                  "[&<opt2>=<value2>]]]'"
              )
            );
          return resolve();
        }

        const options = {
          host: matchResults[7] ? decodeURIComponent(matchResults[7]) : matchResults[6],
          port: matchResults[9] ? parseInt(matchResults[9]) : 3306
        };

        if (options.host === this.opts.host && options.port === this.opts.port) {
          // redirection to the same host, skip loop redirection
          return resolve();
        }

        // actually only options accepted are user and password
        // there might be additional possible options in the future
        if (matchResults[3]) options.user = matchResults[3];
        if (matchResults[5]) options.password = matchResults[5];

        const redirectOpts = ConnectionOptions.parseOptionDataType(options);

        const finalRedirectOptions = new ConnOptions(Object.assign({}, this.opts, redirectOpts));
        const conn = new Connection(finalRedirectOptions);
        conn
          .connect()
          .then(
            async function () {
              await new Promise(this.end.bind(this, {}));
              this.status = Status.CONNECTED;
              this.info = conn.info;
              this.opts = conn.opts;
              this.socket = conn.socket;
              if (this.prepareCache) this.prepareCache.reset();
              this.streamOut = conn.streamOut;
              this.streamIn = conn.streamIn;
              resolve();
            }.bind(this)
          )
          .catch(
            function (e) {
              if (this.opts.logger.error) {
                const err = new Error(`fail to redirect to '${value}'`);
                err.cause = e;
                this.opts.logger.error(err);
              }
              resolve();
            }.bind(this)
          );
      } else {
        this.info.redirectRequest = value;
        resolve();
      }
    } else {
      this.info.redirectRequest = null;
      resolve();
    }
  }

  get threadId() {
    return this.info ? this.info.threadId : null;
  }

  _sendNextCmdImmediate() {
    if (!this.sendQueue.isEmpty()) {
      setImmediate(this.nextSendCmd.bind(this));
    }
  }

  _closePrepare(prepareResultPacket) {
    this.addCommand(
      new ClosePrepare(
        {},
        () => {},
        () => {},
        prepareResultPacket
      ),
      false
    );
  }

  _logAndReject(reject, err) {
    if (this.opts.logger.error) this.opts.logger.error(err);
    reject(err);
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

export default Connection;
