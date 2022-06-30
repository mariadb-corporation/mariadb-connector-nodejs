'use strict';
const CommandParameter = require('../../command-parameter');

/**
 * Prepare result
 * see https://mariadb.com/kb/en/com_stmt_prepare/#com_stmt_prepare_ok
 */
class PrepareResultPacket {
  #connExecutePromise;
  constructor(statementId, parameters, columns, database, sql, placeHolderIndex, executePromise, emitter, conOpts) {
    this.id = statementId;
    this.parameters = parameters;
    this.columns = columns;
    this.database = database;
    this.query = sql;
    this.closed = false;
    this._placeHolderIndex = placeHolderIndex;
    this.#connExecutePromise = executePromise;
    this.emitter = emitter;
    this.conOpts = conOpts;
  }

  execute(values, opts, cb, stack) {
    let _opts = opts,
      _cb = cb;

    if (typeof _opts === 'function') {
      _cb = _opts;
      _opts = undefined;
    }
    const cmdParam = new CommandParameter(this.query, values, _opts, cb);
    if (stack) cmdParam.stack = stack;
    const promise = new Promise((resolve, reject) => this.#connExecutePromise(cmdParam, this, resolve, reject));
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

  close() {
    if (!this.closed) {
      this.closed = true;
      this.emitter.emit('close_prepare', this);
    }
  }
}

module.exports = PrepareResultPacket;
