//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import { createConnection } from '../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import Conf from '../conf.js';

describe('Placeholder', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });

  test('query placeholder basic test', async function () {
    const conn = await createConnection({ namedPlaceholders: true });
    const rows = await conn.query('select :param1 as val1, :param3 as val3, :param2 as val2', {
      param3: '30',
      param1: '10',
      param2: '20'
    });
    assert.deepEqual(rows, [{ val1: '10', val3: '30', val2: '20' }]);
    await conn.end();
  });

  test('execute without placeholder', async function () {
    const conn = await createConnection({ namedPlaceholders: true });
    try {
      const rows = await conn.execute('select ? as val1, ? as val3, ? as val2', ['30', '10', '20']);
    } catch (err) {
      if (err.errno === 1835) {
        assert.equal('HY000', err.sqlState);
        assert(!err.fatal);
        assert(
          err.message.includes(
            'Malformed communication packet\n' +
              "sql: select ? as val1, ? as val3, ? as val2 - parameters:{'0':'30','1':'10','2':'20'}"
          )
        );
      } else {
        assert.equal(45017, err.errno);
        assert.equal('HY000', err.sqlState);
        assert(!err.fatal);
        assert(
          err.message.includes(
            'Command expect 3 parameters, but found only 0 named parameters. You probably use question mark in place ' +
              'of named parameters\n' +
              "sql: select ? as val1, ? as val3, ? as val2 - parameters:{'0':'30','1':'10','2':'20'}"
          )
        );
      }
    }
    await conn.end();
  });

  test('query placeholder using option', async function () {
    const rows = await shareConn.query(
      {
        namedPlaceholders: true,
        sql: 'select :param1 as val1, :param3 as val3, :param2 as val2'
      },
      { param3: '30', param1: '10', param2: '20' }
    );
    assert.deepEqual(rows, [{ val1: '10', val3: '30', val2: '20' }]);
  });

  test('query ending by placeholder', async function () {
    const rows = await shareConn.query(
      {
        namedPlaceholders: true,
        sql: 'select :param-1 as val1, :param-3 as val3, :param-2'
      },
      { 'param-3': '30', 'param-1': '10', 'param-2': '20' }
    );
    assert.deepEqual(rows, [{ val1: '10', val3: '30', 20: '20' }]);
  });

  test('query named parameters logged in error', async () => {
    const handleResult = function (err) {
      assert.equal(1146, err.errno);
      assert.equal('42S02', err.sqlState);
      assert(!err.fatal);
      assert(
        err.message.includes(
          'sql: INSERT INTO falseTable(t1, t2, t3, t4, t5) values (:t1, :t2, :t3, :t4, :t5)  ' +
            "- parameters:{'t1':1,'t2':0x01ff,'t3':'hh','t4':'01/01/2001 00:00:00.000','t5':null}"
        )
      );
    };

    const conn = await createConnection({ namedPlaceholders: true });
    try {
      await conn.query('INSERT INTO falseTable(t1, t2, t3, t4, t5) values (:t1, :t2, :t3, :t4, :t5) ', {
        t1: 1,
        t2: Buffer.from([0x01, 0xff]),
        t3: 'hh',
        t4: new Date(2001, 0, 1, 0, 0, 0),
        t5: null
      });
      throw new Error('must have thrown error!');
    } catch (err) {
      handleResult(err);
      await conn.end();
    }
  }, 5000);

  test('query undefined named parameter', async function () {
    const conn = await createConnection({ namedPlaceholders: true });
    await conn.query('DROP TABLE IF EXISTS undefinedParameter');
    await conn.query('CREATE TABLE undefinedParameter (id int, id2 int, id3 int)');
    try {
      await conn.query('INSERT INTO undefinedParameter values (:param3, :param1, :param2)', {
        param1: 1,
        param3: 3,
        param4: 4
      });
      new Error('must have thrown error!');
    } catch (err) {
      assert.equal(err.errno, 45018);
      assert.equal(err.code, 'ER_PLACEHOLDER_UNDEFINED');
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.text, "Placeholder 'param2' is not defined");
      assert.equal(
        err.sql,
        'INSERT INTO undefinedParameter values (:param3, :param1, :param2) ' +
          "- parameters:{'param1':1,'param3':3,'param4':4}"
      );
      assert(!err.fatal);
      assert.ok(
        err.message.includes(
          "Placeholder 'param2' is not defined\n" +
            'sql: INSERT INTO undefinedParameter values (:param3, :param1, :param2) ' +
            "- parameters:{'param1':1,'param3':3,'param4':4}"
        )
      );
      await conn.end();
    }
  });

  test('query missing placeholder parameter', async () => {
    const conn = await createConnection({ namedPlaceholders: true });
    await conn.query('DROP TABLE IF EXISTS execute_missing_parameter');
    await conn.query('CREATE TABLE execute_missing_parameter (id int, id2 int, id3 int)');
    try {
      await conn.query('INSERT INTO execute_missing_parameter values (:t1, :t2, :t3)', {
        t1: 1,
        t3: 3
      });
      throw new Error('must have thrown error!');
    } catch (err) {
      assert.equal(err.errno, 45018);
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.code, 'ER_PLACEHOLDER_UNDEFINED');
      assert(!err.fatal);
      assert.ok(
        err.message.includes(
          "Placeholder 't2' is not defined\n" +
            "sql: INSERT INTO execute_missing_parameter values (:t1, :t2, :t3) - parameters:{'t1':1,'t3':3}"
        )
      );
      await conn.end();
    }
  });

  test('query no placeholder parameter', async () => {
    const conn = await createConnection({ namedPlaceholders: true });
    await conn.query('DROP TABLE IF EXISTS execute_no_parameter');
    await conn.query('CREATE TABLE execute_no_parameter (id int, id2 int, id3 int)');
    try {
      await conn.query('INSERT INTO execute_no_parameter values (:t1, :t2, :t3)', []);
      throw new Error('must have thrown error!');
    } catch (err) {
      assert.equal(err.errno, 45018);
      assert.equal(err.sqlState, 'HY000');
      assert(!err.fatal);
      assert.ok(
        err.message.includes(
          "Placeholder 't1' is not defined\n" +
            'sql: INSERT INTO execute_no_parameter values (:t1, :t2, :t3) - parameters:{}'
        )
      );
      await conn.end();
    }
  });

  test('query to much placeholder parameter', async () => {
    const conn = await createConnection({ namedPlaceholders: true });
    await conn.query('DROP TABLE IF EXISTS to_much_parameters');
    await conn.query('CREATE TABLE to_much_parameters (id int, id2 int, id3 int)');
    await conn.query('INSERT INTO to_much_parameters values (:t2, :t0, :t1)', {
      t0: 0,
      t1: 1,
      t2: 2,
      t3: 3
    });
    await conn.end();
  });

  test('parameter last', async () => {
    const value = "'`\\";
    const conn = await createConnection({ namedPlaceholders: true });
    await conn.query('DROP TABLE IF EXISTS parse');
    await conn.query('CREATE TABLE parse(t varchar(128))');
    await conn.beginTransaction();
    await conn.query('INSERT INTO `parse` value (:val)', { val: value });
    const res = await conn.query('select * from `parse` where t = :val', { val: value });
    assert.strictEqual(res[0].t, value);
    await conn.end();
  });

  test('query with value without placeholder', async () => {
    const conn = await createConnection({ namedPlaceholders: true });
    const rows = await conn.query("select '1'", [2]);
    assert.deepEqual(rows, [{ 1: '1' }]);
    await conn.end();
  });

  test('query with escape values', async () => {
    const conn = await createConnection({ namedPlaceholders: true });
    const rows = await conn.query(
      'select /* \\ :par ` # */ \'\\\\"\\\'?\' as a, \' \' as b, :par as c, "\\\\\'\\"?" as d, " " as e\n' +
        ', :par2  -- comment \n' +
        ' as f # another comment',
      {
        par: 'val',
        par2: 'val2'
      }
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

  test('query with end of line comment', async () => {
    const conn = await createConnection({ namedPlaceholders: true });
    const rows = await conn.query("select /* blabla */ '1' -- test comment\n , :par", {
      par: 'val'
    });
    assert.deepEqual(rows, [
      {
        1: '1',
        val: 'val'
      }
    ]);
    await conn.end();
  });

  test('query with # end of line comment', async () => {
    const conn = await createConnection({ namedPlaceholders: true });
    const rows = await conn.query("select /* blabla */ '1' # test comment\n , :par", {
      par: 'val'
    });
    assert.deepEqual(rows, [
      {
        1: '1',
        val: 'val'
      }
    ]);
    await conn.end();
  });
});
