'use strict';

const pkg = require('./package.json');
require('please-upgrade-node')(pkg);

const Connection = require('./lib/connection');
const PoolBase = require('./lib/pool');
const PoolCluster = require('./lib/pool-cluster');

const ConnOptions = require('./lib/config/connection-options');
const PoolOptions = require('./lib/config/pool-options');
const PoolClusterOptions = require('./lib/config/pool-cluster-options');

module.exports.version = require('./package.json').version;
module.exports.SqlError = require('./lib/misc/errors').SqlError;

module.exports.defaultOptions = function defaultOptions(opts) {
  const connOpts = new ConnOptions(opts);
  const res = {};
  for (const [key, value] of Object.entries(connOpts)) {
    if (!key.startsWith('_')) {
      res[key] = value;
    }
  }
  return res;
};

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
  return new PoolBase(options, false);
};

module.exports.createPoolCluster = function createPoolCluster(opts) {
  const options = new PoolClusterOptions(opts);
  return new PoolCluster(options);
};
