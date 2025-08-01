//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import './check-node.js';
import ConnectionCallback from './lib/connection-callback.js';
import ClusterCallback from './lib/cluster-callback.js';
import PoolCallback from './lib/pool-callback.js';
import ConnOptions from './lib/config/connection-options.js';
import PoolOptions from './lib/config/pool-options.js';
import ClusterOptions from './lib/config/cluster-options.js';
import Connection from './lib/connection.js';
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
}

export function createPool(opts) {
  const options = new PoolOptions(opts);
  const pool = new PoolCallback(options);
  // adding a default error handler to avoid exiting application on connection error.
  pool.on('error', (err) => {});
  return pool;
}

export function createPoolCluster(opts) {
  const options = new ClusterOptions(opts);
  return new ClusterCallback(options);
}

export function importFile(opts, callback) {
  const cb = callback ? callback : () => {};
  try {
    const options = new ConnOptions(opts);
    const conn = new Connection(options);
    conn
      .connect()
      .then(() => {
        return new Promise(conn.importFile.bind(conn, Object.assign({ skipDbCheck: true }, opts)));
      })
      .then(() => cb())
      .catch((err) => cb(err))
      .finally(() => {
        new Promise(conn.end.bind(conn, {})).catch(console.log);
      });
  } catch (err) {
    cb(err);
  }
}
