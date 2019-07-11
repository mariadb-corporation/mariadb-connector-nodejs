'use strict';

const PoolBase = require('./pool-base');
const ConnectionCallback = require('./connection-callback');
const util = require('util');

function PoolCallback(options) {
  const processTaskCallback = function(conn, sql, values, isBatch) {
    if (sql) {
      return new Promise((resolve, reject) => {
        const fct = isBatch ? conn.batch : conn.query;
        fct(sql, values, (err, rows, fields) => {
          conn.releaseWithoutError();
          if (err) {
            reject(err);
            return;
          }
          return resolve(rows);
        });
      });
    } else {
      return Promise.resolve(conn);
    }
  };

  const pingPromise = function(conn) {
    return new Promise((resolve, reject) => {
      conn.ping(err => {
        if (err) {
          reject(err);
        } else resolve();
      });
    });
  };

  const createConnectionPoolCallback = function(pool) {
    const conn = new ConnectionCallback(options.connOptions);
    return new Promise(function(resolve, reject) {
      conn.connect(err => {
        if (err) {
          reject(err);
        } else {
          if (pool.closed) {
            //discard connection
            conn.end(err => {});
            reject(
              Errors.createError(
                'Cannot create new connection to pool, pool closed',
                true,
                null,
                '08S01',
                Errors.ER_ADD_CONNECTION_CLOSED_POOL,
                null
              )
            );
          } else {
            const initialEnd = conn.end;
            conn.forceEnd = () => {
              return new Promise(function(res, rej) {
                initialEnd(err => {
                  if (err) {
                    rej(err);
                  } else {
                    res();
                  }
                });
              });
            };

            conn.release = function(cb) {
              if (pool.closed) {
                pool._discardConnection(conn);
                if (cb) cb();
                return;
              }
              if (options.noControlAfterUse) {
                pool._releaseConnection(conn);
                if (cb) cb();
                return;
              }

              //if server permit it, reset the connection, or rollback only if not
              let revertFunction = conn.rollback;
              if (
                options.resetAfterUse &&
                ((conn.info.isMariaDB() && conn.info.hasMinVersion(10, 2, 4)) ||
                  (!conn.info.isMariaDB() && conn.info.hasMinVersion(5, 7, 3)))
              ) {
                revertFunction = conn.reset;
              }
              revertFunction(errCall => {
                if (errCall) {
                  //uncertain connection state.
                  pool._discardConnection(conn);
                  if (cb) cb();
                  return;
                } else {
                  pool._releaseConnection(conn);
                }
                if (cb) cb();
              });
            };
            conn.end = conn.release;
            conn.releaseWithoutError = () => {
              conn.end(err => {});
            };
            resolve(conn);
          }
        }
      });
    });
  };

  PoolBase.call(this, options, processTaskCallback, createConnectionPoolCallback, pingPromise);

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

    if (typeof values === 'function') {
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

    if (typeof values === 'function') {
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

util.inherits(PoolCallback, PoolBase);

module.exports = PoolCallback;
