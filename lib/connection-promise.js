'use strict';

const Stream = require('./cmd/stream');
const CommandParameter = require('./command-parameter');

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
class ConnectionPromise {
  #conn;

  constructor(conn) {
    this.#conn = conn;
    this.on = this.#conn.on.bind(this.#conn);
    this.once = this.#conn.once.bind(this.#conn);
  }

  get threadId() {
    return this.#conn.threadId;
  }

  get info() {
    return this.#conn.info;
  }

  /**
   * Permit to change user during connection.
   * All user variables will be reset, Prepare commands will be released.
   * !!! mysql has a bug when CONNECT_ATTRS capability is set, that is default !!!!
   *
   * @param options   connection options
   * @returns {Promise} promise
   */
  changeUser(options) {
    const cmdParam = new CommandParameter(null, null, options);
    if (this.#conn.opts.trace) Error.captureStackTrace(cmdParam);
    return new Promise(this.#conn.changeUser.bind(this.#conn, cmdParam));
  }

  /**
   * Start transaction
   *
   * @returns {Promise} promise
   */
  beginTransaction() {
    return this.query('START TRANSACTION');
  }

  /**
   * Commit a transaction.
   *
   * @returns {Promise} command if commit was needed only
   */
  commit() {
    const cmdParam = ConnectionPromise._PARAM(this.#conn.opts, 'COMMIT');
    return new Promise(this.#conn.changeTransaction.bind(this.#conn, cmdParam));
  }

  /**
   * Roll back a transaction.
   *
   * @returns {Promise} promise
   */
  rollback() {
    const cmdParam = ConnectionPromise._PARAM(this.#conn.opts, 'ROLLBACK');
    return new Promise(this.#conn.changeTransaction.bind(this.#conn, cmdParam));
  }

  /**
   * Execute query using text protocol.
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  object / array of placeholder values (not mandatory)
   * @returns {Promise} promise
   */
  query(sql, values) {
    const cmdParam = ConnectionPromise._PARAM(this.#conn.opts, sql, values);
    return new Promise(this.#conn.query.bind(this.#conn, cmdParam));
  }

  static _PARAM(options, sql, values) {
    let _cmdOpt,
      _sql = sql,
      _values = values;
    if (typeof sql === 'object') {
      _cmdOpt = sql;
      _sql = _cmdOpt.sql;
      if (_cmdOpt.values) _values = _cmdOpt.values;
    }
    const cmdParam = new CommandParameter(_sql, _values, _cmdOpt);
    if (options.trace) Error.captureStackTrace(cmdParam);
    return cmdParam;
  }

  execute(sql, values) {
    const cmdParam = ConnectionPromise._PARAM(this.#conn.opts, sql, values);
    return ConnectionPromise._EXECUTE_CMD(this.#conn, cmdParam);
  }

  static _EXECUTE_CMD(conn, cmdParam) {
    return new Promise(conn.prepare.bind(conn, cmdParam))
      .then((prepare) => {
        return prepare.execute(cmdParam.values, cmdParam.opts, null, cmdParam.stack).then((res) => {
          prepare.close();
          return Promise.resolve(res);
        });
      })
      .catch((err) => {
        if (conn.opts.logger.error) conn.opts.logger.error(err);
        return Promise.reject(err);
      });
  }

  prepare(sql) {
    let _cmdOpt, _sql;
    if (typeof sql === 'object') {
      _cmdOpt = sql;
      _sql = _cmdOpt.sql;
    } else {
      _sql = sql;
    }
    const cmdParam = new CommandParameter(_sql, null, _cmdOpt);
    if (this.#conn.opts.trace) Error.captureStackTrace(cmdParam);
    return new Promise(this.#conn.prepare.bind(this.#conn, cmdParam));
  }

  /**
   * Execute batch using text protocol.
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  object / array of placeholder values
   * @returns {Promise} promise
   */
  batch(sql, values) {
    const cmdParam = ConnectionPromise._PARAM(this.#conn.opts, sql, values);
    return this.#conn.batch(cmdParam);
  }

  static _BATCH_CMD(conn, cmdParam) {
    return conn.batch(cmdParam);
  }

  /**
   * Execute query returning a Readable Object that will emit columns/data/end/error events
   * to permit streaming big result-set
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  object / array of placeholder values (not mandatory)
   * @returns {Readable}
   */
  queryStream(sql, values) {
    const cmdParam = ConnectionPromise._PARAM(this.#conn.opts, sql, values);
    const cmd = new Stream(cmdParam, this.#conn.opts, this.#conn.socket);
    if (this.#conn.opts.logger.error) cmd.on('error', this.#conn.opts.logger.error);
    this.#conn.addCommand(cmd);
    return cmd.inStream;
  }

  /**
   * Send an empty MySQL packet to ensure connection is active, and reset @@wait_timeout
   * @param timeout (optional) timeout value in ms. If reached, throw error and close connection
   * @returns {Promise} promise
   */
  ping(timeout) {
    const cmdParam = new CommandParameter(null, null, { timeout: timeout });
    if (this.#conn.opts.trace) Error.captureStackTrace(cmdParam);
    return new Promise(this.#conn.ping.bind(this.#conn, cmdParam));
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
  reset() {
    const cmdParam = new CommandParameter();
    if (this.#conn.opts.trace) Error.captureStackTrace(cmdParam);
    return new Promise(this.#conn.reset.bind(this.#conn, cmdParam));
  }

  /**
   * Indicates the state of the connection as the driver knows it
   * @returns {boolean}
   */
  isValid() {
    return this.#conn.isValid();
  }

  /**
   * Terminate connection gracefully.
   *
   * @returns {Promise} promise
   */
  end() {
    const cmdParam = new CommandParameter();
    if (this.#conn.opts.trace) Error.captureStackTrace(cmdParam);
    return new Promise(this.#conn.end.bind(this.#conn, cmdParam));
  }

  /**
   * Alias for destroy.
   */
  close() {
    this.destroy();
  }

  /**
   * Force connection termination by closing the underlying socket and killing server process if any.
   */
  destroy() {
    this.#conn.destroy();
  }

  pause() {
    this.#conn.pause();
  }

  resume() {
    this.#conn.resume();
  }

  format(sql, values) {
    this.#conn.format(sql, values);
  }

  /**
   * return current connected server version information.
   *
   * @returns {*}
   */
  serverVersion() {
    return this.#conn.serverVersion();
  }

  /**
   * Change option "debug" during connection.
   * @param val   debug value
   */
  debug(val) {
    return this.#conn.debug(val);
  }

  debugCompress(val) {
    return this.#conn.debugCompress(val);
  }

  escape(val) {
    return this.#conn.escape(val);
  }

  escapeId(val) {
    return this.#conn.escapeId(val);
  }

  //*****************************************************************
  // internal public testing methods
  //*****************************************************************

  get __tests() {
    return this.#conn.__tests;
  }
}

module.exports = ConnectionPromise;
