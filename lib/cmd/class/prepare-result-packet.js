'use strict';

/**
 * Prepare result
 * see https://mariadb.com/kb/en/com_stmt_prepare/#com_stmt_prepare_ok
 */
class PrepareResultPacket {
  #connExecutePromise;
  constructor(statementId, parameters, columns, database, sql, placeHolderIndex, executePromise, emitter) {
    this.id = statementId;
    this.parameters = parameters;
    this.columns = columns;
    this.database = database;
    this.query = sql;
    this.closed = false;
    this._placeHolderIndex = placeHolderIndex;
    this.#connExecutePromise = executePromise;
    this.emitter = emitter;
  }

  execute(values, opts, cb) {
    let _opts = opts,
      _cb = cb;

    if (typeof _opts === 'function') {
      _cb = _opts;
      _opts = undefined;
    }

    const promise = new Promise((resolve, reject) => this.#connExecutePromise(values, opts, this, resolve, reject));
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
