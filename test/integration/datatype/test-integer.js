'use strict';

const base = require('../../base.js');
const { assert } = require('chai');
const { isXpand } = require('../../base');

describe('integer with big value', () => {
  before(async () => {
    await shareConn.query('DROP TABLE IF EXISTS testBigint');
    await shareConn.query('CREATE TABLE testBigint (v BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY)');
    await shareConn.query('DROP TABLE IF EXISTS floatTest');
    await shareConn.query('CREATE TABLE floatTest (t DOUBLE, t2 DECIMAL(32,16), t3 DECIMAL(32,0))');
  });

  after(async () => {
    await shareConn.query('DROP TABLE IF EXISTS testBigint');
    await shareConn.query('DROP TABLE IF EXISTS floatTest');
  });

  it('int escape', async function () {
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

  it('decimal value without truncation', async function () {
    if (isXpand()) this.skip();
    await shareConn.query(
      'INSERT INTO floatTest VALUES (-0.1, 128.3, 129), (-0.9999237060546875, 9999237060546875.9999237060546875, 9999237060546875)'
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

    const expectedBigNumber = [
      {
        t: -0.1,
        t2: '128.3000000000000000',
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
  });

  it('bigint format', async function () {
    // https://jira.mariadb.org/browse/XPT-290
    if (isXpand()) this.skip();

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
      supportBigNumbers: true,
      bigNumberStrings: true
    });
    assert.strictEqual(rows.insertId, '133');

    rows = await shareConn.execute({
      sql: 'INSERT INTO testBigint values ()',
      supportBigNumbers: true,
      bigNumberStrings: true
    });
    assert.strictEqual(rows.insertId, '134');

    rows = await shareConn.query({ sql: 'INSERT INTO testBigint values (?)', insertIdAsNumber: true }, [
      '9007199254741991'
    ]);
    assert.strictEqual(rows.insertId, 9007199254741991);

    rows = await shareConn.query({ sql: 'INSERT INTO testBigint values (?)', supportBigNumbers: true }, [
      '9007199254741992'
    ]);
    assert.strictEqual(rows.insertId, '9007199254741992');

    rows = await shareConn.query(
      { sql: 'INSERT INTO testBigint values (?)', supportBigNumbers: true, bigNumberStrings: true },
      ['9007199254741993']
    );
    assert.strictEqual(rows.insertId, '9007199254741993');

    rows = await shareConn.execute({ sql: 'INSERT INTO testBigint values (?)', insertIdAsNumber: true }, [
      '9007199254741994'
    ]);
    assert.strictEqual(rows.insertId, 9007199254741994);

    rows = await shareConn.execute({ sql: 'INSERT INTO testBigint values (?)', supportBigNumbers: true }, [
      '9007199254741995'
    ]);
    assert.strictEqual(rows.insertId, '9007199254741995');

    rows = await shareConn.execute(
      { sql: 'INSERT INTO testBigint values (?)', supportBigNumbers: true, bigNumberStrings: true },
      ['9007199254741996']
    );
    assert.strictEqual(rows.insertId, '9007199254741996');

    rows = await shareConn.execute('INSERT INTO testBigint values ()');
    assert.strictEqual(rows.insertId, BigInt('9007199254741997'));
    rows = await shareConn.query('INSERT INTO testBigint values ()');
    assert.strictEqual(rows.insertId, BigInt('9007199254741998'));
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
      { v: 9007199254741991n },
      { v: 9007199254741992n },
      { v: 9007199254741993n },
      { v: 9007199254741994n },
      { v: 9007199254741995n },
      { v: 9007199254741996n },
      { v: 9007199254741997n },
      { v: 9007199254741998n }
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
      { v: 9007199254741991 },
      { v: 9007199254741992 },
      { v: 9007199254741993 },
      { v: 9007199254741994 },
      { v: 9007199254741995 },
      { v: 9007199254741996 },
      { v: 9007199254741997 },
      { v: 9007199254741998 }
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
      { v: '9007199254741991' },
      { v: '9007199254741992' },
      { v: '9007199254741993' },
      { v: '9007199254741994' },
      { v: '9007199254741995' },
      { v: '9007199254741996' },
      { v: '9007199254741997' },
      { v: '9007199254741998' }
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
      { v: '9007199254741991' },
      { v: '9007199254741992' },
      { v: '9007199254741993' },
      { v: '9007199254741994' },
      { v: '9007199254741995' },
      { v: '9007199254741996' },
      { v: '9007199254741997' },
      { v: '9007199254741998' }
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

  it('bigint format null ', async () => {
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
  });

  it('numeric fields conversion to int', async () => {
    await shareConn.query('DROP TABLE IF EXISTS intAllField');
    await shareConn.query(
      'CREATE TABLE intAllField (' +
        't1 TINYINT(1), t2 SMALLINT(1), t3 MEDIUMINT(1), t4 INT(1), t5 BIGINT(1), t6 DECIMAL(1), t7 FLOAT, t8 DOUBLE)'
    );
    await shareConn.query('INSERT INTO intAllField VALUES (null, null, null, null, null, null, null, null)');
    await shareConn.execute('INSERT INTO intAllField VALUES (null, null, null, null, null, null, null, null)');
    await shareConn.query('INSERT INTO intAllField VALUES (0, 0, 0, 0, 0, 0, 0, 0)');
    await shareConn.query('INSERT INTO intAllField VALUES (1, 1, 1, 1, 1, 1, 1, 1)');
    await shareConn.execute('INSERT INTO intAllField VALUES (2, 2, 2, 2, 2, 2, 2, 2)');
    const expected = [
      {
        t1: null,
        t2: null,
        t3: null,
        t4: null,
        t5: null,
        t6: null,
        t7: null,
        t8: null
      },
      {
        t1: null,
        t2: null,
        t3: null,
        t4: null,
        t5: null,
        t6: null,
        t7: null,
        t8: null
      },
      { t1: 0, t2: 0, t3: 0, t4: 0, t5: BigInt('0'), t6: '0', t7: 0, t8: 0 },
      { t1: 1, t2: 1, t3: 1, t4: 1, t5: BigInt('1'), t6: '1', t7: 1, t8: 1 },
      { t1: 2, t2: 2, t3: 2, t4: 2, t5: BigInt('2'), t6: '2', t7: 2, t8: 2 }
    ];
    let res = await shareConn.query('SELECT * FROM intAllField');
    assert.deepEqual(res, expected);
    res = await shareConn.execute('SELECT * FROM intAllField');
    assert.deepEqual(res, expected);
  });

  it('using very big number', async function () {
    const maxValue = BigInt('18446744073709551615');
    const conn = await base.createConnection();
    await conn.query('DROP TABLE IF EXISTS BIG_NUMBER');
    await conn.query('CREATE TABLE BIG_NUMBER (val BIGINT unsigned)');
    await conn.query('INSERT INTO BIG_NUMBER values (?)', [10]);
    await conn.query('INSERT INTO BIG_NUMBER values (?)', [maxValue]);
    await conn.execute('INSERT INTO BIG_NUMBER values (?)', [maxValue]);

    let res = await conn.query('SELECT * FROM BIG_NUMBER WHERE val = ?', [maxValue]);
    const expected = [{ val: maxValue }, { val: maxValue }];
    assert.deepEqual(res, expected);

    res = await conn.execute('SELECT * FROM BIG_NUMBER WHERE val = ?', [maxValue]);
    assert.deepEqual(res, expected);
    conn.end();
  });
});
