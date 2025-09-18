//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import * as base from '../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';

describe.concurrent('Compression', function () {
  const testSize = 16 * 1024 * 1024 + 800; // more than one packet
  let maxAllowedSize, buf, randomBuf;
  let conn;

  beforeAll(async () => {
    conn = await base.createConnection({ compress: true, multipleStatements: true });
    const rows = await conn.query('SELECT @@max_allowed_packet as t');
    maxAllowedSize = Number(rows[0].t);
    if (testSize < maxAllowedSize) {
      buf = Buffer.alloc(testSize);
      randomBuf = Buffer.alloc(testSize);
      for (let i = 0; i < buf.length; i++) {
        buf[i] = 97 + (i % 10);
        randomBuf[i] = Math.floor(Math.random() * 255);
      }
    }
  });

  afterAll(async () => {
    await conn.end();
    conn = null;
  });

  const generateLongText = function (len) {
    let t = '';
    for (let i = 0; i < len; i++) {
      t += 'a';
    }
    return t;
  };

  test('test compression multiple packet', async ({ skip }) => {
    if (maxAllowedSize < 35000000) return skip();

    conn.query('CREATE TEMPORARY TABLE compressTab (t1 LONGTEXT, t2 LONGTEXT, t3 LONGTEXT, t4 LONGTEXT)');

    const longText = generateLongText(20000000);
    const mediumText = generateLongText(10000000);
    const smallIntText = generateLongText(60000);
    await conn.query('INSERT INTO compressTab values (?,?,?,?)', [longText, mediumText, smallIntText, 'expected']);
  }, 60000);

  test('simple select 1', async () => {
    const rows = await conn.query("SELECT '1'");
    assert.deepEqual(rows, [{ 1: '1' }]);
  });

  test('connection.ping()', async () => {
    let compressCon = await base.createConnection({ compress: true, multipleStatements: true });
    compressCon.ping();
    await compressCon.ping();
    try {
      await compressCon.ping(-2);
      throw new Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.message.includes('Ping cannot have negative timeout value'));
    }
    await compressCon.ping(200);

    compressCon.query('SELECT SLEEP(1)');
    const initTime = Date.now();

    try {
      await compressCon.ping(200);
      throw new Error('must have thrown error after ' + (Date.now() - initTime));
    } catch (err) {
      assert.isTrue(
        Date.now() - initTime > 195,
        'expected > 195, without waiting for SLEEP to finish, but was ' + (Date.now() - initTime)
      );
      assert.isTrue(err.message.includes('Ping timeout'));
      assert.isFalse(compressCon.isValid());
    } finally {
      await compressCon.end();
    }
  });

  test('multiple packet result (multiple rows)', async ({ skip }) => {
    //using sequence engine
    if (!conn.info.isMariaDB() || !conn.info.hasMinVersion(10, 1)) return skip();
    const rows = await conn.query("select '1'; DO 1;select '2'");
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], [{ 1: '1' }]);
    assert.deepEqual(rows[1], {
      affectedRows: 0,
      insertId: 0n,
      warningStatus: 0
    });
    assert.deepEqual(rows[2], [{ 2: '2' }]);
  });

  test('parameter bigger than 16M packet size', async ({ skip }) => {
    if (maxAllowedSize <= testSize) return skip();
    conn.query('DROP TABLE IF EXISTS comp_bigParameter');
    conn.query('CREATE TABLE comp_bigParameter (b longblob)');
    await conn.query('FLUSH TABLES');
    await conn.beginTransaction();
    conn.query('insert into comp_bigParameter(b) values(?)', [buf]);
    const rows = await conn.query('SELECT * from comp_bigParameter');
    assert.deepEqual(rows[0].b, buf);
    conn.query('DROP TABLE IF EXISTS comp_bigParameter');
  }, 20000);

  test('multi compression packet size', async ({ skip }) => {
    if (maxAllowedSize <= testSize) return skip();
    conn.query('DROP TABLE IF EXISTS comp_bigParameter2');
    conn.query('CREATE TABLE comp_bigParameter2 (b longblob)');
    await conn.query('FLUSH TABLES');
    await conn.beginTransaction();
    conn.query('insert into comp_bigParameter2(b) values(?)', [randomBuf]);
    const rows = await conn.query('SELECT * from comp_bigParameter2');
    assert.deepEqual(rows[0].b, randomBuf);
    conn.query('DROP TABLE IF EXISTS comp_bigParameter2');
  }, 20000);
});
