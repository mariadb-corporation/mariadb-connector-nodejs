'use strict';

const base = require('../../base.js');
const { assert } = require('chai');

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
    await shareConn.query(
      'INSERT INTO floatTest VALUES (-0.9999237060546875, 9999237060546875.9999237060546875, 9999237060546875)'
    );
    let rows = await shareConn.query(' SELECT * FROM floatTest');
    assert.equal(rows[0].t, -0.9999237060546875);
    assert.equal(rows[0].t2, '9999237060546875.9999237060546875');
    assert.equal(rows[0].t3, '9999237060546875');

    rows = await shareConn.execute(' SELECT * FROM floatTest');
    assert.equal(rows[0].t, -0.9999237060546875);
    assert.equal(rows[0].t2, '9999237060546875.9999237060546875');
    assert.equal(rows[0].t3, '9999237060546875');
  });

  it('bigint format', async () => {
    let rows = await shareConn.query('INSERT INTO testBigint values (127), (128)');
    assert.strictEqual(rows.insertId, BigInt(128));
    rows = await shareConn.query(
      'INSERT INTO testBigint values (-9007199254740991), (9007199254740991)'
    );
    assert.strictEqual(rows.insertId, BigInt('9007199254740991'));
    rows = await shareConn.execute('INSERT INTO testBigint values ()');
    assert.strictEqual(rows.insertId, BigInt('9007199254740992'));
    rows = await shareConn.query('INSERT INTO testBigint values ()');
    assert.strictEqual(rows.insertId, BigInt('9007199254740993'));
    rows = await shareConn.query('SELECT * FROM testBigint');
    assert.strictEqual(rows.length, 6);
    assert.strictEqual(rows[0].v, BigInt('-9007199254740991'));
    assert.strictEqual(rows[1].v, BigInt('127'));
    assert.strictEqual(rows[2].v, BigInt('128'));
    assert.strictEqual(rows[3].v, BigInt('9007199254740991'));
    assert.strictEqual(rows[4].v, BigInt('9007199254740992'));
    assert.strictEqual(rows[5].v, BigInt('9007199254740993'));
    assert.strictEqual(typeof rows[3].v, 'bigint');

    rows = await shareConn.execute('SELECT * FROM testBigint');
    assert.strictEqual(rows.length, 6);
    assert.strictEqual(rows[0].v, BigInt('-9007199254740991'));
    assert.strictEqual(rows[1].v, BigInt('127'));
    assert.strictEqual(rows[2].v, BigInt('128'));
    assert.strictEqual(rows[3].v, BigInt('9007199254740991'));
    assert.strictEqual(rows[4].v, BigInt('9007199254740992'));
    assert.strictEqual(rows[5].v, BigInt('9007199254740993'));
    assert.strictEqual(typeof rows[3].v, 'bigint');

    rows = await shareConn.query({
      bigIntAsNumber: true,
      sql: 'SELECT * FROM testBigint'
    });
    assert.strictEqual(rows.length, 6);
    assert.strictEqual(rows[0].v, -9007199254740991);
    assert.strictEqual(rows[1].v, 127);
    assert.strictEqual(rows[2].v, 128);
    assert.strictEqual(rows[3].v, 9007199254740991);
    assert.strictEqual(rows[4].v, 9007199254740992);
    assert.strictEqual(rows[5].v, 9007199254740993);
    assert.strictEqual(typeof rows[4].v, 'number');

    rows = await shareConn.execute({
      bigIntAsNumber: true,
      sql: 'SELECT * FROM testBigint'
    });
    assert.strictEqual(rows.length, 6);
    assert.strictEqual(rows[0].v, -9007199254740991);
    assert.strictEqual(rows[1].v, 127);
    assert.strictEqual(rows[2].v, 128);
    assert.strictEqual(rows[3].v, 9007199254740991);
    assert.strictEqual(rows[4].v, 9007199254740992);
    assert.strictEqual(rows[5].v, 9007199254740993);
    assert.strictEqual(typeof rows[4].v, 'number');

    const conn2 = await base.createConnection({ insertIdAsNumber: true });
    rows = await conn2.query('INSERT INTO testBigint values ()');
    assert.strictEqual(rows.insertId, 9007199254740994);

    rows = await conn2.execute('INSERT INTO testBigint values ()');
    assert.strictEqual(rows.insertId, 9007199254740995);
    conn2.end();
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
    await shareConn.query(
      'INSERT INTO intAllField VALUES (null, null, null, null, null, null, null, null)'
    );
    await shareConn.execute(
      'INSERT INTO intAllField VALUES (null, null, null, null, null, null, null, null)'
    );
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
