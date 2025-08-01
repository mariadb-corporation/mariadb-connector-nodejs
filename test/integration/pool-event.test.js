//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import * as base from '../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';

describe('Pool event', () => {
  test('pool connection creation', async () => {
    const pool = base.createPool();
    let connectionNumber = 0;
    pool.on('connection', (conn) => {
      assert.isTrue(conn !== undefined);
      connectionNumber++;
    });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    assert.equal(connectionNumber, 10);
    await pool.end();
  }, 5000);

  test('pool connection acquire', async () => {
    const pool = base.createPool({ connectionLimit: 2 });
    let acquireNumber = 0;
    pool.on('acquire', () => {
      acquireNumber++;
    });

    await pool.query('SELECT 1');
    assert.equal(acquireNumber, 1);
    const conn = await pool.getConnection();
    assert.equal(acquireNumber, 2);
    conn.release();
    await pool.end();
  });

  test('pool connection enqueue', async () => {
    const pool = base.createPool({ connectionLimit: 2, acquireTimeout: 20000 });
    let enqueueNumber = 0;
    let releaseNumber = 0;
    pool.on('enqueue', () => {
      enqueueNumber++;
    });
    pool.on('release', (conn) => {
      assert.isTrue(conn !== undefined);
      releaseNumber++;
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const requests = [];
    for (let i = 0; i < 500; i++) {
      requests.push(pool.query('SELECT ' + i));
    }
    await Promise.all(requests);
    assert.isTrue(enqueueNumber <= 498, enqueueNumber);
    assert.isTrue(enqueueNumber > 490, enqueueNumber);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    assert.equal(releaseNumber, 500, releaseNumber);
    await pool.end();
  }, 20000);
});
