/**
 * Similar to pool cluster with pre-set pattern and selector.
 * Additional method query
 *
 * @param poolCluster    cluster
 * @param patternArg     pre-set pattern
 * @param selectorArg    pre-set selector
 * @constructor
 */
function FilteredPoolCluster(poolCluster, patternArg, selectorArg) {
  const cluster = poolCluster;
  const pattern = patternArg;
  const selector = selectorArg;

  /**
   * Get a connection according to previously indicated pattern and selector.
   *
   * @return {Promise}
   */
  this.getConnection = () => {
    return cluster.getConnection(pattern, selector);
  };

  /**
   * Execute a query on one connection from available pools matching pattern
   * in cluster.
   *
   * @param sql   sql command
   * @param value parameter value of sql command (not mandatory)
   * @return {Promise}
   */
  this.query = function (sql, value) {
    return cluster
      .getConnection(pattern, selector)
      .then((conn) => {
        return conn
          .query(sql, value)
          .then((res) => {
            conn.end();
            return res;
          })
          .catch((err) => {
            conn.end();
            return Promise.reject(err);
          });
      })
      .catch((err) => {
        return Promise.reject(err);
      });
  };

  /**
   * Execute a batch on one connection from available pools matching pattern
   * in cluster.
   *
   * @param sql   sql command
   * @param value parameter value of sql command
   * @return {Promise}
   */
  this.batch = function (sql, value) {
    return cluster
      .getConnection(pattern, selector)
      .then((conn) => {
        return conn
          .batch(sql, value)
          .then((res) => {
            conn.end();
            return res;
          })
          .catch((err) => {
            conn.end();
            return Promise.reject(err);
          });
      })
      .catch((err) => {
        return Promise.reject(err);
      });
  };
}

module.exports = FilteredPoolCluster;
