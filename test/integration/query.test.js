//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import Conf from '../conf.js';
import { createConnection, createCallbackConnection, utf8Collation } from '../base.js';

describe.concurrent('basic query', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });
  test('query with value without placeholder', async function () {
    const conn = await createConnection({ debug: true });
    const rows = await conn.query("select '1'", [2]);
    assert.deepEqual(rows, [{ 1: '1' }]);
    await conn.end();
  });

  test('query with null placeholder', async function () {
    let rows = await shareConn.query('select ? as a', [null]);
    assert.deepEqual(rows, [{ a: null }]);
  });

  test('query with null placeholder no array', async function () {
    let rows = await shareConn.query('select ? as a', null);
    assert.deepEqual(rows, [{ a: null }]);
  });

  test('query metaEnumerable', async function () {
    let propertyName;
    let rows = await shareConn.query({ sql: 'select ? as a', metaEnumerable: false }, null);
    assert.equal(rows.meta.length, 1);
    assert.equal(JSON.stringify(rows), '[{"a":null}]');
    assert.deepStrictEqual(rows, [{ a: null }]);
    let nb = 0;
    for (propertyName in rows) {
      nb++;
    }
    assert.equal(nb, 1);

    rows = await shareConn.query({ sql: 'select ? as a', metaEnumerable: true }, null);
    assert.equal(rows.meta.length, 1);

    nb = 0;
    for (propertyName in rows) {
      nb++;
    }
    assert.equal(nb, 2);
  });

  test('parameter last', async () => {
    const value = "'`\\";
    const conn = await createConnection();
    await conn.query('DROP TABLE IF EXISTS parse');
    await conn.query('CREATE TABLE parse(t varchar(128))');
    await conn.beginTransaction();
    await conn.query('INSERT INTO `parse` value (?)', value);
    const res = await conn.query('select * from `parse` where t = ?', value);
    assert.strictEqual(res[0].t, value);
    await conn.end();
  });

  test('namedPlaceholders parameter', async () => {
    const conn = await createConnection({ namedPlaceholders: true });
    await conn.query('DROP TABLE IF EXISTS namedPlaceholders1');
    await conn.query('CREATE TABLE namedPlaceholders1(t varchar(128))');
    await conn.query('START TRANSACTION'); // if MAXSCALE ensure using WRITER
    await conn.query("INSERT INTO `namedPlaceholders1` value ('a'), ('b'), ('c')");
    let res = await conn.query('select * from `namedPlaceholders1` where t IN (:possible)', { possible: ['a', 'c'] });
    assert.deepEqual(res, [{ t: 'a' }, { t: 'c' }]);

    res = await conn.query('select * from `namedPlaceholders1` where t IN (?)', [['b', 'c']]);
    assert.deepEqual(res, [{ t: 'b' }, { t: 'c' }]);

    await conn.end();
  });

  test('namedPlaceholders reuse', async () => {
    const conn = await createConnection({ namedPlaceholders: true });

    let res = await conn.query('select :param2 as a, :param1 as b, :param2 as c', { param1: 2, param2: 3 });
    assert.isTrue(res[0].a === 3 || res[0].a === 3n);
    assert.isTrue(res[0].b === 2 || res[0].b === 2n);
    assert.isTrue(res[0].c === 3 || res[0].c === 3n);

    try {
      await conn.query('select :param2 as a, :param1 as b', { param1: 2, param3: 3 });
      throw new Error('must have throw error');
    } catch (e) {
      assert.isTrue(e.message.includes("Placeholder 'param2' is not defined"));
    }

    res = await conn.query('select :param2 as a, :param1 as b, ? as c, :param2 as d', {
      param1: 2,
      param2: 3,
      param3: 4
    });
    assert.isTrue(res[0].a === 3 || res[0].a === 3n);
    assert.isTrue(res[0].b === 2 || res[0].b === 2n);
    assert.isTrue(res[0].c === 4 || res[0].c === 4n);
    assert.isTrue(res[0].d === 3 || res[0].d === 3n);

    res = await conn.query('select :param3 as a, ? as b, :param1 as c, :param2 as d', {
      param1: 2,
      param2: 3,
      param3: 4
    });
    assert.isTrue(res[0].a === 4 || res[0].a === 4n);
    assert.isTrue(res[0].b === 2 || res[0].b === 2n);
    assert.isTrue(res[0].c === 2 || res[0].c === 2n);
    assert.isTrue(res[0].d === 3 || res[0].d === 3n);

    await conn.end();
  });

  test('promise query stack trace', async function () {
    const conn = await createConnection({ trace: true });
    try {
      await conn.query('wrong query');
    } catch (err) {
      assert.isTrue(err.stack.includes('From event:\n    at ConnectionPromise.query'), err.stack);
      assert.isTrue(err.stack.includes('query.test.js:'), err.stack);
    } finally {
      await conn.end();
    }
  });

  test('query stack trace', async function () {
    await new Promise((resolve, reject) => {
      const conn = createCallbackConnection({ trace: true });
      conn.connect((err) => {
        conn.query('wrong query', (err) => {
          if (!err) {
            reject(Error('must have thrown error !'));
          } else {
            assert.isTrue(err.stack.includes('From event:\n    at ConnectionCallback.query'), err.stack);
            assert.isTrue(err.stack.includes('query.test.js:'), err.stack);
            conn.end(resolve);
          }
        });
      });
    });
  });

  test('query parameter error stack trace', async function () {
    await new Promise((resolve, reject) => {
      const conn = createCallbackConnection({ trace: true });
      conn.connect((err) => {
        conn.query('SELECT ?', [], (err) => {
          if (!err) {
            reject(Error('must have thrown error !'));
          } else {
            assert.isTrue(err.stack.includes('query.test.js:'), err.stack);
            conn.end(resolve);
          }
        });
      });
    });
  });

  test('array parameter', async function () {
    const conn = await createConnection();
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
    await conn.end();
  });

  test('array parameter test', async function () {
    const conn = await createConnection();
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

  test('array parameter with null value', async function () {
    const conn = await createConnection();
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
    await conn.commit();
    await conn.end();
  });

  test('array parameter with null value with parenthesis', async function () {
    const conn = await createConnection({ arrayParenthesis: true });
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
    await conn.commit();
    await conn.end();
  });

  test('permitSetMultiParamEntries set', async () => {
    const jsonValue = { id: 1, val: 'test' };
    const conn = await createConnection({ permitSetMultiParamEntries: true });
    await conn.query('DROP TABLE IF EXISTS setTable');
    await conn.query('CREATE TABLE setTable (id int, val varchar(128))');
    await conn.beginTransaction();
    await conn.query('INSERT INTO setTable SET ?', jsonValue);
    const res = await conn.query('select * from setTable');
    assert.deepEqual(res[0], jsonValue);
    await conn.end();
  });

  test('query with escape values', async function () {
    const conn = await createConnection();
    const rows = await conn.query(
      'select /* \\ ? ` # */ \'\\\\"\\\'?\' as a, \' \' as b, ? as c, "\\\\\'\\"?" as d, " " as e\n' +
        ', ? -- comment \n' +
        '  as f # another comment',
      ['val', 'val2']
    );
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
    await conn.end();
  });

  test('query with end of line comment', async function () {
    const conn = await createConnection();
    const rows = await conn.query("select /* blabla */ '1' -- test comment\n , ?", ['val']);
    assert.deepEqual(rows, [
      {
        1: '1',
        val: 'val'
      }
    ]);
    await conn.end();
  });

  test('query with # end of line comment', async function () {
    const conn = await createConnection();
    const rows = await conn.query("select /* blabla */ '1' # test comment\n , ?", ['val']);
    assert.deepEqual(rows, [
      {
        1: '1',
        val: 'val'
      }
    ]);
    await conn.end();
  });

  test('query warning', async function (ctx) {
    if (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0)) ctx.skip();
    const conn = await createConnection();
    await conn.query("set @@SQL_MODE = 'ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION'");
    await conn.query('DROP TABLE IF EXISTS h');
    await conn.query('create table h (c1 varchar(5))');
    const res = await conn.query("insert into h values ('123456')");
    assert.equal(res.warningStatus, 1);
    await conn.end();
  });

  test('255 columns', async function () {
    let table = 'CREATE TABLE myTable(';
    let insert = 'INSERT INTO myTable VALUES (';
    let expRes = {};
    for (let i = 0; i < 255; i++) {
      if (i !== 0) {
        table += ',';
        insert += ',';
      }
      table += 'i' + i + ' int';
      insert += i;
      expRes['i' + i] = i;
    }
    table += ')';
    insert += ')';

    const conn = await createConnection();
    await conn.query('DROP TABLE IF EXISTS myTable');
    await conn.query(table);
    await conn.beginTransaction();
    await conn.query(insert);
    const res = await conn.query('SELECT * FROM myTable');
    assert.deepEqual(res[0], expRes);
    await conn.end();
  });

  test('escape validation', async ({ skip }) => {
    if (!utf8Collation) return skip();
    await shareConn.query('DROP TABLE IF EXISTS tt1');
    await shareConn.query('CREATE TABLE tt1 (id int, tt varchar(256)) CHARSET utf8mb4');
    await shareConn.beginTransaction();
    await shareConn.query('INSERT INTO tt1 VALUES (?,?)', [1, 'jack\nkमस्']);
    const res = await shareConn.query('SELECT * FROM tt1');
    assert.equal(res[0].tt, 'jack\nkमस्');
    shareConn.commit();
  });

  test('permitSetMultiParamEntries escape ', async function () {
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

    let conn = await createConnection({ permitSetMultiParamEntries: true });
    assert.equal(conn.escape(arr), "`stg`='let\\'g\\'o😊',`bool`=false,`nullVal`=NULL,`fctSt`='bla\\'bla'");
    await conn.end();
    conn = await createConnection({ permitSetMultiParamEntries: false });
    assert.equal(
      conn.escape(arr),
      '\'{\\"stg\\":\\"let\\\'g\\\'o😊\\",\\"bool\\":false,\\"nullVal\\":null,\\"fctSt\\":{}}\''
    );
    await conn.end();
  });

  test('toSqlString escape', async function () {
    const fctStr = new Object();
    fctStr.toSqlString = () => {
      return "bla'bla";
    };
    await shareConn.query('DROP TABLE IF EXISTS toSqlStringesc');
    await shareConn.query('CREATE TABLE toSqlStringesc (id int, tt varchar(256)) CHARSET utf8mb4');
    await shareConn.beginTransaction();
    await shareConn.query('INSERT INTO toSqlStringesc VALUES (?,?)', [1, fctStr]);
    const res = await shareConn.query('SELECT * FROM toSqlStringesc');
    assert.equal(res[0].tt, "bla'bla");
    shareConn.commit();
  });

  test('timeout', async function () {
    const initTime = Date.now();
    const query =
      'select c1.* from information_schema.columns as c1, ' +
      'information_schema.tables, information_schema.tables as t2'; //takes more than 20s
    try {
      await shareConn.query({ sql: query, timeout: 100 });
      throw new Error('must have thrown an error');
    } catch (err) {
      testTimeout(initTime, err);
    }
  }, 20000);

  test('timeout with parameter', async function () {
    const initTime = Date.now();
    const query =
      'select c1.* from information_schema.columns as c1, ' +
      'information_schema.tables, information_schema.tables as t2 WHERE 1 = ?'; //takes more than 20s
    try {
      await shareConn.query({ sql: query, timeout: 100 }, [1]);
      throw new Error('must have thrown an error');
    } catch (err) {
      testTimeout(initTime, err);
    }
  }, 20000);

  const testTimeout = function (initTime, err) {
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
  };
});
