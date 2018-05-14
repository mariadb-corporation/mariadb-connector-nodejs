"use strict";

let Connection = require('./lib/connection.js');
let Pool = require('./lib/pool.js');
let PoolCluster = require('./lib/pool-cluster.js');
let ConnOptions = require('./lib/config/connection-options.js');

module.exports.createConnection = function createConnection(opts) {
  let connOptions = new ConnOptions(opts);
  return new Connection(connOptions);
};

exports.createPool = function createPool(config) {
  //TODO
};

exports.createPoolCluster = function createPoolCluster(config) {
  //TODO
};
