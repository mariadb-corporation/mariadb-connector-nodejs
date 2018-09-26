"use strict";

const PoolClusterOptions = require("./config/pool-cluster-options");
const PoolOptions = require("./config/pool-options");
const Pool = require("./pool");

function PoolCluster(args) {
  const opts = new PoolClusterOptions(args);
  const nodes = {};
  let cachedPatterns = {};
  let nodeCounter = 0;

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
    //TODO ?
  };

  this.remove = pattern => {
    if (!pattern)
      return Promise.reject(
        new Error("pattern parameter in Cluster.remove(pattern)  is mandatory")
      );
    const regex = RegExp(pattern);
    Object.keys(nodes).forEach(key => {
      if (regex.test(key)) {
        nodes[key].end();
        delete nodes[key];
      }
    });
    cachedPatterns = {};
  };

  this.getConnection = (pattern, selector, avoidNodeKey) => {
    let retry = this.getConnection.bind(this, pattern, selector);
    if (!pattern)
      return Promise.reject(
        new Error("pattern parameter in Cluster.getConnection(pattern, selector) is mandatory")
      );
    if (cachedPatterns[pattern]) {
      return _getConnection(cachedPatterns[pattern], selector, retry, avoidNodeKey);
    }
    const regex = RegExp(pattern);
    const matchingNodeList = [];
    Object.keys(nodes).forEach(key => {
      if (regex.test(key)) {
        if (!nodes[key].timeout || (nodes[key].timeout && nodes[key].timeout < Date.now())) {
          matchingNodeList.push(key);
        }
      }
    });

    if (matchingNodeList.length === 0) {
      return Promise.reject(new Error("No node found for pattern '" + pattern + "'"));
    }

    cachedPatterns[pattern] = matchingNodeList;
    return _getConnection(matchingNodeList, selector, retry, avoidNodeKey);
  };

  const _getConnection = (nodeList, selectorParam, retryFct, avoidNodeKey) => {
    const selector = selectorParam || opts.defaultSelector;
    switch (selector) {
      case "RR":
        let lastRoundRobin = nodeList.lastRrIdx;
        if (lastRoundRobin === undefined) lastRoundRobin = -1;
        if (++lastRoundRobin >= nodeList.length) lastRoundRobin = 0;
        let nodeKey = nodeList[lastRoundRobin];
        if (avoidNodeKey === nodeKey) {
          if (++lastRoundRobin >= nodeList.length) lastRoundRobin = 0;
          nodeKey = nodeList[lastRoundRobin];
        }
        nodeList.lastRrIdx = lastRoundRobin;
        return _handleConnectionError(nodeList, nodeKey, retryFct, avoidNodeKey);

      case "RANDOM":
        let randomIdx = Math.floor(Math.random() * nodeList.length);
        let randomNodeKey = nodeList[randomIdx];
        if (avoidNodeKey === randomNodeKey) {
          if (++randomIdx >= nodeList.length) randomIdx = 0;
          randomNodeKey = nodeList[randomNodeKey];
        }
        return _handleConnectionError(nodeList, randomNodeKey, retryFct, avoidNodeKey);

      case "ORDER":
        let orderIdx = 0;
        if (avoidNodeKey === nodeList[0] && nodeList.length > 1) orderIdx = 1;
        return _handleConnectionError(nodeList, nodeList[orderIdx], retryFct, avoidNodeKey);
    }
    return Promise.reject(
      new Error(
        "Wrong selector value '" + selector + "'. Possible values are 'RR','RANDOM' or 'ORDER'"
      )
    );
  };

  const _handleConnectionError = (nodeList, nodeKey, retryFct, avoidNodeKey) => {
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
