//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

const base = require('../base.js');
const { assert } = require('chai');

describe('basic query', () => {
  it('query with value without placeholder', function (done) {
    base
      .createConnection()
      .then((conn) => {
        conn
          .query("select '1'", [2])
          .then((rows) => {
            assert.deepEqual(rows, [{ 1: '1' }]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('query with null placeholder', async function () {
    let rows = await shareConn.query('select ? as a', [null]);
    assert.deepEqual(rows, [{ a: null }]);
  });

  it('query with null placeholder no array', async function () {
    let rows = await shareConn.query('select ? as a', null);
    assert.deepEqual(rows, [{ a: null }]);
  });

  it('query metaEnumerable', async function () {
    let rows = await shareConn.query({ sql: 'select ? as a', metaEnumerable: false }, null);
    assert.equal(rows.meta.length, 1);
    assert.equal(JSON.stringify(rows), '[{"a":null}]');
    assert.deepStrictEqual(rows, [{ a: null }]);
    let nb = 0;
    for (var propertyName in rows) {
      nb++;
    }
    assert.equal(nb, 1);

    rows = await shareConn.query({ sql: 'select ? as a', metaEnumerable: true }, null);
    assert.equal(rows.meta.length, 1);

    nb = 0;
    for (var propertyName in rows) {
      nb++;
    }
    assert.equal(nb, 2);
  });

  it('parameter last', async () => {
    const value = "'`\\";
    const conn = await base.createConnection();
    await conn.query('DROP TABLE IF EXISTS parse');
    await conn.query('CREATE TABLE parse(t varchar(128))');
    await conn.beginTransaction();
    await conn.query('INSERT INTO `parse` value (?)', value);
    const res = await conn.query('select * from `parse` where t = ?', value);
    assert.strictEqual(res[0].t, value);
    conn.end();
  });

  it('namedPlaceholders parameter', async () => {
    const conn = await base.createConnection({ namedPlaceholders: true });
    await conn.query('DROP TABLE IF EXISTS namedPlaceholders1');
    await conn.query('CREATE TABLE namedPlaceholders1(t varchar(128))');
    await conn.query('START TRANSACTION'); // if MAXSCALE ensure using WRITER
    await conn.query("INSERT INTO `namedPlaceholders1` value ('a'), ('b'), ('c')");
    const res = await conn.query('select * from `namedPlaceholders1` where t IN (:possible)', { possible: ['a', 'c'] });
    assert.deepEqual(res, [{ t: 'a' }, { t: 'c' }]);
    conn.end();
  });

  it('query stack trace', function (done) {
    const conn = base.createCallbackConnection({ trace: true });
    conn.connect((err) => {
      conn.query('wrong query', (err) => {
        if (!err) {
          done(Error('must have thrown error !'));
        } else {
          assert.isTrue(err.stack.includes('test-query.js:'), err.stack);
          conn.end();
          done();
        }
      });
    });
  });

  it('query parameter error stack trace', function (done) {
    const conn = base.createCallbackConnection({ trace: true });
    conn.connect((err) => {
      conn.query('SELECT ?', [], (err) => {
        if (!err) {
          done(Error('must have thrown error !'));
        } else {
          assert.isTrue(err.stack.includes('test-query.js:'), err.stack);
          conn.end();
          done();
        }
      });
    });
  });

  it('array parameter', async function () {
    const conn = await base.createConnection();
    await conn.query('DROP TABLE IF EXISTS arrayParam');
    await conn.query('CREATE TABLE arrayParam (id int, val varchar(10))');
    await conn.beginTransaction();
    await conn.query("INSERT INTO arrayParam VALUES (1, 'a'), (2, 'b'), (3, 'c'), (4, 'd')");
    const rows = await conn.query('SELECT * FROM arrayParam WHERE val IN (?)', [['b', 'c', '1']]);
    assert.deepEqual(rows, [
      {
        id: 2,
        val: 'b'
      },
      {
        id: 3,
        val: 'c'
      }
    ]);
    conn.end();
  });

  it('array parameter test', async function () {
    const conn = await base.createConnection();
    await conn.query('DROP TABLE IF EXISTS testArrayParameter');
    await conn.query('CREATE TABLE testArrayParameter (val1 int, val2 int)');
    await conn.query('START TRANSACTION'); // if MAXSCALE ensure using WRITER
    await conn.query('INSERT INTO testArrayParameter VALUES (1,1), (1,2), (1,3), (2,2)');
    const query = 'SELECT * FROM testArrayParameter WHERE val1 = ? AND val2 IN (?)';
    const res = await conn.query(query, [1, [1, 3]]);
    assert.deepEqual(res, [
      {
        val1: 1,
        val2: 1
      },
      {
        val1: 1,
        val2: 3
      }
    ]);
    await conn.end();
  });

  it('array parameter with null value', async function () {
    const conn = await base.createConnection();
    await conn.query('DROP TABLE IF EXISTS arrayParamNull');
    await conn.query('CREATE TABLE arrayParamNull (id int, val varchar(10))');
    await conn.beginTransaction();
    await conn.query('INSERT INTO arrayParamNull VALUES (?)', [[1, null]]);
    await conn.query('INSERT INTO arrayParamNull VALUES (?)', [[2, 'a']]);
    const rows = await conn.query('SELECT * FROM arrayParamNull');
    assert.deepEqual(rows, [
      {
        id: 1,
        val: null
      },
      {
        id: 2,
        val: 'a'
      }
    ]);
    conn.end();
  });

  it('array parameter with null value with parenthesis', async function () {
    const conn = await base.createConnection({ arrayParenthesis: true });
    await conn.query('DROP TABLE IF EXISTS arrayParamNullParen');
    await conn.query('CREATE TABLE arrayParamNullParen (id int, val varchar(10))');
    await conn.beginTransaction();
    await conn.query('INSERT INTO arrayParamNullParen VALUES ?', [[1, null]]);
    await conn.query('INSERT INTO arrayParamNullParen VALUES ?', [[2, 'a']]);
    const rows = await conn.query('SELECT * FROM arrayParamNullParen');
    assert.deepEqual(rows, [
      {
        id: 1,
        val: null
      },
      {
        id: 2,
        val: 'a'
      }
    ]);
    conn.end();
  });

  it('permitSetMultiParamEntries set', async () => {
    const jsonValue = { id: 1, val: 'test' };
    const conn = await base.createConnection({ permitSetMultiParamEntries: true });
    await conn.query('DROP TABLE IF EXISTS setTable');
    await conn.query('CREATE TABLE setTable (id int, val varchar(128))');
    await conn.beginTransaction();
    await conn.query('INSERT INTO setTable SET ?', jsonValue);
    const res = await conn.query('select * from setTable');
    assert.deepEqual(res[0], jsonValue);
    conn.end();
  });

  it('query with escape values', function (done) {
    base
      .createConnection()
      .then((conn) => {
        conn
          .query(
            'select /* \\ ? ` # */ \'\\\\"\\\'?\' as a, \' \' as b, ? as c, "\\\\\'\\"?" as d, " " as e\n' +
              ', ? -- comment \n' +
              '  as f # another comment',
            ['val', 'val2']
          )
          .then((rows) => {
            assert.deepEqual(rows, [
              {
                a: '\\"\'?',
                b: ' ',
                c: 'val',
                d: '\\\'"?',
                e: ' ',
                f: 'val2'
              }
            ]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('query with end of line comment', function (done) {
    base
      .createConnection()
      .then((conn) => {
        conn
          .query("select /* blabla */ '1' -- test comment\n , ?", ['val'])
          .then((rows) => {
            assert.deepEqual(rows, [
              {
                1: '1',
                val: 'val'
              }
            ]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('query with # end of line comment', function (done) {
    base
      .createConnection()
      .then((conn) => {
        conn
          .query("select /* blabla */ '1' # test comment\n , ?", ['val'])
          .then((rows) => {
            assert.deepEqual(rows, [
              {
                1: '1',
                val: 'val'
              }
            ]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('query warning', function (done) {
    //mysql 8 force truncation as error, even with SQL_MODE disable it.
    if (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0)) this.skip();
    base
      .createConnection()
      .then((conn) => {
        conn
          .query("set @@SQL_MODE = 'ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION'")
          .then(() => {
            return conn.query('DROP TABLE IF EXISTS h');
          })
          .then(() => {
            return conn.query('create table h (c1 varchar(5))');
          })
          .then(() => {
            return conn.query("insert into h values ('123456')");
          })
          .then((res) => {
            assert.equal(res.warningStatus, 1);
            conn.end();
            done();
          })
          .catch((err) => {
            conn.end();
            done(err);
          });
      })
      .catch(done);
  });

  it('255 columns', async function () {
    let table = 'CREATE TABLE myTable(';
    let insert = 'INSERT INTO myTable VALUES (';
    let expRes = {};
    for (let i = 0; i < 255; i++) {
      if (i != 0) {
        table += ',';
        insert += ',';
      }
      table += 'i' + i + ' int';
      insert += i;
      expRes['i' + i] = i;
    }
    table += ')';
    insert += ')';

    const conn = await base.createConnection();
    await conn.query('DROP TABLE IF EXISTS myTable');
    await conn.query(table);
    await conn.beginTransaction();
    await conn.query(insert);
    const res = await conn.query('SELECT * FROM myTable');
    assert.deepEqual(res[0], expRes);
    conn.end();
  });

  it('escape validation', async function () {
    if (!base.utf8Collation()) this.skip();
    await shareConn.query('DROP TABLE IF EXISTS tt1');
    await shareConn.query('CREATE TABLE tt1 (id int, tt varchar(256)) CHARSET utf8mb4');
    await shareConn.beginTransaction();
    await shareConn.query('INSERT INTO tt1 VALUES (?,?)', [1, 'jack\nkमस्']);
    const res = await shareConn.query('SELECT * FROM tt1');
    assert.equal(res[0].tt, 'jack\nkमस्');
    shareConn.commit;
  });

  it('permitSetMultiParamEntries escape ', function (done) {
    const fctStr = new Object();
    fctStr.toSqlString = () => {
      return "bla'bla";
    };
    const arr = {
      stg: "let'g'o😊",
      bool: false,
      nullVal: null,
      fctSt: fctStr
    };

    base.createConnection({ permitSetMultiParamEntries: true }).then((conn) => {
      assert.equal(conn.escape(arr), "`stg`='let\\'g\\'o😊',`bool`=false,`nullVal`=NULL,`fctSt`='bla\\'bla'");
      conn.end();
      base.createConnection({ permitSetMultiParamEntries: false }).then((conn2) => {
        assert.equal(
          conn2.escape(arr),
          '\'{\\"stg\\":\\"let\\\'g\\\'o😊\\",\\"bool\\":false,\\"nullVal\\":null,\\"fctSt\\":{}}\''
        );
        conn2.end();
        done();
      });
    });
  });

  it('toSqlString escape', async function () {
    const fctStr = new Object();
    fctStr.toSqlString = () => {
      return "bla'bla";
    };
    await shareConn.query('DROP TABLE IF EXISTS tt1');
    await shareConn.query('CREATE TABLE tt1 (id int, tt varchar(256)) CHARSET utf8mb4');
    await shareConn.beginTransaction();
    await shareConn.query('INSERT INTO tt1 VALUES (?,?)', [1, fctStr]);
    const res = await shareConn.query('SELECT * FROM tt1');
    assert.equal(res[0].tt, "bla'bla");
    shareConn.commit;
  });

  it('timeout', function (done) {
    this.timeout(20000);
    const initTime = Date.now();
    const query =
      'select c1.* from information_schema.columns as c1, ' +
      'information_schema.tables, information_schema.tables as t2'; //takes more than 20s
    shareConn
      .query({ sql: query, timeout: 100 })
      .then((res) => {
        done(new Error('must have thrown an error'));
      })
      .catch(testTimeout.bind(this, done, initTime));
  });

  it('timeout with parameter', function (done) {
    this.timeout(20000);
    const initTime = Date.now();
    const query =
      'select c1.* from information_schema.columns as c1, ' +
      'information_schema.tables, information_schema.tables as t2 WHERE 1 = ?'; //takes more than 20s
    shareConn
      .query({ sql: query, timeout: 100 }, [1])
      .then((res) => {
        done(new Error('must have thrown an error'));
      })
      .catch(testTimeout.bind(this, done, initTime));
  });

  const testTimeout = (done, initTime, err) => {
    if (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 1, 2)) {
      const elapse = Date.now() - initTime;
      assert.isOk(elapse < 10000, 'elapse time was ' + elapse + ' but must be less around 100');
      assert.isTrue(err.message.includes('Query execution was interrupted (max_statement_time exceeded)'));
      assert.equal(err.errno, 1969);
      assert.equal(err.sqlState, 70100);
      assert.equal(err.code, 'ER_STATEMENT_TIMEOUT');
    } else {
      if (shareConn.info.isMariaDB()) {
        assert.isTrue(err.message.includes('Cannot use timeout for MariaDB server before 10.1.2. timeout value:'));
      } else {
        assert.isTrue(err.message.includes('Cannot use timeout for MySQL server. timeout value:'));
      }
      assert.equal(err.errno, 45038);
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.code, 'ER_TIMEOUT_NOT_SUPPORTED');
    }
    done();
  };
});
