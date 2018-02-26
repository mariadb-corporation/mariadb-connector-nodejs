"use strict";

let Connection = require('./src/connection.js');
let Pool = require('./src/pool.js');
let PoolCluster = require('./src/pool-cluster.js');
let ConnOptions = require('./src/config/connection-options.js');

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
