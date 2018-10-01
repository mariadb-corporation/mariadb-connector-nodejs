"use strict";

const Connection = require("./lib/connection");
const Pool = require("./lib/pool");
const PoolCluster = require("./lib/pool-cluster");

const ConnOptions = require("./lib/config/connection-options");
const PoolOptions = require("./lib/config/pool-options");
const PoolClusterOptions = require("./lib/config/pool-cluster-options");

module.exports.createConnection = function createConnection(opts) {
  try {
    const options = new ConnOptions(opts);
    return new Connection(options).connect();
  } catch (err) {
    return Promise.reject(err);
  }
};

module.exports.createPool = function createPool(opts) {
  const options = new PoolOptions(opts);
  const pool = new Pool(options, false);
  pool.activatePool();
  return pool;
};


module.exports.createPoolCluster = function createPoolCluster(opts) {
  const options = new PoolClusterOptions(opts);
  return new PoolCluster(options);
};
