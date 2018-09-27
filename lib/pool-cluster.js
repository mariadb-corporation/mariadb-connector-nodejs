"use strict";

const PoolClusterOptions = require("./config/pool-cluster-options");
const PoolOptions = require("./config/pool-options");
const Pool = require("./pool");
const FilteredPoolCluster = require("./filtered-pool-cluster");

/**
 * Create a new Cluster.
 * Cluster handle pools with patterns and handle failover / distributed load
 * according to selectors (round robin / random / ordered )
 *
 * @param args      cluster argurments. see pool-cluster-options.
 * @constructor
 */
function PoolCluster(args) {

  const opts = new PoolClusterOptions(args);
  const nodes = {};
  let cachedPatterns = {};
  let nodeCounter = 0;

  /**
   * Add a new pool node to cluster.
   *
   * @param id      identifier
   * @param config  pool configuration
   */
  this.add = (id, config) => {
    let identifier;
    if (typeof id === "string" || id instanceof String) {
      identifier = id;
      if (nodes[identifier])
        throw new Error("Node identifier '" + identifier + "' already exist !");
    } else {
      identifier = "PoolNode-" + nodeCounter++;
    }
    const options = new PoolOptions(config);
    const pool = new Pool(options, false);
    pool.activatePool();
    nodes[identifier] = pool;
  };

  /**
   * End cluster (and underlying pools).
   *
   * @return {Promise<any[]>}
   */
  this.end = () => {
    cachedPatterns = {};
    const poolEndPromise = [];
    Object.keys(nodes).forEach(pool => {
      poolEndPromise.push(nodes[pool].end());
      delete nodes[pool];
    });

    return Promise.all(poolEndPromise);
  };

  this.of = (pattern, selector) => {
    return new FilteredPoolCluster(this, pattern, selector);
  };

  /**
   * Remove nodes according to pattern.
   *
   * @param pattern  pattern
   */
  this.remove = pattern => {
    if (!pattern)
      throw new Error("pattern parameter in Cluster.remove(pattern)  is mandatory");

    const regex = RegExp(pattern);
    Object.keys(nodes).forEach(key => {
      if (regex.test(key)) {
        nodes[key].end();
        delete nodes[key];
        cachedPatterns = {};
      }
    });
  };

  /**
   * Get connection from available pools matching pattern, according to selector
   *
   * @param pattern       pattern filter (not mandatory)
   * @param selector      node selector ('RR','RANDOM' or 'ORDER')
   * @return {Promise}
   */
  this.getConnection = (pattern, selector) => {
    return _getConnection(pattern, selector);
  };

  /**
   * Get connection from available pools matching pattern, according to selector
   * with additional parameter to avoid reusing failing node
   *
   * @param pattern       pattern filter (not mandatory)
   * @param selector      node selector ('RR','RANDOM' or 'ORDER')
   * @param avoidNodeKey  failing node
   * @return {Promise}
   * @private
   */
  const _getConnection = (pattern, selector, avoidNodeKey) => {
    const matchingNodeList = _matchingNodes(pattern || /^/);

    if (matchingNodeList.length === 0) {
      if (Object.keys(nodes).length === 0)
        return Promise.reject(
          new Error(
            "No node have been added to cluster or nodes have been removed due to too much connection error"
          )
        );
      return Promise.reject(new Error("No node found for pattern '" + pattern + "'"));
    }

    const retry = _getConnection.bind(this, pattern, selector);
    return _selectPool(matchingNodeList, selector, retry, avoidNodeKey);
  };

  /**
   * Selecting nodes according to pattern.
   *
   * @param pattern pattern
   * @return {Json}
   * @private
   */
  const _matchingNodes = pattern => {
    if (cachedPatterns[pattern]) return cachedPatterns[pattern];

    const regex = RegExp(pattern);
    const matchingNodeList = [];
    Object.keys(nodes).forEach(key => {
      if (regex.test(key)) {
        matchingNodeList.push(key);
      }
    });

    cachedPatterns[pattern] = matchingNodeList;
    return matchingNodeList;
  };

  /**
   * Select next node to be chosen in nodeList according to selector and failed nodes.
   *
   * @param nodeList        current node list
   * @param selectorParam   selector
   * @param retryFct        retry function in case of connection fails
   * @param avoidNodeKey    last failing node to avoid selecting this one.
   * @return {Promise}
   * @private
   */
  const _selectPool = (nodeList, selectorParam, retryFct, avoidNodeKey) => {
    const selector = selectorParam || opts.defaultSelector;
    let retry = 0;
    let selectorFct;
    let nodeKey;
    switch (selector) {
      case "RR":
        selectorFct = roundRobinSelector;
        break;

      case "RANDOM":
        selectorFct = randomSelector;
        break;

      case "ORDER":
        selectorFct = orderedSelector;
        break;

      default:
        return Promise.reject(
          new Error(
            "Wrong selector value '" + selector + "'. Possible values are 'RR','RANDOM' or 'ORDER'"
          )
        );
    }

    nodeKey = selectorFct(nodeList, retry);
    while (
      (avoidNodeKey === nodeKey || nodes[nodeKey].timeout > Date.now()) &&
      retry < nodeList.length - 1
    ) {
      retry++;
      nodeKey = selectorFct(nodeList);
    }
    return _handleConnectionError(nodeList, nodeKey, retryFct);
  };

  /**
   * Round robin selector: using nodes one after the other.
   *
   * @param nodeList  node list
   * @return {String}
   */
  const roundRobinSelector = nodeList => {
    let lastRoundRobin = nodeList.lastRrIdx;
    if (lastRoundRobin === undefined) lastRoundRobin = -1;
    if (++lastRoundRobin >= nodeList.length) lastRoundRobin = 0;
    nodeList.lastRrIdx = lastRoundRobin;
    return nodeList[lastRoundRobin];
  };

  /**
   * Random selector: use a random node.
   *
   * @param nodeList  node list
   * @return {String}
   */
  const randomSelector = nodeList => {
    let randomIdx = Math.floor(Math.random() * nodeList.length);
    return nodeList[randomIdx];
  };

  /**
   * Ordered selector: always use the nodes in sequence, unless failing.
   *
   * @param nodeList  node list
   * @param retry     sequence number if last node is tagged has failing
   * @return {String}
   */
  const orderedSelector = (nodeList, retry) => {
    return nodeList[retry];
  };

  /**
   * Connect, or if fail handle retry / set timeout error
   *
   * @param nodeList    current node list
   * @param nodeKey     node name to connect
   * @param retryFct    retry function
   * @return {Promise}
   * @private
   */
  const _handleConnectionError = (nodeList, nodeKey, retryFct) => {
    const node = nodes[nodeKey];
    return node
      .getConnection()
      .then(conn => {
        node.errorCount = 0;
        return Promise.resolve(conn);
      })
      .catch(err => {
        node.errorCount = node.errorCount ? node.errorCount + 1 : 1;
        if (node.errorCount >= opts.removeNodeErrorCount && nodes[nodeKey]) {
          if (opts.restoreNodeTimeout === 0) {
            delete nodes[nodeKey];
            cachedPatterns = {};
            delete nodeList.lastRrIdx;
            //remove node from configuration if not already removed
            node.end().catch(err => {
              // dismiss error
            });
          } else {
            node.timeout = Date.now() + opts.restoreNodeTimeout;
          }
          if (nodeList.length === 0) return Promise.reject(err);
        }

        if (opts.canRetry) return retryFct(nodeKey);
        return Promise.reject(err);
      });
  };

  //*****************************************************************
  // internal public testing methods
  //*****************************************************************

  function TestMethods() {}
  TestMethods.prototype.getNodes = () => {
    return nodes;
  };

  this.__tests = new TestMethods();
}

module.exports = PoolCluster;
