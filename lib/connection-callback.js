'use strict';

const Connection = require('./connection');
const util = require('util');
const Errors = require('./misc/errors');
const { Status } = require('./const/connection_status');

function ConnectionCallback(options) {
  Connection.call(this, options);

  let connecting = 1;
  const connectPromise = this.connect.bind(this);
  const changeUserPromise = this.changeUser.bind(this);
  const queryPromise = this.query.bind(this);
  const endPromise = this.end.bind(this);
  const pingPromise = this.ping.bind(this);
  const resetPromise = this.reset.bind(this);
  const commitPromise = this.commit.bind(this);
  const rollbackPromise = this.rollback.bind(this);

  const emptySuccess = (rows) => {};
  const emptyError = (err) => {};

  //*****************************************************************
  // internal equivalent with callback of promised functions
  //*****************************************************************

  const _commitCallback = (callback) => {
    commitPromise()
      .then(() => {
        if (callback) callback(null, null, null);
      })
      .catch(callback || emptyError);
  };

  const _rollbackCallback = (callback) => {
    rollbackPromise()
      .then(() => {
        if (callback) callback(null, null, null);
      })
      .catch(callback || emptyError);
  };

  const _pingCallback = (timeout, callback) => {
    let _timeout, _cb;
    if (typeof timeout === 'function') {
      _cb = timeout;
      _timeout = undefined;
    } else {
      _timeout = timeout;
      _cb = callback;
    }
    pingPromise(_timeout)
      .then(_cb || emptySuccess)
      .catch(_cb || emptyError);
  };

  const _resetCallback = (callback) => {
    resetPromise()
      .then(callback || emptySuccess)
      .catch(callback || emptyError);
  };

  const _beginTransactionCallback = (callback) => {
    queryPromise('START TRANSACTION')
      .then(() => {
        if (callback) callback(null, null, null);
      })
      .catch(callback || emptyError);
  };

  const _endCallback = (callback) => {
    endPromise()
      .then(callback || emptySuccess)
      .catch(callback || emptyError);
  };

  const _connectCallback = function (callback) {
    if (!callback) {
      throw new Errors.createError(
        'missing callback parameter',
        null,
        false,
        this.info,
        'HY000',
        Errors.ER_MISSING_PARAMETER
      );
    }

    if (connecting === 1) {
      this.on('connect', callback);
    } else {
      switch (this._status()) {
        case Status.CLOSING:
        case Status.CLOSED:
          callback(
            Errors.createError(
              'Connection closed',
              null,
              true,
              this.info,
              '08S01',
              Errors.ER_CONNECTION_ALREADY_CLOSED
            )
          );
          break;

        default:
          callback();
      }
    }
  };

  const _changeUserCallback = (options, callback) => {
    let _options, _cb;
    if (typeof options === 'function') {
      _cb = options;
      _options = undefined;
    } else {
      _options = options;
      _cb = callback;
    }

    changeUserPromise(_options)
      .then(() => {
        if (_cb) _cb(null, null, null);
      })
      .catch(_cb || emptyError);
  };

  //*****************************************************************
  // replacing public promise function with callback equivalent
  //*****************************************************************

  this.commit = _commitCallback;
  this.rollback = _rollbackCallback;
  this.ping = _pingCallback;
  this.reset = _resetCallback;
  this.end = _endCallback;
  this.connect = _connectCallback;
  this.changeUser = _changeUserCallback;
  this.query = this._queryCallback;
  this.batch = this._batchCallback;
  this.beginTransaction = _beginTransactionCallback;

  const self = this;
  connectPromise()
    .then(() => {
      connecting = 0;
      self.emit('connect');
    })
    .catch((err) => {
      connecting = 0;
      self.emit('connect', err);
    });
}

util.inherits(ConnectionCallback, Connection);

module.exports = ConnectionCallback;
