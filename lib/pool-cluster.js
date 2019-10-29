'use strict';

const PoolClusterOptions = require('./config/pool-cluster-options');
const PoolOptions = require('./config/pool-options');
const Pool = require('./pool-promise');
const PoolCallback = require('./pool-callback');
const FilteredPoolCluster = require('./filtered-pool-cluster');
const EventEmitter = require('events');
const util = require('util');

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
  EventEmitter.call(this);

  /**
   * Add a new pool node to cluster.
   *
   * @param id      identifier
   * @param config  pool configuration
   */
  this.add = (id, config) => {
    let identifier;
    if (typeof id === 'string' || id instanceof String) {
      identifier = id;
      if (nodes[identifier])
        throw new Error("Node identifier '" + identifier + "' already exist !");
    } else {
      identifier = 'PoolNode-' + nodeCounter++;
      config = id;
    }
    const options = new PoolOptions(config);
    const pool = _createPool(options);
    pool.initialize();
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
    if (!pattern) throw new Error('pattern parameter in Cluster.remove(pattern)  is mandatory');

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
    return _getConnection(this, pattern, selector);
  };

  /**
   * Force using callback methods.
   */
  this.setCallback = () => {
    this.getConnection = _getConnectionCallback.bind(this, this);
    _createPool = _createPoolCallback;
  };

  /**
   * Get connection from available pools matching pattern, according to selector
   * with additional parameter to avoid reusing failing node
   *
   * @param pattern       pattern filter (not mandatory)
   * @param selector      node selector ('RR','RANDOM' or 'ORDER')
   * @param avoidNodeKey  failing node
   * @param lastError     last error
   * @return {Promise}
   * @private
   */
  const _getConnection = (cluster, pattern, selector, avoidNodeKey, lastError) => {
    const matchingNodeList = _matchingNodes(pattern || /^/);

    if (matchingNodeList.length === 0) {
      if (Object.keys(nodes).length === 0 && !lastError) {
        return Promise.reject(
          new Error(
            'No node have been added to cluster ' +
              'or nodes have been removed due to too much connection error'
          )
        );
      }
      if (avoidNodeKey === undefined)
        return Promise.reject(new Error("No node found for pattern '" + pattern + "'"));
      const errMsg =
        "No Connection available for '" +
        pattern +
        "'" +
        (lastError ? '. Last connection error was: ' + lastError.message : '');
      return Promise.reject(new Error(errMsg));
    }

    const retry = _getConnection.bind(this, this, pattern, selector);
    try {
      const nodeKey = _selectPool(matchingNodeList, selector, avoidNodeKey);
      return _handleConnectionError(cluster, matchingNodeList, nodeKey, retry);
    } catch (e) {
      return Promise.reject(e);
    }
  };

  let _createPool = options => {
    return new Pool(options, false);
  };

  const _createPoolCallback = options => {
    return new PoolCallback(options, false);
  };

  /**
   * Get connection from available pools matching pattern, according to selector
   * with additional parameter to avoid reusing failing node
   *
   * @param pattern       pattern filter (not mandatory)
   * @param selector      node selector ('RR','RANDOM' or 'ORDER')
   * @param callback      callback function
   * @param avoidNodeKey  failing node
   * @param lastError     last error
   * @private
   */
  const _getConnectionCallback = (
    cluster,
    pattern,
    selector,
    callback,
    avoidNodeKey,
    lastError
  ) => {
    const matchingNodeList = _matchingNodes(pattern || /^/);

    if (matchingNodeList.length === 0) {
      if (Object.keys(nodes).length === 0 && !lastError) {
        callback(
          new Error(
            'No node have been added to cluster ' +
              'or nodes have been removed due to too much connection error'
          )
        );
        return;
      }

      if (avoidNodeKey === undefined)
        callback(new Error("No node found for pattern '" + pattern + "'"));
      const errMsg =
        "No Connection available for '" +
        pattern +
        "'" +
        (lastError ? '. Last connection error was: ' + lastError.message : '');
      callback(new Error(errMsg));
      return;
    }

    const retry = _getConnectionCallback.bind(this, this, pattern, selector, callback);
    try {
      const nodeKey = _selectPool(matchingNodeList, selector, avoidNodeKey);
      _handleConnectionCallbackError(this, matchingNodeList, nodeKey, retry, callback);
    } catch (e) {
      callback(e);
    }
  };

  /**
   * Selecting nodes according to pattern.
   *
   * @param pattern pattern
   * @return {*}
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
   * @param avoidNodeKey    last failing node to avoid selecting this one.
   * @return {Promise}
   * @private
   */
  const _selectPool = (nodeList, selectorParam, avoidNodeKey) => {
    const selector = selectorParam || opts.defaultSelector;
    let retry = 0;
    let selectorFct;
    let nodeKey;
    switch (selector) {
      case 'RR':
        selectorFct = roundRobinSelector;
        break;

      case 'RANDOM':
        selectorFct = randomSelector;
        break;

      case 'ORDER':
        selectorFct = orderedSelector;
        break;

      default:
        throw new Error(
          "Wrong selector value '" + selector + "'. Possible values are 'RR','RANDOM' or 'ORDER'"
        );
    }

    nodeKey = selectorFct(nodeList, retry);
    while (
      (avoidNodeKey === nodeKey || nodes[nodeKey].blacklistedUntil > Date.now()) &&
      retry < nodeList.length - 1
    ) {
      retry++;
      nodeKey = selectorFct(nodeList, retry);
    }
    return nodeKey;
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
   * @param cluster     current cluster
   * @param nodeList    current node list
   * @param nodeKey     node name to connect
   * @param retryFct    retry function
   * @return {Promise}
   * @private
   */
  const _handleConnectionError = (cluster, nodeList, nodeKey, retryFct) => {
    const node = nodes[nodeKey];
    return node
      .getConnection()
      .then(conn => {
        node.errorCount = 0;
        return Promise.resolve(conn);
      })
      .catch(err => {
        node.errorCount = node.errorCount ? node.errorCount + 1 : 1;
        node.blacklistedUntil = Date.now() + opts.restoreNodeTimeout;
        if (
          opts.removeNodeErrorCount &&
          node.errorCount >= opts.removeNodeErrorCount &&
          nodes[nodeKey]
        ) {
          delete nodes[nodeKey];
          cachedPatterns = {};
          delete nodeList.lastRrIdx;
          process.nextTick(() => cluster.emit('remove', nodeKey));
          //remove node from configuration if not already removed
          node.end().catch(err => {
            // dismiss error
          });
        }

        if (nodeList.length !== 0 && opts.canRetry) {
          return retryFct(nodeKey, err);
        }
        return Promise.reject(err);
      });
  };

  /**
   * Connect, or if fail handle retry / set timeout error
   *
   * @param cluster     current cluster
   * @param nodeList    current node list
   * @param nodeKey     node name to connect
   * @param retryFct    retry function
   * @param callback    callback function
   * @private
   */
  const _handleConnectionCallbackError = (cluster, nodeList, nodeKey, retryFct, callback) => {
    const node = nodes[nodeKey];
    node.getConnection((err, conn) => {
      if (err) {
        node.errorCount = node.errorCount ? node.errorCount + 1 : 1;
        node.blacklistedUntil = Date.now() + opts.restoreNodeTimeout;
        if (
          opts.removeNodeErrorCount &&
          node.errorCount >= opts.removeNodeErrorCount &&
          nodes[nodeKey]
        ) {
          delete nodes[nodeKey];
          cachedPatterns = {};
          delete nodeList.lastRrIdx;
          process.nextTick(() => cluster.emit('remove', nodeKey));
          //remove node from configuration if not already removed
          node.end(() => {
            //dismiss error
          });
          if (nodeList.length === 0) return Promise.reject(err);
        }

        if (opts.canRetry) return retryFct(nodeKey, err);
        callback(err);
      } else {
        node.errorCount = 0;
        callback(null, conn);
      }
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

util.inherits(PoolCluster, EventEmitter);

module.exports = PoolCluster;
