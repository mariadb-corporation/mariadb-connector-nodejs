//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import { EventEmitter } from 'node:events';
import Pool from './pool.js';
import * as Errors from './misc/errors.js';
import ConnectionCallback from './connection-callback.js';

class PoolCallback extends EventEmitter {
  #pool;
  constructor(options) {
    super();
    this.#pool = new Pool(options);
    this.#pool.on('acquire', this.emit.bind(this, 'acquire'));
    this.#pool.on('connection', this.emit.bind(this, 'connection'));
    this.#pool.on('enqueue', this.emit.bind(this, 'enqueue'));
    this.#pool.on('release', this.emit.bind(this, 'release'));
    this.#pool.on('error', this.emit.bind(this, 'error'));
  }

  #noop = () => {};

  get closed() {
    return this.#pool.closed;
  }

  /**
   * Get current total connection number.
   * @return {number}
   */
  totalConnections() {
    return this.#pool.totalConnections();
  }

  /**
   * Get current active connections.
   * @return {number}
   */
  activeConnections() {
    return this.#pool.activeConnections();
  }

  /**
   * Get current idle connection number.
   * @return {number}
   */
  idleConnections() {
    return this.#pool.idleConnections();
  }

  /**
   * Get current stacked connection request.
   * @return {number}
   */
  taskQueueSize() {
    return this.#pool.taskQueueSize();
  }

  escape(value) {
    return this.#pool.escape(value);
  }

  escapeId(value) {
    return this.#pool.escapeId(value);
  }

  /**
   * Ends pool
   *
   * @param callback
   */
  end(callback) {
    this.#pool
      .end()
      .then(() => {
        if (callback) callback(null);
      })
      .catch(callback || this.#noop);
  }

  /**
   * Retrieve a connection from the pool.
   * Create a new one if the limit is not reached.
   * wait until acquireTimeout.
   *
   * @param cb callback
   */
  getConnection(cb) {
    if (!cb) {
      throw new Errors.createError('missing mandatory callback parameter', Errors.client.ER_MISSING_PARAMETER);
    }
    const cmdParam = {};
    if (this.#pool.opts.connOptions.trace) Error.captureStackTrace(cmdParam);
    this.#pool.getConnection(cmdParam, (err, baseConn) => {
      if (err) {
        cb(err);
      } else {
        const cc = new ConnectionCallback(baseConn);
        cc.end = (cb) => cc.release(cb);
        cc.close = (cb) => cc.release(cb);
        cb(null, cc);
      }
    });
  }

  /**
   * Execute query using text protocol with callback emit columns/data/end/error
   * events to permit streaming big result-set
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  object / array of placeholder values (not mandatory)
   * @param cb      callback
   */
  query(sql, values, cb) {
    const cmdParam = ConnectionCallback._PARAM(this.#pool.opts.connOptions, sql, values, cb);
    this.#pool.getConnection(cmdParam, (err, baseConn) => {
      if (err) {
        if (cmdParam.callback) cmdParam.callback(err);
      } else {
        const _cb = cmdParam.callback;
        cmdParam.callback = (err, rows, meta) => {
          this.#pool.release(baseConn);
          if (_cb) _cb(err, rows, meta);
        };
        ConnectionCallback._QUERY_CMD(baseConn, cmdParam);
      }
    });
  }

  /**
   * Execute query using binary protocol with callback emit columns/data/end/error
   * events to permit streaming big result-set
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  object / array of placeholder values (not mandatory)
   * @param cb      callback
   */
  execute(sql, values, cb) {
    const cmdParam = ConnectionCallback._PARAM(this.#pool.opts.connOptions, sql, values, cb);

    this.#pool.getConnection(cmdParam, (err, baseConn) => {
      if (err) {
        if (cmdParam.callback) cmdParam.callback(err);
      } else {
        const _cb = cmdParam.callback;
        baseConn.prepareExecute(
          cmdParam,
          (res) => {
            this.#pool.release(baseConn);
            if (_cb) _cb(null, res, res.meta);
          },
          (err) => {
            this.#pool.release(baseConn);
            if (_cb) _cb(err);
          }
        );
      }
    });
  }

  /**
   * execute a batch
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  array of placeholder values
   * @param cb      callback
   */
  batch(sql, values, cb) {
    const cmdParam = ConnectionCallback._PARAM(this.#pool.opts.connOptions, sql, values, cb);
    this.#pool.getConnection(cmdParam, (err, baseConn) => {
      if (err) {
        if (cmdParam.callback) cmdParam.callback(err);
      } else {
        const _cb = cmdParam.callback;
        baseConn.batch(
          cmdParam,
          (res) => {
            this.#pool.release(baseConn);
            if (_cb) _cb(null, res);
          },
          (err) => {
            this.#pool.release(baseConn);
            if (_cb) _cb(err);
          }
        );
      }
    });
  }

  /**
   * Import sql file.
   *
   * @param opts JSON array with 2 possible fields: file and database
   * @param cb callback
   */
  importFile(opts, cb) {
    if (!opts) {
      if (cb)
        cb(
          Errors.createError(
            'SQL file parameter is mandatory',
            Errors.client.ER_MISSING_SQL_PARAMETER,
            null,
            'HY000',
            null,
            false,
            null
          )
        );
      return;
    }
    this.#pool.getConnection({}, (err, baseConn) => {
      if (err) {
        if (cb) cb(err);
      } else {
        baseConn.importFile(
          { file: opts.file, database: opts.database },
          (res) => {
            this.#pool.release(baseConn);
            if (cb) cb(null, res);
          },
          (err) => {
            this.#pool.release(baseConn);
            if (cb) cb(err);
          }
        );
      }
    });
  }
  toString() {
    return 'poolCallback(' + this.#pool.toString() + ')';
  }
}

export default PoolCallback;
