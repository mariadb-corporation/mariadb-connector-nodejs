"use strict";

let ConnectionCallback = require("./lib/connection-callback");
let ConnOptions = require("./lib/config/connection-options");
let PoolCallback = require("./lib/pool-callback");
let PoolOptions = require("./lib/config/pool-options");

module.exports.createConnection = function createConnection(opts) {
  return new ConnectionCallback(new ConnOptions(opts));
};

exports.createPool = function createPool(opts) {
  const options = new PoolOptions(opts);
  const pool = new PoolCallback(options);
  pool.activatePool();
  return pool;};

// exports.createPoolCluster = function createPoolCluster(config) {
//   //TODO
// };
