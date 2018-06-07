"use strict";

const Connection = require("./connection");
const util = require("util");

function ConnectionCallback(options) {
  Connection.call(this, options);

  const connectPromise = this.connect;
  const changeUserPromise = this.changeUser;
  const queryPromise = this.query;
  const endPromise = this.end;
  const pingPromise = this.ping;
  const commitPromise = this.commit;
  const rollbackPromise = this.rollback;

  const emptySuccess = rows => {};
  const emptyError = err => {};

  //*****************************************************************
  // internal equivalent with callback of promised functions
  //*****************************************************************

  const _commitCallback = callback => {
    commitPromise()
      .then(callback || emptySuccess)
      .catch(callback || emptyError);
  };

  const _rollbackCallback = callback => {
    rollbackPromise()
      .then(callback || emptySuccess)
      .catch(callback || emptyError);
  };

  const _pingCallback = callback => {
    pingPromise()
      .then(callback || emptySuccess)
      .catch(callback || emptyError);
  };

  const _endCallback = callback => {
    endPromise()
      .then(callback || emptySuccess)
      .catch(callback || emptyError);
  };
  const _connectCallback = callback => {
    connectPromise()
      .then(() => {
        if (callback) callback(null, null, null);
      })
      .catch(callback || emptyError);
  };

  const _changeUserCallback = (options, callback) => {
    let _options, _cb;
    if (typeof options === "function") {
      _cb = options;
      _options = undefined;
    } else {
      _options = options;
      _cb = callback;
    }

    changeUserPromise(_options)
      .then(_cb || emptySuccess)
      .catch(_cb || emptyError);
  };

  const queryCallback = (sql, values, cb) => {
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

  //*****************************************************************
  // replacing public promise function with callback equivalent
  //*****************************************************************

  this.commit = _commitCallback;
  this.rollback = _rollbackCallback;
  this.ping = _pingCallback;
  this.end = _endCallback;
  this.connect = _connectCallback;
  this.changeUser = _changeUserCallback;
  this.query = queryCallback;
}

util.inherits(ConnectionCallback, Connection);

module.exports = ConnectionCallback;
