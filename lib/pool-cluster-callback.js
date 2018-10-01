"use strict";

const PoolCluster = require("./pool-cluster");

/**
 * Create a new Cluster.
 * Cluster handle pools with patterns and handle failover / distributed load
 * according to selectors (round robin / random / ordered )
 *
 * @param args      cluster argurments. see pool-cluster-options.
 * @constructor
 */
function PoolClusterCallback(args) {
  const cluster = new PoolCluster(args);
  cluster.setCallback();

  /**
   * Add a new pool node to cluster.
   *
   * @param id      identifier
   * @param config  pool configuration
   */
  this.add = (id, config) => {
    cluster.add(id, config);
  };

  /**
   * End cluster (and underlying pools).
   *
   * @param callback - not mandatory
   */
  this.end = callback => {
    if (callback && typeof callback !== "function") {
      throw new Error("callback parameter must be a function");
    }
    const endingFct = callback ? callback : () => {};

    cluster
      .end()
      .then(() => {
        endingFct();
      })
      .catch(endingFct);
  };

  this.of = (pattern, selector) => {
    return cluster.of(pattern, selector);
  };

  /**
   * Remove nodes according to pattern.
   *
   * @param pattern  pattern
   */
  this.remove = pattern => {
    cluster.remove(pattern);
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
    if (typeof pattern === "function") {
      pat = null;
      sel = null;
      cal = pattern;
    } else if (typeof selector === "function") {
      sel = null;
      cal = selector;
    }
    const endingFct = cal ? cal : conn => {};

    cluster.getConnection(pat, sel, endingFct);
  };

  //*****************************************************************
  // internal public testing methods
  //*****************************************************************

  this.__tests = cluster.__tests;
}

module.exports = PoolClusterCallback;
