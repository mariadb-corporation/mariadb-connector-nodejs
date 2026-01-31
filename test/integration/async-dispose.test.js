//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB Corporation Ab

'use strict';

import { createConnection, createPool } from '../base.js';
import { baseConfig } from '../conf.js';
import { assert, describe, test } from 'vitest';

describe.runIf('asyncDispose' in Symbol).concurrent('Explicit Resource Management', () => {
  test('with Connection', async function () {
    const conn = await createConnection({
      ...baseConfig
    });
    assert.equal(conn.isValid(), true);

    await conn[Symbol.asyncDispose]();
    assert.equal(conn.isValid(), false);
  });

  test('with Pool', async function () {
    const pool = createPool({
      connectionLimit: 1
    });
    let releaseNumber = 0;
    pool.on('release', (conn) => {
      assert.isTrue(conn !== undefined);
      releaseNumber++;
    });

    const conn = await pool.getConnection();
    assert.equal(pool.idleConnections(), 0);
    assert.equal(pool.activeConnections(), 1);

    await conn[Symbol.asyncDispose]();
    assert.equal(pool.idleConnections(), 1);
    assert.equal(pool.activeConnections(), 0);

    assert.equal(releaseNumber, 1);

    await pool.end();
  });
});
