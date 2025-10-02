//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import { createConnection, createCallbackConnection } from '../base.js';

describe.concurrent('pipelining', () => {
  let conn1, conn2;
  const iterations = 500;

  beforeAll(async () => {
    conn1 = await createConnection({ pipelining: false });
    conn2 = await createConnection({ pipelining: true });
  });
  afterAll(async () => {
    await conn1.end();
    await conn2.end();
    conn1 = null;
    conn2 = null;
  });

  test('simple query chain no pipelining', async () => {
    let rows = await conn1.query('DO 1');
    assert.deepEqual(rows, {
      affectedRows: 0,
      insertId: 0n,
      warningStatus: 0
    });
    rows = await conn1.query('DO 2');
    assert.deepEqual(rows, {
      affectedRows: 0,
      insertId: 0n,
      warningStatus: 0
    });
  });

  test('pipelining without waiting for connect', async () => {
    const conn = createCallbackConnection({ pipelining: true });
    await new Promise((resolve, reject) => {
      conn.connect((err) => {});
      conn.query("SELECT '1'", (err, rows) => {
        assert.deepEqual(rows, [{ 1: '1' }]);
      });
      conn.query("SELECT '2'", (err, rows) => {
        assert.deepEqual(rows, [{ 2: '2' }]);
        conn.end(resolve);
      });
    });
  });

  test('no pipelining without waiting for connect', async () => {
    const conn = createCallbackConnection({ pipelining: false });
    await new Promise((resolve, reject) => {
      conn.connect((err) => {});
      conn.query("SELECT '1'", (err, rows) => {
        assert.deepEqual(rows, [{ 1: '1' }]);
      });
      conn.query("SELECT '2'", (err, rows) => {
        assert.deepEqual(rows, [{ 2: '2' }]);
        conn.end(resolve);
      });
    });
  });

  test('500 insert test speed', async () => {
    let diff, pipelineDiff;
    await conn1.query('DROP TABLE IF EXISTS pipeline1');
    await conn2.query('DROP TABLE IF EXISTS pipeline2');
    await conn1.query('CREATE TABLE pipeline1 (test int)');
    await conn2.query('CREATE TABLE pipeline2 (test int)');
    diff = await insertBulk(conn1, 'pipeline1');
    pipelineDiff = await insertBulk(conn2, 'pipeline2');
    if (conn1.info.hasMinVersion(10, 2, 0)) {
      //before 10.1, speed is sometime nearly equivalent using pipelining or not
      //remove speed test then to avoid random error in CIs
      if (diff < pipelineDiff) {
        console.log('time to insert 1000 : std=' + diff + 'ms pipelining=' + pipelineDiff + 'ms');
      }
    }
  }, 60000);

  function insertBulk(conn, tableName) {
    const startTime = performance.now();
    let ended = 0;
    return new Promise(function (resolve, reject) {
      for (let i = 0; i < iterations; i++) {
        conn
          .query('INSERT INTO ' + tableName + ' VALUES(?)', [i])
          .then(() => {
            if (++ended === iterations) {
              resolve(performance.now() - startTime);
            }
          })
          .catch(reject);
      }
    });
  }
});
