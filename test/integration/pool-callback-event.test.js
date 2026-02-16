//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import { createPoolCallback } from '../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';

describe.concurrent('Pool callback event', () => {
  test('pool connection creation', async () => {
    const pool = createPoolCallback();
    await new Promise((resolve, reject) => {
      let connectionNumber = 0;
      pool.on('connection', (conn) => {
        assert.isTrue(conn !== undefined);
        connectionNumber++;
      });
      setTimeout(() => {
        assert.equal(connectionNumber, 10);
        pool.end();
        resolve();
      }, 7000);
    });
  }, 10000);

  test('pool connection acquire', async () => {
    const pool = createPoolCallback({ connectionLimit: 2 });
    await new Promise((resolve, reject) => {
      let acquireNumber = 0;
      pool.on('acquire', () => {
        acquireNumber++;
      });

      pool.query("SELECT '1'", (err, res) => {
        assert.equal(acquireNumber, 1);
        pool.getConnection((err, conn) => {
          assert.equal(acquireNumber, 2);
          conn.release();
          pool.end();
          resolve();
        });
      });
    });
  });

  test('pool callback connection event provides callback-wrapped connection', async () => {
    const pool = createPoolCallback({ connectionLimit: 1, minimumIdle: 1 });
    await new Promise((resolve, reject) => {
      pool.on('connection', (conn) => {
        try {
          assert.isTrue(conn !== undefined);
          assert.equal(typeof conn.query, 'function');
          assert.isTrue(conn.threadId > 0);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
    pool.end();
  }, 5000);

  test('pool callback connection event query works', async () => {
    const pool = createPoolCallback({ connectionLimit: 1, minimumIdle: 1 });
    const result = await new Promise((resolve, reject) => {
      pool.on('connection', (conn) => {
        conn.query('SELECT 1 as val', (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
      });
    });
    assert.deepEqual(result, [{ val: 1 }]);
    pool.end();
  }, 5000);

  test('pool callback connection event error does not break pool', async () => {
    const pool = createPoolCallback({ connectionLimit: 2, minimumIdle: 2 });
    await new Promise((resolve, reject) => {
      let connectionCount = 0;
      pool.on('connection', () => {
        connectionCount++;
        throw new Error('user error in connection handler');
      });
      setTimeout(() => {
        assert.equal(connectionCount, 2);
        pool.query('SELECT 1 as val', (err, res) => {
          if (err) reject(err);
          try {
            assert.deepEqual(res, [{ val: 1 }]);
            pool.end();
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      }, 2000);
    });
  }, 5000);

  test('pool callback connection event no excess connections (issue #342)', async () => {
    const pool = createPoolCallback({ connectionLimit: 3, minimumIdle: 3 });
    await new Promise((resolve, reject) => {
      let connectionCount = 0;
      pool.on('connection', (conn) => {
        connectionCount++;
        conn.query('SET @k = NULL', () => {});
      });
      setTimeout(() => {
        try {
          assert.equal(connectionCount, 3);
          assert.equal(pool.totalConnections(), 3);
          assert.equal(pool.idleConnections(), 3);
          pool.end();
          resolve();
        } catch (e) {
          reject(e);
        }
      }, 3000);
    });
  }, 5000);

  test('pool connection enqueue', async () => {
    const pool = createPoolCallback({ connectionLimit: 2, acquireTimeout: 20000 });
    await new Promise((resolve, reject) => {
      let enqueueNumber = 0;
      let releaseNumber = 0;
      pool.on('enqueue', () => {
        enqueueNumber++;
      });
      pool.on('release', (conn) => {
        assert.isTrue(conn !== undefined);
        releaseNumber++;
      });

      setTimeout(() => {
        const requests = [];
        for (let i = 0; i < 499; i++) {
          requests.push(pool.query('SELECT ' + i));
        }
        pool.query('SELECT 499', (err, res) => {
          assert.isTrue(enqueueNumber <= 499, enqueueNumber);
          assert.isTrue(enqueueNumber > 490, enqueueNumber);
          setTimeout(() => {
            assert.equal(releaseNumber, 500, releaseNumber);
            pool.end();
            resolve();
          }, 5000);
        });
      }, 1000);
    });
  }, 20000);
});
