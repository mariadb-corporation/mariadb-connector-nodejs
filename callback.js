'use strict';
const pkg = require('./package.json');
require('please-upgrade-node')(pkg);

const ConnectionCallback = require('./lib/connection-callback');
const ClusterCallback = require('./lib/cluster-callback');
const PoolCallback = require('./lib/pool-callback');

const ConnOptions = require('./lib/config/connection-options');
const PoolOptions = require('./lib/config/pool-options');
const ClusterOptions = require('./lib/config/cluster-options');
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
        conn.emit('connect');
      }.bind(conn)
    )
    .catch(conn.emit.bind(conn, 'connect'));
  return connCallback;
};

exports.createPool = function createPool(opts) {
  const options = new PoolOptions(opts);
  return new PoolCallback(options);
};

exports.createPoolCluster = function createPoolCluster(opts) {
  const options = new ClusterOptions(opts);
  return new ClusterCallback(options);
};
