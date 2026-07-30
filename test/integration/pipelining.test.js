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

  // CONJS-361: without pipelining a command is only sent once both queues are empty, so a finished
  // command left in the receive queue stalls the connection for good. A prepare response ends on a
  // column definition packet, which the reader dispatches through its fast-path.
  test('prepare then execute chain no pipelining', async () => {
    const conn = await createConnection({ pipelining: false });
    try {
      const prepare = await conn.prepare('SELECT ? as a');
      // this execute is the one that used to never reach the wire
      assert.deepEqual((await prepare.execute([1]))[0].a, 1);
      await prepare.close();

      // and the connection must remain usable afterwards, cached prepare included
      const cached = await conn.prepare('SELECT ? as a');
      assert.deepEqual((await cached.execute([2]))[0].a, 2);
      await cached.close();
      assert.deepEqual((await conn.query('SELECT 3 as b'))[0].b, 3);
      assert.deepEqual((await conn.execute('SELECT ? as c', [4]))[0].c, 4);
    } finally {
      await conn.end();
    }
  }, 10000);

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
