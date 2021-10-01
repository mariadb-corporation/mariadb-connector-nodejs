'use strict';

const { EventEmitter } = require('events');

const Pool = require('./pool');
const Errors = require('./misc/errors');
const ConnectionCallback = require('./connection-callback');

class PoolCallback extends EventEmitter {
  #pool;
  constructor(options) {
    super();
    this.#pool = new Pool(options);
    this.#pool.on('acquire', this.emit.bind(this, 'acquire'));
    this.#pool.on('connection', this.emit.bind(this, 'connection'));
    this.#pool.on('enqueue', this.emit.bind(this, 'enqueue'));
    this.#pool.on('release', this.emit.bind(this, 'release'));
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
   * Retrieve a connection from pool.
   * Create a new one, if limit is not reached.
   * wait until acquireTimeout.
   *
   * @param cb callback
   */
  getConnection(cb) {
    if (!cb) {
      throw new Errors.createError('missing mandatory callback parameter', Errors.ER_MISSING_PARAMETER);
    }
    this.#pool
      .getConnection()
      .then((baseConn) => {
        const conn = new ConnectionCallback(baseConn);
        conn.release = function () {
          return new Promise(baseConn.release);
        };
        conn.release = (cb) => {
          baseConn.release(
            () => {
              if (cb) cb();
            },
            (err) => {
              if (cb) cb(err);
            }
          );
        };
        conn.end = conn.release;
        cb(null, conn);
      })
      .catch(cb);
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
    let _cb = cb,
      _values = values;

    if (typeof values === 'function') {
      _cb = values;
      _values = undefined;
    }

    this.#pool
      .getConnection()
      .then((baseConn) => {
        ConnectionCallback._QUERY_CMD(baseConn, sql, _values, (err, rows, meta) => {
          this.#pool.release(baseConn);
          if (_cb) _cb(err, rows, meta);
        });
      })
      .catch((err) => {
        if (_cb) _cb(err);
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
    let _cb = cb,
      _values = values;

    if (typeof values === 'function') {
      _cb = values;
      _values = undefined;
    }

    this.#pool
      .getConnection()
      .then((baseConn) => {
        ConnectionCallback._EXECUTE_CMD(baseConn, sql, _values, (err, rows, meta) => {
          this.#pool.release(baseConn);
          if (_cb) _cb(err, rows, meta);
        });
      })
      .catch((err) => {
        if (_cb) _cb(err);
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
    let _values = values,
      _cb = cb;

    if (typeof values === 'function') {
      _cb = values;
      _values = undefined;
    }

    this.#pool
      .getConnection()
      .then((baseConn) => {
        ConnectionCallback._BATCH_CMD(baseConn, sql, _values, (err, rows, meta) => {
          this.#pool.release(baseConn);
          if (_cb) _cb(err, rows, meta);
        });
      })
      .catch((err) => {
        if (_cb) _cb(err);
      });
  }
}

module.exports = PoolCallback;
