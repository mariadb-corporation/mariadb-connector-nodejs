'use strict';

const Errors = require('./misc/errors');
const { Status } = require('./const/connection_status');
const Query = require('./cmd/query');
const CommandParameter = require('./command-parameter');

class ConnectionCallback {
  #conn;

  constructor(conn) {
    this.#conn = conn;
    this.on = this.#conn.on.bind(this.#conn);
    this.once = this.#conn.once.bind(this.#conn);
  }

  get threadId() {
    return this.#conn.info ? this.#conn.info.threadId : null;
  }

  get info() {
    return this.#conn.info;
  }

  #noop = () => {};

  release = (cb) => {
    this.#conn.release(() => {
      if (cb) cb();
    });
  };

  /**
   * Permit to change user during connection.
   * All user variables will be reset, Prepare commands will be released.
   * !!! mysql has a bug when CONNECT_ATTRS capability is set, that is default !!!!
   *
   * @param options   connection options
   * @param callback  callback function
   */
  changeUser(options, callback) {
    let _options, _cb;
    if (typeof options === 'function') {
      _cb = options;
      _options = undefined;
    } else {
      _options = options;
      _cb = callback;
    }
    const cmdParam = new CommandParameter(null, null, _options, _cb);
    if (this.#conn.opts.trace) Error.captureStackTrace(cmdParam);

    new Promise(this.#conn.changeUser.bind(this.#conn, cmdParam))
      .then(() => {
        if (cmdParam.callback) cmdParam.callback(null, null, null);
      })
      .catch(cmdParam.callback || this.#noop);
  }

  /**
   * Start transaction
   *
   * @param callback  callback function
   */
  beginTransaction(callback) {
    this.query(new CommandParameter('START TRANSACTION'), null, callback);
  }

  /**
   * Commit a transaction.
   *
   * @param callback  callback function
   */
  commit(callback) {
    this.#conn.changeTransaction(
      new CommandParameter('COMMIT'),
      () => {
        if (callback) callback(null, null, null);
      },
      callback || this.#noop
    );
  }

  /**
   * Roll back a transaction.
   *
   * @param callback  callback function
   */
  rollback(callback) {
    this.#conn.changeTransaction(
      new CommandParameter('ROLLBACK'),
      () => {
        if (callback) callback(null, null, null);
      },
      callback || this.#noop
    );
  }

  /**
   * Execute query using text protocol with callback emit columns/data/end/error
   * events to permit streaming big result-set
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  object / array of placeholder values (not mandatory)
   * @param cb      callback
   * @param callback  callback function
   */
  query(sql, values, callback) {
    const cmdParam = ConnectionCallback._PARAM(this.#conn.opts, sql, values, callback);
    return ConnectionCallback._QUERY_CMD(this.#conn, cmdParam);
  }

  static _QUERY_CMD(conn, cmdParam) {
    let cmd;
    if (cmdParam.callback) {
      cmdParam.opts = cmdParam.opts ? Object.assign(cmdParam.opts, { metaAsArray: true }) : { metaAsArray: true };
      cmd = new Query(
        ([rows, meta]) => {
          cmdParam.callback(null, rows, meta);
        },
        cmdParam.callback,
        conn.opts,
        cmdParam
      );
    } else {
      cmd = new Query(
        () => {},
        () => {},
        conn.opts,
        cmdParam
      );
    }

    cmd.handleNewRows = (row) => {
      cmd._rows[cmd._responseIndex].push(row);
      cmd.emit('data', row);
    };

    conn.addCommand(cmd);
    return cmd;
  }

  execute(sql, values, callback) {
    const cmdParam = ConnectionCallback._PARAM(this.#conn.opts, sql, values, callback);
    return ConnectionCallback._EXECUTE_CMD(this.#conn, cmdParam);
  }

  static _PARAM(options, sql, values, callback) {
    let _cmdOpt,
      _sql,
      _values = values,
      _cb = callback;
    if (typeof values === 'function') {
      _cb = values;
      _values = undefined;
    }
    if (typeof sql === 'object') {
      _cmdOpt = sql;
      _sql = _cmdOpt.sql;
      if (_cmdOpt.values) _values = _cmdOpt.values;
    } else {
      _sql = sql;
    }
    const cmdParam = new CommandParameter(_sql, _values, _cmdOpt, _cb);
    if (options.trace) Error.captureStackTrace(cmdParam);
    return cmdParam;
  }

  static _EXECUTE_CMD(conn, cmdParam) {
    new Promise(conn.prepare.bind(conn, cmdParam))
      .then((prepare) => {
        const opts = cmdParam.opts ? Object.assign(cmdParam.opts, { metaAsArray: true }) : { metaAsArray: true };
        return prepare.execute(cmdParam.values, opts, null, cmdParam.stack).then(([rows, meta]) => {
          prepare.close();
          if (cmdParam.callback) {
            cmdParam.callback(null, rows, meta);
          }
        });
      })
      .catch((err) => {
        if (conn.opts.logger.error) conn.opts.logger.error(err);
        if (cmdParam.callback) cmdParam.callback(err);
      });
  }

  prepare(sql, callback) {
    let _cmdOpt, _sql;
    if (typeof sql === 'object') {
      _cmdOpt = sql;
      _sql = _cmdOpt.sql;
    } else {
      _sql = sql;
    }
    const cmdParam = new CommandParameter(_sql, null, _cmdOpt, callback);
    if (this.#conn.opts.trace) Error.captureStackTrace(cmdParam);
    return new Promise(this.#conn.prepare.bind(this.#conn, cmdParam))
      .then((prepare) => {
        if (callback) callback(null, prepare, null);
      })
      .catch(callback || this.#noop);
  }

  /**
   * Execute a batch
   * events to permit streaming big result-set
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  object / array of placeholder values (not mandatory)
   * @param callback callback
   */
  batch(sql, values, callback) {
    const cmdParam = ConnectionCallback._PARAM(this.#conn.opts, sql, values, callback);
    return ConnectionCallback._BATCH_CMD(this.#conn, cmdParam);
  }

  static _BATCH_CMD(conn, cmdParam) {
    conn
      .batch(cmdParam)
      .then((res) => {
        if (cmdParam.callback) cmdParam.callback(null, res);
      })
      .catch((err) => {
        if (conn.opts.logger.error) conn.opts.logger.error(err);
        if (cmdParam.callback) cmdParam.callback(err);
      });
  }

  /**
   * Send an empty MySQL packet to ensure connection is active, and reset @@wait_timeout
   * @param timeout (optional) timeout value in ms. If reached, throw error and close connection
   * @param callback callback
   */
  ping(timeout, callback) {
    let _cmdOpt = {},
      _cb;
    if (typeof timeout === 'function') {
      _cb = timeout;
    } else {
      _cmdOpt.timeout = timeout;
      _cb = callback;
    }
    const cmdParam = new CommandParameter(null, null, _cmdOpt, _cb);
    if (this.#conn.opts.trace) Error.captureStackTrace(cmdParam);
    new Promise(this.#conn.ping.bind(this.#conn, cmdParam)).then(_cb || this.#noop).catch(_cb || this.#noop);
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
   * @param callback callback
   */
  reset(callback) {
    const cmdParam = new CommandParameter();
    if (this.#conn.opts.trace) Error.captureStackTrace(cmdParam);
    return new Promise(this.#conn.reset.bind(this.#conn, cmdParam))
      .then(callback || this.#noop)
      .catch(callback || this.#noop);
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
   * @param callback callback
   */
  end(callback) {
    const cmdParam = new CommandParameter();
    if (this.#conn.opts.trace) Error.captureStackTrace(cmdParam);
    new Promise(this.#conn.end.bind(this.#conn, cmdParam))
      .then(() => {
        if (callback) callback();
      })
      .catch(callback || this.#noop);
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

  connect(callback) {
    if (!callback) {
      throw new Errors.createError(
        'missing mandatory callback parameter',
        Errors.ER_MISSING_PARAMETER,
        this.#conn.info
      );
    }
    switch (this.#conn.status) {
      case Status.NOT_CONNECTED:
      case Status.CONNECTING:
      case Status.AUTHENTICATING:
      case Status.INIT_CMD:
        this.once('connect', callback);
        break;
      case Status.CONNECTED:
        callback.call(this);
        break;
      case Status.CLOSING:
      case Status.CLOSED:
        callback.call(
          this,
          Errors.createError(
            'Connection closed',
            Errors.ER_CONNECTION_ALREADY_CLOSED,
            this.#conn.info,
            '08S01',
            null,
            true
          )
        );
        break;
    }
  }
}

module.exports = ConnectionCallback;
