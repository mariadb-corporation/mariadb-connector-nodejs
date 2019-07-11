'use strict';

const Connection = require('./connection');
const PoolBase = require('./pool-base');
const util = require('util');

function PoolPromise(options) {
  const processTaskPromise = function(conn, sql, values, isBatch) {
    if (sql) {
      const fct = isBatch ? conn.batch : conn.query;
      return fct(sql, values)
        .then(res => {
          conn.releaseWithoutError();
          return Promise.resolve(res);
        })
        .catch(err => {
          conn.releaseWithoutError();
          return Promise.reject(err);
        });
    }
    return Promise.resolve(conn);
  };

  /**
   * Add connection to pool.
   */
  const createConnectionPoolPromise = function(pool) {
    const conn = new Connection(options.connOptions);
    return conn
      .connect()
      .then(() => {
        if (pool.closed) {
          conn
            .end()
            .then(() => {})
            .catch(() => {});
          return Promise.reject(
            Errors.createError(
              'Cannot create new connection to pool, pool closed',
              true,
              null,
              '08S01',
              Errors.ER_ADD_CONNECTION_CLOSED_POOL,
              null
            )
          );
        }

        conn.releaseWithoutError = () => {
          conn.release().catch(() => {});
        };

        conn.forceEnd = conn.end;

        conn.release = () => {
          if (pool.closed) {
            pool._discardConnection(conn);
            return Promise.resolve();
          }
          if (options.noControlAfterUse) {
            pool._releaseConnection(conn);
            return Promise.resolve();
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

          return revertFunction()
            .then(() => {
              pool._releaseConnection(conn);
              return Promise.resolve();
            })
            .catch(err => {
              //uncertain connection state.
              // discard it
              pool._discardConnection(conn);
              return Promise.resolve();
            });
        };
        conn.end = conn.release;
        return Promise.resolve(conn);
      })
      .catch(err => {
        return Promise.reject(err);
      });
  };

  PoolBase.call(this, options, processTaskPromise, createConnectionPoolPromise, conn =>
    conn.ping()
  );
}

util.inherits(PoolPromise, PoolBase);

module.exports = PoolPromise;
