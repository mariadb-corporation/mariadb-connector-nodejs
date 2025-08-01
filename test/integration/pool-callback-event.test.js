//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import { createPoolCallback } from '../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';

describe('Pool callback event', () => {
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
