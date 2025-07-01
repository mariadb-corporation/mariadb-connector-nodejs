//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

/**
 * Similar to pool cluster with a pre-set pattern and selector.
 * Additional method query
 *
 * @param poolCluster    cluster
 * @param patternArg     pre-set pattern
 * @param selectorArg    pre-set selector
 * @constructor
 */
class FilteredClusterCallback {
  #cluster;
  #pattern;
  #selector;

  constructor(poolCluster, patternArg, selectorArg) {
    this.#cluster = poolCluster;
    this.#pattern = patternArg;
    this.#selector = selectorArg;
  }

  /**
   * Get a connection according to a previously indicated pattern and selector.
   */
  getConnection(callback) {
    const cal = callback ? callback : (err, conn) => {};
    return this.#cluster.getConnection(this.#pattern, this.#selector, cal);
  }

  /**
   * Execute a text query on one connection from an available pools matching pattern
   * in cluster.
   *
   * @param sql   sql command
   * @param value parameter value of SQL command (not mandatory)
   * @param callback callback parameters
   * @return {Promise}
   */
  query(sql, value, callback) {
    let sq = sql,
      val = value,
      cal = callback;
    if (typeof value === 'function') {
      val = null;
      cal = value;
    }
    const endingFct = cal ? cal : () => {};

    this.getConnection((err, conn) => {
      if (err) {
        endingFct(err);
      } else {
        conn.query(sq, val, (err, res, meta) => {
          conn.release(() => {});
          if (err) {
            endingFct(err);
          } else {
            endingFct(null, res, meta);
          }
        });
      }
    });
  }

  /**
   * Execute a binary query on one connection from an available pools matching pattern
   * in cluster.
   *
   * @param sql   sql command
   * @param value parameter value of SQL command (not mandatory)
   * @param callback callback function
   */
  execute(sql, value, callback) {
    let sq = sql,
      val = value,
      cal = callback;
    if (typeof value === 'function') {
      val = null;
      cal = value;
    }
    const endingFct = cal ? cal : () => {};

    this.getConnection((err, conn) => {
      if (err) {
        endingFct(err);
      } else {
        conn.execute(sq, val, (err, res, meta) => {
          conn.release(() => {});
          if (err) {
            endingFct(err);
          } else {
            endingFct(null, res, meta);
          }
        });
      }
    });
  }

  /**
   * Execute a batch on one connection from an available pools matching pattern
   * in cluster.
   *
   * @param sql   sql command
   * @param value parameter value of SQL command
   * @param callback callback function
   */
  batch(sql, value, callback) {
    let sq = sql,
      val = value,
      cal = callback;
    if (typeof value === 'function') {
      val = null;
      cal = value;
    }
    const endingFct = cal ? cal : () => {};

    this.getConnection((err, conn) => {
      if (err) {
        endingFct(err);
      } else {
        conn.batch(sq, val, (err, res, meta) => {
          conn.release(() => {});
          if (err) {
            endingFct(err);
          } else {
            endingFct(null, res, meta);
          }
        });
      }
    });
  }
}

module.exports = FilteredClusterCallback;
