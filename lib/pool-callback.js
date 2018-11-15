"use strict";

const Pool = require("./pool");
const util = require("util");

function PoolCallback(options) {
  Pool.call(this, options, true);

  const getConnectionPromise = this.getConnection.bind(this);
  const endPromise = this.end.bind(this);
  const queryPromise = this.query.bind(this);
  const batchPromise = this.batch.bind(this);
  const emptyError = err => {};

  //*****************************************************************
  // internal equivalent with callback of promised functions
  //*****************************************************************

  const _getConnectionCallback = callback => {
    getConnectionPromise()
      .then(conn => {
        if (callback) callback(null, conn);
      })
      .catch(callback || emptyError);
  };

  const _endCallback = callback => {
    endPromise()
      .then(() => {
        if (callback) callback(null);
      })
      .catch(callback || emptyError);
  };

  /**
   * Execute query using text protocol with callback emit columns/data/end/error
   * events to permit streaming big result-set
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  object / array of placeholder values (not mandatory)
   * @param cb      callback
   * @returns {Query} query
   */
  const _queryCallback = function(sql, values, cb) {
    let _values, _cb;

    if (typeof values === "function") {
      _cb = values;
    } else if (values !== undefined) {
      _values = values;
      _cb = cb;
    }

    queryPromise(sql, _values)
      .then(rows => {
        if (_cb) _cb(null, rows, rows.meta);
      })
      .catch(_cb || emptyError);
  };

  const _batchCallback = function(sql, values, cb) {
    let _values, _cb;

    if (typeof values === "function") {
      _cb = values;
    } else if (values !== undefined) {
      _values = values;
      _cb = cb;
    }

    batchPromise(sql, _values)
      .then(rows => {
        if (_cb) _cb(null, rows, rows.meta);
      })
      .catch(_cb || emptyError);
  };

  //*****************************************************************
  // replacing public promise function with callback equivalent
  //*****************************************************************

  this.end = _endCallback;
  this.query = _queryCallback;
  this.batch = _batchCallback;
  this.getConnection = _getConnectionCallback;
}

util.inherits(PoolCallback, Pool);

module.exports = PoolCallback;
