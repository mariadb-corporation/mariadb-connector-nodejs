//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

const { EventEmitter } = require('events');

const Pool = require('./pool');
const ConnectionPromise = require('./connection-promise');
const Errors = require('./misc/errors');

class PoolPromise extends EventEmitter {
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
   * @return Promise
   **/
  end() {
    return this.#pool.end();
  }

  /**
   * Retrieve a connection from pool.
   * Create a new one, if limit is not reached.
   * wait until acquireTimeout.
   *
   */
  async getConnection() {
    const cmdParam = {};
    if (this.#pool.opts.connOptions.trace) Error.captureStackTrace(cmdParam);
    return new Promise((resolve, reject) => {
      this.#pool.getConnection(cmdParam, (err, baseConn) => {
        if (err) {
          reject(err);
        } else {
          const conn = new ConnectionPromise(baseConn);
          conn.release = () => new Promise(baseConn.release);
          conn.end = conn.release;
          conn.close = conn.release;
          resolve(conn);
        }
      });
    });
  }

  /**
   * Execute query using text protocol with callback emit columns/data/end/error
   * events to permit streaming big result-set
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  object / array of placeholder values (not mandatory)
   */
  query(sql, values) {
    const cmdParam = ConnectionPromise.paramSetter(sql, values);
    if (this.#pool.opts.connOptions.trace) Error.captureStackTrace(cmdParam);
    return new Promise((resolve, reject) => {
      return this.#pool.getConnection(cmdParam, (err, baseConn) => {
        if (err) {
          reject(err);
        } else {
          baseConn.query(
            cmdParam,
            (res) => {
              this.#pool.release(baseConn);
              resolve(res);
            },
            (err) => {
              this.#pool.release(baseConn);
              reject(err);
            }
          );
        }
      });
    });
  }

  /**
   * Execute query using binary protocol with callback emit columns/data/end/error
   * events to permit streaming big result-set
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  object / array of placeholder values (not mandatory)
   */
  execute(sql, values) {
    const cmdParam = ConnectionPromise.paramSetter(sql, values);
    if (this.#pool.opts.connOptions.trace) Error.captureStackTrace(cmdParam);
    return new Promise((resolve, reject) => {
      return this.#pool.getConnection(cmdParam, (err, baseConn) => {
        if (err) {
          reject(err);
        } else {
          baseConn.prepareExecute(
            cmdParam,
            (res) => {
              this.#pool.release(baseConn);
              resolve(res);
            },
            (err) => {
              this.#pool.release(baseConn);
              reject(err);
            }
          );
        }
      });
    });
  }

  /**
   * execute a batch
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  array of placeholder values
   */
  batch(sql, values) {
    const cmdParam = ConnectionPromise.paramSetter(sql, values);
    if (this.#pool.opts.connOptions.trace) Error.captureStackTrace(cmdParam);
    return new Promise((resolve, reject) => {
      return this.#pool.getConnection(cmdParam, (err, baseConn) => {
        if (err) {
          reject(err);
        } else {
          baseConn.batch(
            cmdParam,
            (res) => {
              this.#pool.release(baseConn);
              resolve(res);
            },
            (err) => {
              this.#pool.release(baseConn);
              reject(err);
            }
          );
        }
      });
    });
  }

  /**
   * Import sql file.
   *
   * @param opts JSON array with 2 possible fields: file and database
   */
  importFile(opts) {
    if (!opts) {
      return Promise.reject(
        Errors.createError(
          'SQL file parameter is mandatory',
          Errors.ER_MISSING_SQL_PARAMETER,
          null,
          'HY000',
          null,
          false,
          null
        )
      );
    }

    return new Promise((resolve, reject) => {
      return this.#pool.getConnection({}, (err, baseConn) => {
        if (err) {
          reject(err);
        } else {
          baseConn.importFile(
            { file: opts.file, database: opts.database },
            (res) => {
              this.#pool.release(baseConn);
              resolve(res);
            },
            (err) => {
              this.#pool.release(baseConn);
              reject(err);
            }
          );
        }
      });
    });
  }

  toString() {
    return 'poolPromise(' + this.#pool.toString() + ')';
  }
}

module.exports = PoolPromise;
