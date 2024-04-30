//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

const base = require('../base.js');
const { assert } = require('chai');

describe('Big query', function () {
  const testSize = 16 * 1024 * 1024 + 800; // more than one packet
  let maxAllowedSize, buf;

  before(async function () {
    const row = await shareConn.query('SELECT @@max_allowed_packet as t');
    maxAllowedSize = Number(row[0].t);
    if (testSize < maxAllowedSize + 100) {
      buf = Buffer.alloc(testSize);
      for (let i = 0; i < testSize; i++) {
        buf[i] = 97 + (i % 10);
      }
    }
  });

  it('parameter bigger than 16M packet size', async function () {
    if (maxAllowedSize <= testSize) this.skip();
    this.timeout(30000); //can take some time
    await testParameterBiggerThan16M(shareConn);
    const con = await base.createConnection({ bulk: false });
    await testParameterBiggerThan16M(con);
    await con.end();
  });

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
          "insert into bigParameterBigParam(b) values(?) - parameters:[['test'],[0x6162636465666768696a6162636465666768696a6162636465666768696a6162636465666768696a6162636465666768696a6162636465666768696a6162636465666768696a6162636465666768696a6162636465666768696a6162..."
        ) ||
          e.sql.includes(
            'insert into bigParameterBigParam(b) values(?) - parameters:[0x6162636465666768696a6162636465666768696a6162636465666768696a6162636465666768696a6162636465666768696a6162636465666768696a6162636465666768696a6162636465666768696a6162636465666768696a61626364656667...'
          )
      );
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

  it('int8 buffer overflow', async function () {
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
    conn.end();
  });

  it('buffer growing', async function () {
    if (maxAllowedSize <= 11 * 1024 * 1024) this.skip();
    this.timeout(10000); //can take some time
    const conn = await base.createConnection({ compress: true });
    await bufferGrowing(conn);
  });

  it('buffer growing compression', async function () {
    if (maxAllowedSize <= 11 * 1024 * 1024) this.skip();
    this.timeout(10000); //can take some time
    const conn = await base.createConnection({ compress: true });
    await bufferGrowing(conn);
  });

  async function bufferGrowing(conn) {
    const st = Buffer.alloc(65536, '0').toString();
    const st2 = Buffer.alloc(1048576, '0').toString();
    const params = [st];
    let sql = 'CREATE TABLE bigParameter (a0 MEDIUMTEXT ';
    let sqlInsert = 'insert into bigParameter values (?';
    for (let i = 1; i < 10; i++) {
      sql += ',a' + i + ' MEDIUMTEXT ';
      sqlInsert += ',?';
      params.push(i < 4 ? st : st2);
    }
    sql += ')';
    sqlInsert += ')';
    conn.query('DROP TABLE IF EXISTS bigParameter');
    conn.query(sql);
    await conn.query('FLUSH TABLES');
    conn.beginTransaction();
    await conn.beginTransaction();
    conn.query(sqlInsert, params);
    const rows = await conn.query('SELECT * from bigParameter');
    for (let i = 0; i < 10; i++) {
      assert.deepEqual(rows[0]['a' + i], params[i]);
    }
    conn.end();
  }

  it('parameter bigger than maxAllowedPacket must end bulk', async function () {
    if (maxAllowedSize > 11 * 1024 * 1024) this.skip();
    if (!shareConn.info.isMariaDB()) this.skip();

    this.timeout(30000); //can take some time
    const conn = await base.createConnection({ maxAllowedPacket: maxAllowedSize});
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
  });

  it('bunch parameter bigger than 16M', async function () {
    if (maxAllowedSize < 32 * 1024 * 1024) this.skip();
    if (!shareConn.info.isMariaDB()) this.skip();

    this.timeout(60000); //can take some time
    const mb = 1024 * 1024;
    await sendBigParamBunch(10 * mb, 10 * mb);
    await sendBigParamBunch(10 * mb, 20 * mb);
    await sendBigParamBunch(20 * mb, 10 * mb);
    if (maxAllowedSize < 40 * 1024 * 1024) {
      await sendBigParamBunch(33 * mb, 20 * mb);
    }
  });

  async function sendBigParamBunch(firstLen, secondLen) {
    const conn = await base.createConnection({ maxAllowedSize: maxAllowedSize });
    conn.query('DROP TABLE IF EXISTS bigParameter2');
    conn.query('CREATE TABLE bigParameter2 (a longtext, b longtext)');
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
      await conn.batch('insert into bigParameter2(a,b) values(?, ?)', [
        [param1, param2],
        ['q2', 's2'],
        [param1, 's3']
      ]);
      const rows = await conn.query('SELECT * from bigParameter2');

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
