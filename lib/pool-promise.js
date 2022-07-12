'use strict';

const { EventEmitter } = require('events');

const Pool = require('./pool');
const ConnectionPromise = require('./connection-promise');
const CommandParameter = require('./command-parameter');

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
  getConnection() {
    const cmdParam = new CommandParameter();
    if (this.#pool.opts.connOptions.trace) Error.captureStackTrace(cmdParam);
    return this.#pool.getConnection(cmdParam).then((baseConn) => {
      const conn = new ConnectionPromise(baseConn);
      conn.release = function () {
        return new Promise(baseConn.release);
      };
      conn.end = conn.release;
      conn.close = conn.release;
      return conn;
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
    const cmdParam = ConnectionPromise._PARAM(this.#pool.opts.connOptions, sql, values);
    return this.#pool.getConnection(cmdParam).then((baseConn) => {
      return new Promise(baseConn.query.bind(baseConn, cmdParam)).finally(() => {
        this.#pool.release(baseConn);
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
    const cmdParam = ConnectionPromise._PARAM(this.#pool.opts.connOptions, sql, values);
    return this.#pool.getConnection(cmdParam).then((baseConn) => {
      return ConnectionPromise._EXECUTE_CMD(baseConn, cmdParam).finally(() => {
        this.#pool.release(baseConn);
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
    const cmdParam = ConnectionPromise._PARAM(this.#pool.opts.connOptions, sql, values);
    return this.#pool.getConnection(cmdParam).then((baseConn) => {
      return ConnectionPromise._BATCH_CMD(baseConn, cmdParam).finally(() => {
        this.#pool.release(baseConn);
      });
    });
  }
}

module.exports = PoolPromise;
