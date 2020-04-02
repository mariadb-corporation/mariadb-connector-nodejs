'use strict';
const pkg = require('./package.json')
require('please-upgrade-node')(pkg)

const ConnectionCallback = require('./lib/connection-callback');
const PoolClusterCallback = require('./lib/pool-cluster-callback');
const PoolCallback = require('./lib/pool-callback');

const ConnOptions = require('./lib/config/connection-options');
const PoolOptions = require('./lib/config/pool-options');
const PoolClusterOptions = require('./lib/config/pool-cluster-options');

module.exports.version = require('./package.json').version;
module.exports.SqlError = require('./lib/misc/errors').SqlError;
module.exports.createConnection = function createConnection(opts) {
  return new ConnectionCallback(new ConnOptions(opts));
};

exports.createPool = function createPool(opts) {
  const options = new PoolOptions(opts);
  const pool = new PoolCallback(options);
  pool.initialize();
  return pool;
};

exports.createPoolCluster = function createPoolCluster(opts) {
  const options = new PoolClusterOptions(opts);
  return new PoolClusterCallback(options);
};
