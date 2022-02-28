'use strict';

const pkg = require('./package.json');
require('please-upgrade-node')(pkg);

const Connection = require('./lib/connection');
const ConnectionPromise = require('./lib/connection-promise');
const PoolPromise = require('./lib/pool-promise');
const Cluster = require('./lib/cluster');

const ConnOptions = require('./lib/config/connection-options');
const PoolOptions = require('./lib/config/pool-options');
const ClusterOptions = require('./lib/config/cluster-options');

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
    const conn = new Connection(options);
    const connPromise = new ConnectionPromise(conn);

    return conn.connect().then(() => Promise.resolve(connPromise));
  } catch (err) {
    return Promise.reject(err);
  }
};

module.exports.createPool = function createPool(opts) {
  const options = new PoolOptions(opts);
  return new PoolPromise(options);
};

module.exports.createPoolCluster = function createPoolCluster(opts) {
  const options = new ClusterOptions(opts);
  return new Cluster(options);
};
