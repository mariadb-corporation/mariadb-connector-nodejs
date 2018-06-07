"use strict";

let ConnectionCallback = require('./lib/connection-callback');
let Pool = require('./lib/pool');
let PoolCluster = require('./lib/pool-cluster');
let ConnOptions = require('./lib/config/connection-options');

module.exports.createConnection = function createConnection(opts) {
  return new ConnectionCallback(new ConnOptions(opts));
};

exports.createPool = function createPool(config) {
  //TODO
};

exports.createPoolCluster = function createPoolCluster(config) {
  //TODO
};
