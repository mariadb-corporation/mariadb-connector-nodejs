//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import base, { createConnection } from '../../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import Conf from '../../conf.js';
describe.concurrent('float', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
    await shareConn.query('DROP TABLE IF EXISTS testBigfloat');
    await shareConn.query('DROP TABLE IF EXISTS testBigfloat2');
    await shareConn.query('CREATE TABLE testBigfloat (a FLOAT, b DOUBLE)');
    await shareConn.query('CREATE TABLE testBigfloat2 (a FLOAT, b DOUBLE)');
  });
  afterAll(async () => {
    await shareConn.query('DROP TABLE IF EXISTS testBigfloat');
    await shareConn.query('DROP TABLE IF EXISTS testBigfloat2');
    await shareConn.end();
    shareConn = null;
  });

  test('float escape', async function () {
    const buf = 19925.1;
    assert.equal(shareConn.escape(buf), '19925.1');
    const conn = await createConnection({ decimalAsNumber: true });

    const rows = await conn.query(' SELECT ' + shareConn.escape(buf) + ' t');
    assert.deepEqual(rows, [{ t: buf }]);
    conn.end();
  });

  test('bigint format', async () => {
    await shareConn.beginTransaction();
    await shareConn.query(
      'INSERT INTO testBigfloat values (-127.1, -128.2), (19925.0991, 900719925.4740991), (null, null)'
    );
    const rows = await shareConn.query('SELECT * FROM testBigfloat');
    assert.equal(rows.length, 3);
    assert.equal(rows[0].a, -127.1);
    assert.equal(rows[0].b, -128.2);
    assert.equal(rows[1].a, 19925.1);
    assert.equal(rows[1].b, 900719925.4740991);
    assert.equal(rows[2].a, null);
    assert.equal(rows[2].b, null);
    await shareConn.commit();
  });

  test('bigint format exec', async () => {
    await shareConn.beginTransaction();
    await shareConn.query(
      'INSERT INTO testBigfloat2 values (-127.1, -128.2), (19925.0991, 900719925.4740991), (null, null)'
    );
    const rows = await shareConn.execute('SELECT * FROM testBigfloat2');
    assert.equal(rows.length, 3);
    assert.closeTo(rows[0].a, -127.1, 0.1);
    assert.equal(rows[0].b, -128.2);
    assert.closeTo(rows[1].a, 19925.1, 0.1);
    assert.equal(rows[1].b, 900719925.4740991);
    assert.equal(rows[2].a, null);
    assert.equal(rows[2].b, null);
    await shareConn.commit();
  });
});
