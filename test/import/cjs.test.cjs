//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB Corporation Ab

// Smoke test: the package must be require()-able from CommonJS code
// (regression coverage for https://github.com/mariadb-corporation/mariadb-connector-nodejs/issues/346).
//
// This file uses the .cjs extension so Node always loads it as CommonJS,
// regardless of the package's "type": "module" setting.

'use strict';

const assert = require('node:assert');

const expectedNamed = [
  'SqlError',
  'createConnection',
  'createPool',
  'createPoolCluster',
  'defaultOptions',
  'importFile',
  'version'
];

function check(label, mod) {
  for (const key of expectedNamed) {
    assert.ok(key in mod, `${label}: missing named export '${key}'`);
  }
  assert.strictEqual(typeof mod.createPool, 'function', `${label}: createPool is not a function`);
  assert.strictEqual(typeof mod.version, 'string', `${label}: version is not a string`);

  // 3.4.x compatibility: default export was synthesized by CJS interop.
  // Under the new dual-package layout, the default key must still be present
  // so consumers that did `const mariadb = require('mariadb').default` keep working.
  assert.ok(mod.default, `${label}: default export is missing`);
  assert.strictEqual(typeof mod.default.createPool, 'function', `${label}: default.createPool is not a function`);
}

check("require('mariadb')", require('mariadb'));
check("require('mariadb/callback')", require('mariadb/callback'));

console.log('CJS import smoke test: OK');
