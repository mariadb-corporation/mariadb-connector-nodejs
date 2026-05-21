//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB Corporation Ab

// Smoke test: the package must be importable from native ESM in every form
// (regression coverage for https://github.com/mariadb-corporation/mariadb-connector-nodejs/issues/346).
//
// The .mjs extension forces Node's ESM loader regardless of "type" in package.json.

import assert from 'node:assert';
import mariadb, { createPool, createConnection, version, SqlError } from 'mariadb';
import * as mariadbNs from 'mariadb';
import mariadbCb, { createPool as createPoolCb } from 'mariadb/callback';

const expectedNamed = [
  'SqlError',
  'createConnection',
  'createPool',
  'createPoolCluster',
  'defaultOptions',
  'importFile',
  'version'
];

// default import: `import mariadb from 'mariadb'`
assert.ok(mariadb, 'default export missing');
assert.strictEqual(typeof mariadb.createPool, 'function', 'default.createPool is not a function');
assert.strictEqual(typeof mariadb.version, 'string', 'default.version is not a string');

// named imports
assert.strictEqual(typeof createPool, 'function', 'named createPool is not a function');
assert.strictEqual(typeof createConnection, 'function', 'named createConnection is not a function');
assert.strictEqual(typeof version, 'string', 'named version is not a string');
assert.ok(SqlError, 'named SqlError missing');

// namespace import
for (const key of expectedNamed) {
  assert.ok(key in mariadbNs, `namespace import: missing '${key}'`);
}

// /callback subpath
assert.ok(mariadbCb, '/callback default export missing');
assert.strictEqual(typeof mariadbCb.createPool, 'function', '/callback default.createPool is not a function');
assert.strictEqual(typeof createPoolCb, 'function', '/callback named createPool is not a function');

console.log('ESM import smoke test: OK');
