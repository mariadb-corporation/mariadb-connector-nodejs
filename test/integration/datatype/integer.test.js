//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import { createConnection } from '../../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import Conf from '../../conf.js';
describe('integer with big value', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
    await shareConn.query('DROP TABLE IF EXISTS testBigint');
    await shareConn.query('DROP TABLE IF EXISTS testInt');
    await shareConn.query('CREATE TABLE testInt (v INT NOT NULL AUTO_INCREMENT PRIMARY KEY)');
    await shareConn.query('CREATE TABLE testBigint (v BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY)');
    await shareConn.query('DROP TABLE IF EXISTS floatTest');
    await shareConn.query('DROP TABLE IF EXISTS floatTestUnsigned');
    await shareConn.query('CREATE TABLE floatTest (t DOUBLE, t2 DECIMAL(32,16), t3 DECIMAL(32,0))');
    await shareConn.query('CREATE TABLE floatTestUnsigned (t DOUBLE, t2 DECIMAL(32,16), t3 BIGINT(32) UNSIGNED)');
  });
  afterAll(async () => {
    await shareConn.query('DROP TABLE IF EXISTS testBigint');
    await shareConn.query('DROP TABLE IF EXISTS testInt');
    await shareConn.query('DROP TABLE IF EXISTS floatTest');
    await shareConn.query('DROP TABLE IF EXISTS floatTestUnsigned');
    await shareConn.end();
    shareConn = null;
  });

  test('int escape', async function () {
    const buf = 19925;
    assert.equal(shareConn.escape(buf), '19925');
    const maxValue = BigInt('18446744073709551615');
    assert.equal(shareConn.escape(maxValue), '18446744073709551615');

    let rows = await shareConn.query({
      sql: ' SELECT ' + shareConn.escape(buf) + ' t',
      bigIntAsNumber: true
    });
    assert.deepEqual(rows, [{ t: buf }]);
    rows = await shareConn.query(' SELECT ? t', [shareConn.escape(buf)]);
    assert.deepEqual(rows, [{ t: '19925' }]);
    rows = await shareConn.execute(' SELECT ? t', [buf]);
    assert.isTrue(rows[0].t === 19925 || rows[0].t === 19925n);
  });

  test('decimal value without truncation', async function () {
    await shareConn.beginTransaction();
    await shareConn.query(
      'INSERT INTO floatTest VALUES (-0.1, 128.3, 129), (-0.9999237060546875, 9999237060546875.9999237060546875, ' +
        '9999237060546875)'
    );
    const expected = [
      {
        t: -0.1,
        t2: '128.3000000000000000',
        t3: '129'
      },
      { t: -0.9999237060546875, t2: '9999237060546875.9999237060546875', t3: '9999237060546875' }
    ];
    let rows = await shareConn.query(' SELECT * FROM floatTest');
    assert.deepEqual(rows, expected);

    rows = await shareConn.execute(' SELECT * FROM floatTest');
    assert.deepEqual(rows, expected);

    const expectedNumber = [
      {
        t: -0.1,
        t2: 128.3,
        t3: 129
      },
      { t: -0.9999237060546875, t2: 9999237060546875.9999237060546875, t3: 9999237060546875 }
    ];
    rows = await shareConn.query({ sql: 'SELECT * FROM floatTest', decimalAsNumber: true });
    assert.deepEqual(rows, expectedNumber);

    rows = await shareConn.execute({ sql: 'SELECT * FROM floatTest', decimalAsNumber: true });
    assert.deepEqual(rows, expectedNumber);

    const expectedNumberConvert = [
      {
        t: -0.1,
        t2: 128.3,
        t3: 129
      },
      {
        t: -0.9999237060546875,
        t2: '9999237060546875.9999237060546875',
        t3: '9999237060546875'
      }
    ];
    rows = await shareConn.query({ sql: 'SELECT * FROM floatTest', decimalAsNumber: true, supportBigNumbers: true });
    assert.deepEqual(rows, expectedNumberConvert);

    rows = await shareConn.execute({ sql: 'SELECT * FROM floatTest', decimalAsNumber: true, supportBigNumbers: true });
    assert.deepEqual(rows, expectedNumberConvert);

    try {
      await shareConn.query({ sql: 'SELECT * FROM floatTest', decimalAsNumber: true, checkNumberRange: true });
      throw new Error('Expected to have failed');
    } catch (e) {
      assert.isTrue(e.message.includes("value 9999237060546875 can't safely be converted to number"));
    }

    try {
      await shareConn.execute({ sql: 'SELECT * FROM floatTest', decimalAsNumber: true, checkNumberRange: true });
      throw new Error('Expected to have failed');
    } catch (e) {
      assert.isTrue(e.message.includes("value 9999237060546875 can't safely be converted to number"));
    }

    const expectedBigNumber = [
      {
        t: -0.1,
        t2: 128.3,
        t3: 129
      },
      { t: -0.9999237060546875, t2: '9999237060546875.9999237060546875', t3: '9999237060546875' }
    ];
    rows = await shareConn.query({ sql: 'SELECT * FROM floatTest', supportBigNumbers: true });
    assert.deepEqual(rows, expectedBigNumber);

    rows = await shareConn.execute({ sql: 'SELECT * FROM floatTest', supportBigNumbers: true });
    assert.deepEqual(rows, expectedBigNumber);

    const expectedBigNumberString = [
      {
        t: -0.1,
        t2: '128.3000000000000000',
        t3: '129'
      },
      { t: -0.9999237060546875, t2: '9999237060546875.9999237060546875', t3: '9999237060546875' }
    ];
    rows = await shareConn.query({
      sql: 'SELECT * FROM floatTest',
      supportBigNumbers: true,
      bigNumberStrings: true
    });
    assert.deepEqual(rows, expectedBigNumberString);

    rows = await shareConn.execute({
      sql: 'SELECT * FROM floatTest',
      supportBigNumbers: true,
      bigNumberStrings: true
    });
    assert.deepEqual(rows, expectedBigNumberString);
    await shareConn.commit();
  });

  test('decimal value without truncation unsigned', async function () {
    await shareConn.beginTransaction();
    await shareConn.query(
      'INSERT INTO floatTestUnsigned VALUES (0.1, 128.3, 129), (0.9999237060546875, ' +
        '9999237060546875.9999237060546875, 9999237060546875)'
    );
    const expected = [
      {
        t: 0.1,
        t2: '128.3000000000000000',
        t3: 129n
      },
      { t: 0.9999237060546875, t2: '9999237060546875.9999237060546875', t3: 9999237060546875n }
    ];
    let rows = await shareConn.query(' SELECT * FROM floatTestUnsigned');
    assert.deepEqual(rows, expected);

    rows = await shareConn.execute(' SELECT * FROM floatTestUnsigned');
    assert.deepEqual(rows, expected);

    const expectedNumber = [
      {
        t: 0.1,
        t2: 128.3,
        t3: 129n
      },
      { t: 0.9999237060546875, t2: 9999237060546875.9999237060546875, t3: 9999237060546875n }
    ];
    rows = await shareConn.query({ sql: 'SELECT * FROM floatTestUnsigned', decimalAsNumber: true });
    assert.deepEqual(rows, expectedNumber);

    rows = await shareConn.execute({ sql: 'SELECT * FROM floatTestUnsigned', decimalAsNumber: true });
    assert.deepEqual(rows, expectedNumber);

    const expectedBigNumber0 = [
      {
        t: 0.1,
        t2: 128.3,
        t3: 129n
      },
      { t: 0.9999237060546875, t2: 9999237060546876, t3: 9999237060546875n }
    ];

    await shareConn.query({ sql: 'SELECT * FROM floatTestUnsigned', decimalAsNumber: true, checkNumberRange: true });
    assert.deepEqual(rows, expectedBigNumber0);

    await shareConn.execute({ sql: 'SELECT * FROM floatTestUnsigned', decimalAsNumber: true, checkNumberRange: true });
    assert.deepEqual(rows, expectedBigNumber0);

    const expectedBigNumber = [
      {
        t: 0.1,
        t2: 128.3,
        t3: 129
      },
      { t: 0.9999237060546875, t2: '9999237060546875.9999237060546875', t3: '9999237060546875' }
    ];

    rows = await shareConn.query({ sql: 'SELECT * FROM floatTestUnsigned', supportBigNumbers: true });
    assert.deepEqual(rows, expectedBigNumber);

    rows = await shareConn.execute({ sql: 'SELECT * FROM floatTestUnsigned', supportBigNumbers: true });
    assert.deepEqual(rows, expectedBigNumber);

    const expectedBigNumberString = [
      {
        t: 0.1,
        t2: '128.3000000000000000',
        t3: '129'
      },
      { t: 0.9999237060546875, t2: '9999237060546875.9999237060546875', t3: '9999237060546875' }
    ];
    rows = await shareConn.query({
      sql: 'SELECT * FROM floatTestUnsigned',
      supportBigNumbers: true,
      bigNumberStrings: true
    });
    assert.deepEqual(rows, expectedBigNumberString);

    rows = await shareConn.execute({
      sql: 'SELECT * FROM floatTestUnsigned',
      supportBigNumbers: true,
      bigNumberStrings: true
    });
    assert.deepEqual(rows, expectedBigNumberString);
    await shareConn.commit();
  });

  test('int format', async function () {
    await shareConn.beginTransaction();
    await shareConn.query('INSERT INTO testInt values (127), (128)');
    const rows = await shareConn.query('SELECT * FROM testInt');
    assert.deepEqual(rows, [{ v: 127 }, { v: 128 }]);

    const rows2 = await shareConn.execute('SELECT * FROM testInt');
    assert.deepEqual(rows2, [{ v: 127 }, { v: 128 }]);
    await shareConn.commit();
  });

  test('bigint format', async function () {
    await shareConn.beginTransaction();
    let rows = await shareConn.query('INSERT INTO testBigint values (127), (128)');
    assert.strictEqual(rows.insertId, BigInt(128));

    rows = await shareConn.query({
      sql: 'INSERT INTO testBigint values ()',
      insertIdAsNumber: true
    });
    assert.strictEqual(rows.insertId, 129);

    rows = await shareConn.execute({
      sql: 'INSERT INTO testBigint values ()',
      insertIdAsNumber: true
    });
    assert.strictEqual(rows.insertId, 130);

    rows = await shareConn.query({
      sql: 'INSERT INTO testBigint values ()',
      supportBigNumbers: true
    });
    assert.strictEqual(rows.insertId, 131);

    rows = await shareConn.execute({
      sql: 'INSERT INTO testBigint values ()',
      supportBigNumbers: true
    });
    assert.strictEqual(rows.insertId, 132);

    rows = await shareConn.query({
      sql: 'INSERT INTO testBigint values ()',
      insertIdAsNumber: true,
      checkNumberRange: true
    });
    assert.strictEqual(rows.insertId, 133);

    rows = await shareConn.execute({
      sql: 'INSERT INTO testBigint values ()',
      insertIdAsNumber: true,
      checkNumberRange: true
    });
    assert.strictEqual(rows.insertId, 134);

    rows = await shareConn.query({
      sql: 'INSERT INTO testBigint values ()',
      supportBigNumbers: true,
      bigNumberStrings: true
    });
    assert.strictEqual(rows.insertId, '135');

    rows = await shareConn.execute({
      sql: 'INSERT INTO testBigint values ()',
      supportBigNumbers: true,
      bigNumberStrings: true
    });
    assert.strictEqual(rows.insertId, '136');

    rows = await shareConn.query({ sql: 'INSERT INTO testBigint values (?)', insertIdAsNumber: true }, [
      '9007199254741990'
    ]);
    assert.strictEqual(rows.insertId, 9007199254741990);

    rows = await shareConn.execute({ sql: 'INSERT INTO testBigint values (?)', insertIdAsNumber: true }, [
      '9007199254741991'
    ]);
    assert.strictEqual(rows.insertId, 9007199254741991);

    rows = await shareConn.query({ sql: 'INSERT INTO testBigint values ()', insertIdAsNumber: true });
    assert.strictEqual(rows.insertId, 9007199254741992);

    rows = await shareConn.execute({ sql: 'INSERT INTO testBigint values ()', insertIdAsNumber: true });
    assert.strictEqual(rows.insertId, 9007199254741993);

    try {
      await shareConn.query({
        sql: 'INSERT INTO testBigint values ()',
        insertIdAsNumber: true,
        checkNumberRange: true
      });
      throw new Error('Expected to have failed');
    } catch (e) {
      assert.isTrue(e.message.includes("last insert id value 9007199254741994 can't safely be converted to number"));
    }

    try {
      await shareConn.execute({
        sql: 'INSERT INTO testBigint values ()',
        insertIdAsNumber: true,
        checkNumberRange: true
      });
      throw new Error('Expected to have failed');
    } catch (e) {
      assert.isTrue(e.message.includes("last insert id value 9007199254741995 can't safely be converted to number"));
    }

    rows = await shareConn.query({ sql: 'INSERT INTO testBigint values ()', supportBigNumbers: true });
    assert.strictEqual(rows.insertId, '9007199254741996');

    rows = await shareConn.execute({ sql: 'INSERT INTO testBigint values ()', supportBigNumbers: true });
    assert.strictEqual(rows.insertId, '9007199254741997');

    rows = await shareConn.query({
      sql: 'INSERT INTO testBigint values ()',
      supportBigNumbers: true,
      bigNumberStrings: true
    });
    assert.strictEqual(rows.insertId, '9007199254741998');

    rows = await shareConn.execute({ sql: 'INSERT INTO testBigint values ()', insertIdAsNumber: true });
    assert.strictEqual(rows.insertId, 9007199254741999);

    rows = await shareConn.execute({ sql: 'INSERT INTO testBigint values ()', supportBigNumbers: true });
    assert.strictEqual(rows.insertId, '9007199254742000');

    rows = await shareConn.execute({
      sql: 'INSERT INTO testBigint values ()',
      supportBigNumbers: true,
      bigNumberStrings: true
    });
    assert.strictEqual(rows.insertId, '9007199254742001');

    rows = await shareConn.execute('INSERT INTO testBigint values ()');
    assert.strictEqual(rows.insertId, BigInt('9007199254742002'));
    rows = await shareConn.query('INSERT INTO testBigint values ()');
    assert.strictEqual(rows.insertId, BigInt('9007199254742003'));
    rows = await shareConn.query('INSERT INTO testBigint values (?)', [-9007199254741998n]);
    rows = await shareConn.query('SELECT * FROM testBigint order by v');
    const expected = [
      { v: -9007199254741998n },
      { v: 127n },
      { v: 128n },
      { v: 129n },
      { v: 130n },
      { v: 131n },
      { v: 132n },
      { v: 133n },
      { v: 134n },
      { v: 135n },
      { v: 136n },
      { v: 9007199254741990n },
      { v: 9007199254741991n },
      { v: 9007199254741992n },
      { v: 9007199254741993n },
      { v: 9007199254741994n },
      { v: 9007199254741995n },
      { v: 9007199254741996n },
      { v: 9007199254741997n },
      { v: 9007199254741998n },
      { v: 9007199254741999n },
      { v: 9007199254742000n },
      { v: 9007199254742001n },
      { v: 9007199254742002n },
      { v: 9007199254742003n }
    ];
    assert.deepEqual(rows, expected);

    rows = await shareConn.execute('SELECT * FROM testBigint order by v ');
    assert.deepEqual(rows, expected);

    const expectedNumber = [
      { v: -9007199254741998 },
      { v: 127 },
      { v: 128 },
      { v: 129 },
      { v: 130 },
      { v: 131 },
      { v: 132 },
      { v: 133 },
      { v: 134 },
      { v: 135 },
      { v: 136 },
      { v: 9007199254741990 },
      { v: 9007199254741991 },
      { v: 9007199254741992 },
      { v: 9007199254741993 },
      { v: 9007199254741994 },
      { v: 9007199254741995 },
      { v: 9007199254741996 },
      { v: 9007199254741997 },
      { v: 9007199254741998 },
      { v: 9007199254741999 },
      { v: 9007199254742000 },
      { v: 9007199254742001 },
      { v: 9007199254742002 },
      { v: 9007199254742003 }
    ];
    rows = await shareConn.query({
      bigIntAsNumber: true,
      sql: 'SELECT * FROM testBigint order by v'
    });
    assert.deepEqual(rows, expectedNumber);

    rows = await shareConn.execute({
      bigIntAsNumber: true,
      sql: 'SELECT * FROM testBigint order by v'
    });
    assert.deepEqual(rows, expectedNumber);

    try {
      await shareConn.query({
        bigIntAsNumber: true,
        checkNumberRange: true,
        sql: 'SELECT * FROM testBigint order by v'
      });
    } catch (e) {
      assert.isTrue(e.message.includes("value -9007199254741998 can't safely be converted to number"));
    }

    try {
      await shareConn.execute({
        bigIntAsNumber: true,
        checkNumberRange: true,
        sql: 'SELECT * FROM testBigint order by v'
      });
    } catch (e) {
      assert.isTrue(e.message.includes("value -9007199254741998 can't safely be converted to number"));
    }

    const expectedNumberSupportBig = [
      { v: '-9007199254741998' },
      { v: 127 },
      { v: 128 },
      { v: 129 },
      { v: 130 },
      { v: 131 },
      { v: 132 },
      { v: 133 },
      { v: 134 },
      { v: 135 },
      { v: 136 },
      { v: '9007199254741990' },
      { v: '9007199254741991' },
      { v: '9007199254741992' },
      { v: '9007199254741993' },
      { v: '9007199254741994' },
      { v: '9007199254741995' },
      { v: '9007199254741996' },
      { v: '9007199254741997' },
      { v: '9007199254741998' },
      { v: '9007199254741999' },
      { v: '9007199254742000' },
      { v: '9007199254742001' },
      { v: '9007199254742002' },
      { v: '9007199254742003' }
    ];
    rows = await shareConn.query({
      supportBigNumbers: true,
      sql: 'SELECT * FROM testBigint order by v'
    });
    assert.deepEqual(rows, expectedNumberSupportBig);

    rows = await shareConn.execute({
      supportBigNumbers: true,
      sql: 'SELECT * FROM testBigint order by v'
    });
    assert.deepEqual(rows, expectedNumberSupportBig);

    const expectedNumberSupportBigString = [
      { v: '-9007199254741998' },
      { v: '127' },
      { v: '128' },
      { v: '129' },
      { v: '130' },
      { v: '131' },
      { v: '132' },
      { v: '133' },
      { v: '134' },
      { v: '135' },
      { v: '136' },
      { v: '9007199254741990' },
      { v: '9007199254741991' },
      { v: '9007199254741992' },
      { v: '9007199254741993' },
      { v: '9007199254741994' },
      { v: '9007199254741995' },
      { v: '9007199254741996' },
      { v: '9007199254741997' },
      { v: '9007199254741998' },
      { v: '9007199254741999' },
      { v: '9007199254742000' },
      { v: '9007199254742001' },
      { v: '9007199254742002' },
      { v: '9007199254742003' }
    ];
    rows = await shareConn.query({
      supportBigNumbers: true,
      bigNumberStrings: true,
      sql: 'SELECT * FROM testBigint'
    });
    assert.deepEqual(rows, expectedNumberSupportBigString);

    rows = await shareConn.execute({
      supportBigNumbers: true,
      bigNumberStrings: true,
      sql: 'SELECT * FROM testBigint'
    });
    assert.deepEqual(rows, expectedNumberSupportBigString);
  });

  test('bigint format null ', async () => {
    await shareConn.query('DROP TABLE IF EXISTS testBigintNull');
    await shareConn.query('CREATE TABLE testBigintNull (v BIGINT)');
    await shareConn.query('INSERT INTO testBigintNull values (?)', [BigInt(127)]);
    await shareConn.query('INSERT INTO testBigintNull values (?)', [null]);
    await shareConn.execute('INSERT INTO testBigintNull values (?)', [BigInt(129)]);
    await shareConn.execute('INSERT INTO testBigintNull values (?)', [null]);

    let rows = await shareConn.query('SELECT * FROM testBigintNull');
    assert.strictEqual(rows.length, 4);
    assert.strictEqual(rows[0].v, BigInt(127));
    assert.strictEqual(rows[1].v, null);
    assert.strictEqual(rows[2].v, BigInt(129));
    assert.strictEqual(rows[3].v, null);

    rows = await shareConn.query({ bigIntAsNumber: true, sql: 'SELECT * FROM testBigintNull' });
    assert.strictEqual(rows.length, 4);
    assert.strictEqual(rows[0].v, 127);
    assert.strictEqual(rows[1].v, null);
    assert.strictEqual(rows[2].v, 129);
    assert.strictEqual(rows[3].v, null);

    rows = await shareConn.query({ bigIntAsNumber: true, checkNumberRange: true, sql: 'SELECT * FROM testBigintNull' });
    assert.strictEqual(rows.length, 4);
    assert.strictEqual(rows[0].v, 127);
    assert.strictEqual(rows[1].v, null);
    assert.strictEqual(rows[2].v, 129);
    assert.strictEqual(rows[3].v, null);

    rows = await shareConn.execute('SELECT * FROM testBigintNull');
    assert.strictEqual(rows.length, 4);
    assert.strictEqual(rows[0].v, BigInt(127));
    assert.strictEqual(rows[1].v, null);
    assert.strictEqual(rows[2].v, BigInt(129));
    assert.strictEqual(rows[3].v, null);

    rows = await shareConn.execute({ bigIntAsNumber: true, sql: 'SELECT * FROM testBigintNull' });
    assert.strictEqual(rows.length, 4);
    assert.strictEqual(rows[0].v, 127);
    assert.strictEqual(rows[1].v, null);
    assert.strictEqual(rows[2].v, 129);
    assert.strictEqual(rows[3].v, null);

    rows = await shareConn.execute({
      bigIntAsNumber: true,
      checkNumberRange: true,
      sql: 'SELECT * FROM testBigintNull'
    });
    assert.strictEqual(rows.length, 4);
    assert.strictEqual(rows[0].v, 127);
    assert.strictEqual(rows[1].v, null);
    assert.strictEqual(rows[2].v, 129);
    assert.strictEqual(rows[3].v, null);
    await shareConn.commit();
  });

  test('numeric fields conversion to int', async () => {
    await shareConn.query('DROP TABLE IF EXISTS intAllField');
    await shareConn.query(
      'CREATE TABLE intAllField (' +
        't1 TINYINT(1), t2 SMALLINT(1), t3 MEDIUMINT(1), t4 MEDIUMINT(1) UNSIGNED, t5 INT(1), t6 BIGINT(1), ' +
        't7 DECIMAL(1), t8 FLOAT, t9 DOUBLE)'
    );
    await shareConn.beginTransaction();
    await shareConn.query('INSERT INTO intAllField VALUES (null, null, null, null, null, null, null, null, null)');
    await shareConn.execute('INSERT INTO intAllField VALUES (null, null, null, null, null, null, null, null, null)');
    await shareConn.query('INSERT INTO intAllField VALUES (0, 0, 0, 0, 0, 0, 0, 0, 0)');
    await shareConn.query('INSERT INTO intAllField VALUES (1, 1, 1, 1, 1, 1, 1, 1, 1)');
    await shareConn.execute('INSERT INTO intAllField VALUES (2, 2, 2, 2, 2, 2, 2, 2, 2)');
    const expected = [
      {
        t1: null,
        t2: null,
        t3: null,
        t4: null,
        t5: null,
        t6: null,
        t7: null,
        t8: null,
        t9: null
      },
      {
        t1: null,
        t2: null,
        t3: null,
        t4: null,
        t5: null,
        t6: null,
        t7: null,
        t8: null,
        t9: null
      },
      { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: BigInt('0'), t7: '0', t8: 0, t9: 0 },
      { t1: 1, t2: 1, t3: 1, t4: 1, t5: 1, t6: BigInt('1'), t7: '1', t8: 1, t9: 1 },
      { t1: 2, t2: 2, t3: 2, t4: 2, t5: 2, t6: BigInt('2'), t7: '2', t8: 2, t9: 2 }
    ];
    let res = await shareConn.query('SELECT * FROM intAllField');
    assert.deepEqual(res, expected);
    res = await shareConn.execute('SELECT * FROM intAllField');
    assert.deepEqual(res, expected);
    await shareConn.commit();
  });

  test('using very big number', async function () {
    const maxValue = BigInt('18446744073709551615');
    const conn = await createConnection();
    await conn.query('DROP TABLE IF EXISTS BIG_NUMBER');
    await conn.query('CREATE TABLE BIG_NUMBER (val BIGINT unsigned)');
    await conn.beginTransaction();
    await conn.query('INSERT INTO BIG_NUMBER values (?)', [10]);
    await conn.query('INSERT INTO BIG_NUMBER values (?)', [maxValue]);
    await conn.execute('INSERT INTO BIG_NUMBER values (?)', [maxValue]);

    const expected = [{ val: maxValue }, { val: maxValue }];

    let res = await conn.query('SELECT * FROM BIG_NUMBER WHERE val = ?', [maxValue]);
    assert.deepEqual(res, expected);

    res = await conn.execute('SELECT * FROM BIG_NUMBER WHERE val = ?', [maxValue]);
    assert.deepEqual(res, expected);

    try {
      await conn.query(
        {
          sql: 'SELECT * FROM BIG_NUMBER WHERE val = ?',
          decimalAsNumber: true,
          bigIntAsNumber: true,
          checkNumberRange: true
        },
        [maxValue]
      );
      throw new Error('Expected to have failed');
    } catch (e) {
      assert.isTrue(e.message.includes("value 18446744073709551615 can't safely be converted to number"));
    }

    try {
      await conn.execute(
        {
          sql: 'SELECT * FROM BIG_NUMBER WHERE val = ?',
          decimalAsNumber: true,
          bigIntAsNumber: true,
          checkNumberRange: true
        },
        [maxValue]
      );
      throw new Error('Expected to have failed');
    } catch (e) {
      assert.isTrue(e.message.includes("value 18446744073709551615 can't safely be converted to number"));
    }

    conn.end();
  });
});
