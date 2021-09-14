'use strict';

/**
 * Prepare result
 * see https://mariadb.com/kb/en/com_stmt_prepare/#com_stmt_prepare_ok
 */
class PrepareResultPacket {
  constructor(statementId, parameters, columns, database, sql, placeHolderIndex, emitter) {
    this.id = statementId;
    this.parameters = parameters;
    this.columns = columns;
    this.database = database;
    this.query = sql;
    this.closed = false;
    this._emitter = emitter;
    this._placeHolderIndex = placeHolderIndex;
  }

  execute(values, _opts) {
    return this._emitter._executePromise(this, values, _opts);
  }

  _executeCallback(values, cb) {
    let _cb;
    if (typeof cb === 'function') {
      _cb = cb;
    }
    this._emitter
      ._executePromise(this, values)
      .then((res) => {
        if (_cb) _cb(null, res, null);
      })
      .catch(_cb || function (err) {});
  }

  close() {
    if (!this.closed) {
      this.closed = true;
      this._emitter.emit('close_prepare', this);
    }
  }
}

module.exports = PrepareResultPacket;
