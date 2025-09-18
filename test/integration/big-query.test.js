//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import * as base from '../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import { createConnection } from '../base.js';
import Conf from '../conf.js';

describe.concurrent('Big query', function () {
  const testSize = 16 * 1024 * 1024 + 800; // more than one packet
  let maxAllowedSize, buf;
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
    const row = await shareConn.query('SELECT @@max_allowed_packet as t');
    maxAllowedSize = Number(row[0].t);
    if (testSize < maxAllowedSize + 100) {
      buf = Buffer.alloc(testSize);
      for (let i = 0; i < testSize; i++) {
        buf[i] = 97 + (i % 10);
      }
    }
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });

  test('parameter bigger than 16M packet size', async ({ skip }) => {
    if (maxAllowedSize <= testSize) return skip();
    await testParameterBiggerThan16M(shareConn);
    const con = await base.createConnection({ bulk: false });
    await testParameterBiggerThan16M(con);
    await con.end();
  }, 30000);

  const testParameterBiggerThan16M = async function (conn) {
    conn.query('DROP TABLE IF EXISTS bigParameterBigParam');
    conn.query('CREATE TABLE bigParameterBigParam (b longblob)');
    await conn.query('FLUSH TABLES');

    conn.beginTransaction();
    conn.query('insert into bigParameterBigParam(b) values(?)', [buf]);
    const rows = await conn.query('SELECT * from bigParameterBigParam');
    assert.deepEqual(rows[0].b, buf);
    conn.rollback();

    conn.beginTransaction();
    await conn.batch('insert into bigParameterBigParam(b) values(?)', [['test'], [buf], ['test2']]);
    const rows2 = await conn.query('SELECT * from bigParameterBigParam');
    assert.deepEqual(rows2[0].b, Buffer.from('test'));
    assert.deepEqual(rows2[1].b, buf);
    assert.deepEqual(rows2[2].b, Buffer.from('test2'));
    conn.rollback();

    conn.query(`insert into bigParameterBigParam(b) /*${buf.toString()}*/ values(?)`, ['a']);

    await conn.query('DROP TABLE IF EXISTS bigParameterBigParam');
    await conn.query('CREATE TABLE bigParameterBigParam (b tinyblob)');
    await conn.query('FLUSH TABLES');

    await conn.beginTransaction();
    try {
      await conn.batch('insert into bigParameterBigParam(b) values(?)', [['test'], [buf], ['test2']]);
      throw Error('must have thrown error');
    } catch (e) {
      assert.isTrue(
        e.sql.includes(
          'insert into bigParameterBigParam(b) values(?) ' +
            "- parameters:[['test'],[0x6162636465666768696a6162636465666768696a6162636465666768696a6162636465666" +
            '768696a6162636465666768696a6162636465666768696a6162636465666768696a6162636465666768696a61626364656667' +
            '68696a6162...'
        ) ||
          e.sql.includes(
            'insert into bigParameterBigParam(b) values(?) ' +
              '- parameters:[0x6162636465666768696a6162636465666768696a6162636465666768696a6162636465666768696a6' +
              '162636465666768696a6162636465666768696a6162636465666768696a6162636465666768696a616263646566676869' +
              '6a61626364656667...'
          )
      , 'message was :' + e.sql);
    }

    try {
      await conn.batch({ sql: 'insert into bigParameterBigParam(b) values(?)', debugLen: 12 }, [
        ['test'],
        [buf],
        ['test2']
      ]);
      throw Error('must have thrown error');
    } catch (e) {
      assert.isTrue(e.sql.includes('insert into ...'));
    }

    conn.rollback();
  };

  test('int8 buffer overflow', async ({ skip }) => {
    const buf = Buffer.alloc(979, '0');
    const conn = await base.createConnection({ collation: 'latin1_swedish_ci' });
    conn.query('DROP TABLE IF EXISTS bigParameterInt8');
    conn.query('CREATE TABLE bigParameterInt8 (a varchar(1024), b varchar(10))');
    await conn.query('FLUSH TABLE');
    await conn.beginTransaction();
    await conn.query('insert into bigParameterInt8 values(?, ?)', [buf.toString(), 'test']);
    const rows = await conn.query('SELECT * from bigParameterInt8');
    assert.deepEqual(rows[0].a, buf.toString());
    assert.deepEqual(rows[0].b, 'test');
    await conn.end();
  });

  test('buffer growing', async ({ skip }) => {
    if (maxAllowedSize <= 11 * 1024 * 1024) return skip();
    const conn = await base.createConnection({ compress: true });
    await bufferGrowing(conn, 'growbigParameter2');
  }, 10000);

  test('buffer growing compression', async ({ skip }) => {
    if (maxAllowedSize <= 11 * 1024 * 1024) return skip();
    const conn = await base.createConnection({ compress: true });
    await bufferGrowing(conn, 'growbigParameter1');
  }, 10000);

  async function bufferGrowing(conn, tableName) {
    const st = Buffer.alloc(65536, '0').toString();
    const st2 = Buffer.alloc(1048576, '0').toString();
    const params = [st];
    await conn.query('DROP TABLE IF EXISTS ' + tableName);
    let sql = 'CREATE TABLE ' + tableName + ' (a0 MEDIUMTEXT ';
    let sqlInsert = 'insert into ' + tableName + ' values (?';
    for (let i = 1; i < 10; i++) {
      sql += ',a' + i + ' MEDIUMTEXT ';
      sqlInsert += ',?';
      params.push(i < 4 ? st : st2);
    }
    sql += ')';
    sqlInsert += ')';
    conn.query('DROP TABLE IF EXISTS ' + tableName);
    conn.query(sql);
    await conn.query('FLUSH TABLES');
    conn.beginTransaction();
    await conn.beginTransaction();
    conn.query(sqlInsert, params);
    const rows = await conn.query('SELECT * from ' + tableName);
    for (let i = 0; i < 10; i++) {
      assert.deepEqual(rows[0]['a' + i], params[i]);
    }
    await conn.end();
  }

  test('parameter bigger than maxAllowedPacket must end bulk', async ({ skip }) => {
    if (maxAllowedSize > 11 * 1024 * 1024) return skip();
    if (!shareConn.info.isMariaDB()) return skip();

    const conn = await base.createConnection({ maxAllowedPacket: maxAllowedSize });
    conn.query('DROP TABLE IF EXISTS bigParameterError');
    conn.query('CREATE TABLE bigParameterError (b longblob)');
    await conn.query('FLUSH TABLES');

    try {
      conn.beginTransaction();
      const param = Buffer.alloc(maxAllowedSize / 2, '0').toString();
      await conn.batch('insert into bigParameterError(b) values(?)', [[param], ['b'], [param]]);
    } finally {
      await conn.end();
    }

    const conn2 = await base.createConnection();
    try {
      const param = Buffer.alloc(maxAllowedSize, '0').toString();
      await conn2.batch('insert into bigParameterError(b) values(?)', [[param], ['b'], [param]]);
      throw new Error('must have thrown an error');
    } catch (err) {
      assert.equal(err.code, 'ECONNRESET');
    } finally {
      await conn2.end();
    }
  }, 30000);

  test('bunch parameter bigger than 16M', async ({ skip }) => {
    if (maxAllowedSize < 32 * 1024 * 1024) return skip();
    if (!shareConn.info.isMariaDB()) return skip();

    const mb = 1024 * 1024;
    await sendBigParamBunch(mb, mb);
    await sendBigParamBunch(10 * mb, 10 * mb);
    await sendBigParamBunch(10 * mb, 20 * mb);
    await sendBigParamBunch(16 * mb - 50, 35);
    await sendBigParamBunch(20 * mb, 10 * mb);
    if (maxAllowedSize > 40 * 1024 * 1024) {
      await sendBigParamBunch(33 * mb, 20 * mb);
    }
  }, 60000);

  test('Bulk 16M packet size', async ({ skip }) => {
    if (maxAllowedSize > 16 * 1024 * 1024) return skip();
    let conn = null;
    try {
      conn = await base.createConnection({ maxAllowedPacket: maxAllowedSize });
      conn.query('DROP TABLE IF EXISTS bigParameter3');
      conn.query('CREATE TABLE bigParameter3 (a longtext)');
      await conn.query('FLUSH TABLES');
      const param1 = Buffer.alloc(maxAllowedSize - 16, 'a').toString();
      await conn.batch('insert into bigParameter3(a) values(?)', [['q'], [param1], ['b']]);
    } finally {
      await conn.end();
    }
  });

  function deepCompare(arg1, arg2) {
    if (Object.prototype.toString.call(arg1) === Object.prototype.toString.call(arg2)) {
      if (
        Object.prototype.toString.call(arg1) === '[object Object]' ||
        Object.prototype.toString.call(arg1) === '[object Array]'
      ) {
        if (Object.keys(arg1).length !== Object.keys(arg2).length) {
          return false;
        }
        return Object.keys(arg1).every(function (key) {
          return deepCompare(arg1[key], arg2[key]);
        });
      }
      return arg1 === arg2;
    }
    return false;
  }

  async function sendBigParamBunch(firstLen, secondLen) {
    const conn = await base.createConnection({ maxAllowedSize: maxAllowedSize });
    conn.query('DROP TABLE IF EXISTS bigParameter2');
    conn.query('CREATE TABLE bigParameter2 (id int not null primary key auto_increment, a longtext, b longtext)');
    await conn.query('FLUSH TABLES');
    try {
      conn.beginTransaction();
      const param1 = Buffer.alloc(firstLen, 'a').toString();
      const param2 = Buffer.alloc(secondLen, 'c').toString();
      await conn.batch('insert into bigParameter2(a,b) values(?, ?)', [
        ['q', 's'],
        [param1, param2],
        ['b', 'n']
      ]);
      const res = await conn.batch({ sql: 'insert into bigParameter2(a,b) values(?, ?)', fullResult: true }, [
        [param1, param2],
        ['q2', 's2'],
        [param1, 's3']
      ]);

      assert.isOk(
        deepCompare(res, [
          {
            affectedRows: 1,
            insertId: 4n,
            warningStatus: 0
          },
          {
            affectedRows: 1,
            insertId: 5n,
            warningStatus: 0
          },
          {
            affectedRows: 1,
            insertId: 6n,
            warningStatus: 0
          }
        ]) ||
          deepCompare(res, [
            {
              affectedRows: 1,
              insertId: 5n,
              warningStatus: 0
            },
            {
              affectedRows: 1,
              insertId: 6n,
              warningStatus: 0
            },
            {
              affectedRows: 1,
              insertId: 7n,
              warningStatus: 0
            }
          ]) ||
          deepCompare(res, [
            {
              affectedRows: 1,
              insertId: 5n,
              warningStatus: 0
            },
            {
              affectedRows: 1,
              insertId: 6n,
              warningStatus: 0
            },
            {
              affectedRows: 1,
              insertId: 8n,
              warningStatus: 0
            }
          ]),
        res
      );
      const rows = await conn.query('SELECT a,b from bigParameter2');

      assert.deepEqual(rows[0], { a: 'q', b: 's' });
      assert.deepEqual(rows[1], {
        a: param1,
        b: param2
      });
      assert.deepEqual(rows[2], { a: 'b', b: 'n' });
      assert.deepEqual(rows[3], {
        a: param1,
        b: param2
      });
      assert.deepEqual(rows[4], { a: 'q2', b: 's2' });
      assert.deepEqual(rows[5], {
        a: param1,
        b: 's3'
      });
    } finally {
      await conn.end();
    }
  }
});
