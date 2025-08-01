//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import './check-node.js';
import Connection from './lib/connection.js';
import ConnectionPromise from './lib/connection-promise.js';
import PoolPromise from './lib/pool-promise.js';
import Cluster from './lib/cluster.js';
import ConnOptions from './lib/config/connection-options.js';
import PoolOptions from './lib/config/pool-options.js';
import ClusterOptions from './lib/config/cluster-options.js';
import * as SqlError from './lib/misc/errors.js';
import packageJson from './package.json' with { type: 'json' };

export const version = packageJson.version;

export { SqlError };

export function defaultOptions(opts) {
  const connOpts = new ConnOptions(opts);
  const res = {};
  for (const [key, value] of Object.entries(connOpts)) {
    if (!key.startsWith('_')) {
      res[key] = value;
    }
  }
  return res;
}

export function createConnection(opts) {
  try {
    const options = new ConnOptions(opts);
    const conn = new Connection(options);
    const connPromise = new ConnectionPromise(conn);

    return conn.connect().then(() => Promise.resolve(connPromise));
  } catch (err) {
    return Promise.reject(err);
  }
}

export function createPool(opts) {
  const options = new PoolOptions(opts);
  const pool = new PoolPromise(options);
  // adding a default error handler to avoid exiting application on connection error.
  pool.on('error', (err) => {});
  return pool;
}

export function createPoolCluster(opts) {
  const options = new ClusterOptions(opts);
  return new Cluster(options);
}

export function importFile(opts) {
  try {
    const options = new ConnOptions(opts);
    const conn = new Connection(options);

    return conn
      .connect()
      .then(() => {
        return new Promise(conn.importFile.bind(conn, Object.assign({ skipDbCheck: true }, opts)));
      })
      .finally(() => {
        new Promise(conn.end.bind(conn, {})).catch(console.log);
      });
  } catch (err) {
    return Promise.reject(err);
  }
}
