'use strict';
const CommandParameter = require('../../command-parameter');
const Errors = require('../../misc/errors');
const ExecuteStream = require('../execute-stream');

/**
 * Prepare result
 * see https://mariadb.com/kb/en/com_stmt_prepare/#com_stmt_prepare_ok
 */
class PrepareResultPacket {
  #conn;
  constructor(statementId, parameters, columns, database, sql, placeHolderIndex, conn, conOpts) {
    this.id = statementId;
    this.parameters = parameters;
    this.columns = columns;
    this.database = database;
    this.query = sql;
    this.closed = false;
    this._placeHolderIndex = placeHolderIndex;
    this.#conn = conn;
    this.conOpts = conOpts;
  }

  execute(values, opts, cb, stack) {
    let _opts = opts,
      _cb = cb;

    if (typeof _opts === 'function') {
      _cb = _opts;
      _opts = undefined;
    }

    if (this.closed) {
      const error = Errors.createError(
        `Execute fails, prepare command as already been closed`,
        Errors.ER_PREPARE_CLOSED,
        null,
        '22000',
        this.query
      );

      if (!_cb) {
        return Promise.reject(error);
      } else {
        _cb(error);
        return;
      }
    }

    const cmdParam = new CommandParameter(this.query, values, _opts, cb);
    if (stack) cmdParam.stack = stack;
    const conn = this.#conn;
    const promise = new Promise((resolve, reject) => conn.executePromise.call(conn, cmdParam, this, resolve, reject));
    if (!_cb) {
      return promise;
    } else {
      promise
        .then((res) => {
          if (_cb) _cb(null, res, null);
        })
        .catch(_cb || function (err) {});
      return;
    }
  }

  executeStream(values, opts, cb, stack) {
    let _opts = opts,
      _cb = cb;

    if (typeof _opts === 'function') {
      _cb = _opts;
      _opts = undefined;
    }

    if (this.closed) {
      const error = Errors.createError(
        `Execute fails, prepare command as already been closed`,
        Errors.ER_PREPARE_CLOSED,
        null,
        '22000',
        this.query
      );

      if (!_cb) {
        throw error;
      } else {
        _cb(error);
        return;
      }
    }

    const cmdParam = new CommandParameter(this.query, values, _opts, cb);
    if (stack) cmdParam.stack = stack;

    const cmd = new ExecuteStream(cmdParam, this.#conn.opts, this, this.#conn.socket);
    if (this.#conn.opts.logger.error) cmd.on('error', this.#conn.opts.logger.error);
    this.#conn.addCommand(cmd);
    return cmd.inStream;
  }

  close() {
    if (!this.closed) {
      this.closed = true;
      this.#conn.emit('close_prepare', this);
    }
  }
}

module.exports = PrepareResultPacket;
