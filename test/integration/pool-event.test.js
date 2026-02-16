//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import * as base from '../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';

describe.concurrent('Pool event', () => {
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
    await conn.release();
    await pool.end();
  });

  test('pool connection event provides promise-wrapped connection', async () => {
    const pool = base.createPool({ connectionLimit: 1, minimumIdle: 1 });
    await new Promise((resolve, reject) => {
      pool.on('connection', (conn) => {
        try {
          assert.isTrue(conn !== undefined);
          assert.equal(typeof conn.query, 'function');
          assert.equal(typeof conn.execute, 'function');
          assert.isTrue(conn.threadId > 0);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
    await pool.end();
  }, 5000);

  test('pool connection event query works', async () => {
    const pool = base.createPool({ connectionLimit: 1, minimumIdle: 1 });
    const result = await new Promise((resolve, reject) => {
      pool.on('connection', async (conn) => {
        try {
          const res = await conn.query('SELECT 1 as val');
          resolve(res);
        } catch (e) {
          reject(e);
        }
      });
    });
    assert.deepEqual(result, [{ val: 1 }]);
    await pool.end();
  }, 5000);

  test('pool connection event error does not break pool', async () => {
    const pool = base.createPool({ connectionLimit: 2, minimumIdle: 2 });
    let connectionCount = 0;
    pool.on('connection', () => {
      connectionCount++;
      throw new Error('user error in connection handler');
    });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    assert.equal(connectionCount, 2);
    const res = await pool.query('SELECT 1 as val');
    assert.deepEqual(res, [{ val: 1 }]);
    await pool.end();
  }, 5000);

  test('pool connection event no excess connections (issue #342)', async () => {
    const pool = base.createPool({ connectionLimit: 3, minimumIdle: 3 });
    let connectionCount = 0;
    pool.on('connection', (conn) => {
      connectionCount++;
      conn.query('SET @k = NULL');
    });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    assert.equal(connectionCount, 3);
    assert.equal(pool.totalConnections(), 3);
    assert.equal(pool.idleConnections(), 3);
    await pool.end();
  }, 5000);

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
