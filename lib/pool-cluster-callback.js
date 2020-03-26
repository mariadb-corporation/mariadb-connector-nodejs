'use strict';

const PoolCluster = require('./pool-cluster');
const util = require('util');

/**
 * Create a new Cluster.
 * Cluster handle pools with patterns and handle failover / distributed load
 * according to selectors (round robin / random / ordered )
 *
 * @param args      cluster argurments. see pool-cluster-options.
 * @constructor
 */
function PoolClusterCallback(args) {
  PoolCluster.call(this, args);
  this.setCallback();

  const initialGetConnection = this.getConnection.bind(this);
  const initialEnd = this.end.bind(this);

  /**
   * End cluster (and underlying pools).
   *
   * @param callback - not mandatory
   */
  this.end = (callback) => {
    if (callback && typeof callback !== 'function') {
      throw new Error('callback parameter must be a function');
    }
    const endingFct = callback ? callback : () => {};

    initialEnd()
      .then(() => {
        endingFct();
      })
      .catch(endingFct);
  };

  /**
   * Get connection from available pools matching pattern, according to selector
   *
   * @param pattern       pattern filter (not mandatory)
   * @param selector      node selector ('RR','RANDOM' or 'ORDER')
   * @param callback      callback function
   */
  this.getConnection = (pattern, selector, callback) => {
    let pat = pattern,
      sel = selector,
      cal = callback;
    if (typeof pattern === 'function') {
      pat = null;
      sel = null;
      cal = pattern;
    } else if (typeof selector === 'function') {
      sel = null;
      cal = selector;
    }
    const endingFct = cal ? cal : (conn) => {};

    initialGetConnection(pat, sel, endingFct);
  };
}

util.inherits(PoolClusterCallback, PoolCluster);

module.exports = PoolClusterCallback;
