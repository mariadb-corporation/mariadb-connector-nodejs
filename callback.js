'use strict';
const pkg = require('./package.json');
require('please-upgrade-node')(pkg);

const ConnectionCallback = require('./lib/connection-callback');
const PoolClusterCallback = require('./lib/pool-cluster-callback');
const PoolCallback = require('./lib/pool-callback');

const ConnOptions = require('./lib/config/connection-options');
const PoolOptions = require('./lib/config/pool-options');
const PoolClusterOptions = require('./lib/config/pool-cluster-options');
const Connection = require('./lib/connection');

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
  const conn = new Connection(new ConnOptions(opts));
  const connCallback = new ConnectionCallback(conn);
  conn
    .connect()
    .then(
      function () {
        connCallback.emit('connect');
      }.bind(connCallback)
    )
    .catch(connCallback.emit.bind(connCallback, 'connect'));
  return connCallback;
};

exports.createPool = function createPool(opts) {
  const options = new PoolOptions(opts);
  return new PoolCallback(options);
};

exports.createPoolCluster = function createPoolCluster(opts) {
  const options = new PoolClusterOptions(opts);
  return new PoolClusterCallback(options);
};
