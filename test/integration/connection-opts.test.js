//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import { getEnv, createConnection, isMaxscale } from '../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import Conf from '../conf.js';

describe.sequential('connection option', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });
  test('with undefined collation', async () => {
    try {
      await createConnection({ charset: 'unknown' });
      throw new Error('must have thrown error');
    } catch (err) {
      assert(err.message.includes('Unknown'));
    }
  });

  test('collation with no id', async ({ skip }) => {
    if (getEnv('DB_TYPE') === 'enterprise') return skip();
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(11, 2, 0)) return skip();
    const conn = await createConnection();
    await conn.query('set NAMES utf8mb4 COLLATE uca1400_vietnamese_ai_ci');
    await conn.end();
  });

  test('wrong IANA timezone', async () => {
    try {
      await createConnection({ timezone: 'unknown' });
      throw new Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.message.includes("setting timezone 'unknown' fails on server."));
      assert.equal(err.errno, 45033);
      assert.equal(err.sqlState, '08S01');
      assert.equal(err.code, 'ER_WRONG_IANA_TIMEZONE');
    }
  });

  test('ensure Etc/GMT', async function () {
    let conn = await createConnection({ timezone: 'Etc/GMT-8' });
    let res = await conn.query('SELECT @@time_zone as t');
    assert.equal(res[0].t, '+08:00');
    await conn.end();

    conn = await createConnection({ timezone: 'GMT-8' });
    res = await conn.query('SELECT @@time_zone as t');
    assert.equal(res[0].t, '-08:00');
    await conn.end();
  });

  test('automatic timezone', async ({ skip }) => {
    if (getEnv('local') === undefined || getEnv('local') === '0') return skip();
    const conn = await createConnection({ timezone: 'auto' });
    await conn.end();
  });

  test.sequential('timezone Z', async ({ skip }) => {
    if (!process) return skip();
    // node.js before v13 doesn't permit setting TZ value repeatedly
    if (parseInt(process.versions.node.split('.')[0]) <= 12) return skip();

    const defaultTz = getEnv('TZ');
    const conn = await createConnection({ timezone: 'Z' });
    conn.query("SET SESSION time_zone = '+01:00'");
    process.env.TZ = 'Etc/GMT-1';
    let res = await conn.query('SELECT UNIX_TIMESTAMP(?) tt', [new Date('2000-01-01T00:00:00Z')]);
    // = 1999-12-31T23:00:00.000Z
    assert.deepEqual(Number(res[0].tt), 946684800);
    res = await conn.query("SELECT TIMESTAMP('2003-12-31 12:00:00') tt1, FROM_UNIXTIME(UNIX_TIMESTAMP(?)) tt2", [
      new Date('2000-01-01T00:00:00Z')
    ]);
    assert.deepEqual(res[0].tt1.toISOString(), '2003-12-31T11:00:00.000Z');
    assert.deepEqual(res[0].tt2.toISOString(), '2000-01-01T00:00:00.000Z');
    await conn.end();
    process.env.TZ = defaultTz;
  });

  test('timezone +0h', async function () {
    const conn = await createConnection({ timezone: '+00:00' });

    let d = new Date('2000-01-01T00:00:00Z');
    let res = await conn.query("SELECT UNIX_TIMESTAMP('2000-01-01T00:00:00') tt", [d]);
    assert.equal(Number(res[0].tt), d.getTime() / 1000);
    await conn.end();
  });

  test.sequential('timezone +10h00', async ({ skip }) => {
    if (!process) return;
    // node.js before v13 doesn't permit setting TZ value repeatedly
    if (parseInt(process.versions.node.split('.')[0]) <= 12) return skip();

    const defaultTz = getEnv('TZ');
    const conn = await createConnection({ timezone: '+10:00' });
    process.env.TZ = 'Etc/GMT-10';
    let res = await conn.query('SELECT UNIX_TIMESTAMP(?) tt', [new Date('2000-01-01T00:00:00Z')]);
    assert.deepEqual(Number(res[0].tt), 946684800);
    res = await conn.query("SELECT TIMESTAMP('2003-12-31 12:00:00') tt1, FROM_UNIXTIME(UNIX_TIMESTAMP(?)) tt2", [
      new Date('2000-01-01T00:00:00Z')
    ]);
    assert.deepEqual(res[0].tt1.toISOString(), '2003-12-31T02:00:00.000Z');
    assert.deepEqual(res[0].tt2.toISOString(), '2000-01-01T00:00:00.000Z');
    await conn.end();
    process.env.TZ = defaultTz;
  });

  test.sequential('timezone Etc/GMT-10', async ({ skip }) => {
    if (!process) return skip();
    // node.js before v13 doesn't permit setting TZ value repeatedly
    if (parseInt(process.versions.node.split('.')[0]) <= 12) return skip();

    const defaultTz = getEnv('TZ');
    const conn = await createConnection({ timezone: 'Etc/GMT-10' });
    process.env.TZ = 'Etc/GMT-10';
    let res = await conn.query('SELECT UNIX_TIMESTAMP(?) tt', [new Date('2000-01-01T00:00:00Z')]);
    assert.deepEqual(Number(res[0].tt), 946684800);
    res = await conn.query("SELECT TIMESTAMP('2003-12-31 12:00:00') tt1, FROM_UNIXTIME(UNIX_TIMESTAMP(?)) tt2", [
      new Date('2000-01-01T00:00:00Z')
    ]);
    assert.deepEqual(res[0].tt1.toISOString(), '2003-12-31T02:00:00.000Z');
    assert.deepEqual(res[0].tt2.toISOString(), '2000-01-01T00:00:00.000Z');
    conn.end();
    process.env.TZ = defaultTz;
  });

  test.sequential('timezone GMT+10', async ({ skip }) => {
    if (!process) return skip();
    // node.js before v13 doesn't permit setting TZ value repeatedly
    if (parseInt(process.versions.node.split('.')[0]) <= 12) return skip();

    const defaultTz = getEnv('TZ');
    const conn = await createConnection({ timezone: 'GMT+10' });
    process.env.TZ = 'Etc/GMT-10';
    let res = await conn.query('SELECT UNIX_TIMESTAMP(?) tt', [new Date('2000-01-01T00:00:00Z')]);
    assert.deepEqual(Number(res[0].tt), 946684800);
    res = await conn.query("SELECT TIMESTAMP('2003-12-31 12:00:00') tt1, FROM_UNIXTIME(UNIX_TIMESTAMP(?)) tt2", [
      new Date('2000-01-01T00:00:00Z')
    ]);
    assert.deepEqual(res[0].tt1.toISOString(), '2003-12-31T02:00:00.000Z');
    assert.deepEqual(res[0].tt2.toISOString(), '2000-01-01T00:00:00.000Z');
    await conn.end();
    process.env.TZ = defaultTz;
  });

  test('wrong timezone format', async () => {
    try {
      await createConnection({ timezone: '+e:00' });
      throw new Error('Must have thrown exception');
    } catch (err) {
      assert.isTrue(err.message.includes("setting timezone '+e:00' fails on server"));
      assert.equal(err.errno, 45033);
      assert.equal(err.sqlState, '08S01');
      assert.equal(err.code, 'ER_WRONG_IANA_TIMEZONE');
    }
  });

  test.sequential('Server with different tz', async ({ skip }) => {
    if (!process) return skip();
    // node.js before v13 doesn't permit setting TZ value repeatedly
    if (parseInt(process.versions.node.split('.')[0]) <= 12) return skip();
    if (isMaxscale(shareConn)) return skip();
    //MySQL 5.5 doesn't have milliseconds
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) return skip();

    const defaultTz = getEnv('TZ');
    const conn = await createConnection({ timezone: 'Etc/GMT+5' });
    process.env.TZ = 'Etc/GMT+5';
    const now = new Date();
    conn.query('DROP TABLE IF EXISTS t1');
    conn.query('CREATE TABLE t1 (a timestamp(6))');
    await conn.query('FLUSH TABLES');
    conn.query('INSERT INTO t1 values (?)', now);
    const res = await conn.query('SELECT NOW() as b, t1.a FROM t1');
    assert.deepEqual(res[0].a, now);
    assert.isOk(Math.abs(res[0].b.getTime() - now.getTime()) < 5000);
    conn.end();
    process.env.TZ = defaultTz;
  });

  test('nestTables results boolean', async function () {
    const conn = await createConnection({ nestTables: true });
    await conn.query('DROP TABLE IF EXISTS t1');
    await conn.query('DROP TABLE IF EXISTS t2');
    await conn.query('CREATE TABLE t1 (a varchar(20))');
    await conn.query('CREATE TABLE t2 (b varchar(20))');
    await conn.query('FLUSH TABLES');
    await conn.beginTransaction();
    await conn.query("INSERT INTO t1 VALUES ('bla'), ('bla2')");
    await conn.query("INSERT INTO t2 VALUES ('bou')");
    const rows = await conn.query('SELECT * FROM t1, t2');
    assert.deepEqual(rows, [
      { t1: { a: 'bla' }, t2: { b: 'bou' } },
      { t1: { a: 'bla2' }, t2: { b: 'bou' } }
    ]);
    await conn.end();
  });

  test('nestTables results string', async function () {
    const conn = await createConnection({ nestTables: '_' });
    await conn.query('DROP TABLE IF EXISTS t1');
    await conn.query('DROP TABLE IF EXISTS t2');
    await conn.query('CREATE TABLE t1 (a varchar(20))');
    await conn.query('CREATE TABLE t2 (b varchar(20))');
    await conn.query('FLUSH TABLES');
    await conn.beginTransaction();
    await conn.query("INSERT INTO t1 VALUES ('bla'), ('bla2')");
    await conn.query("INSERT INTO t2 VALUES ('bou')");
    const rows = await conn.query('SELECT * FROM t1, t2');
    assert.deepEqual(rows, [
      { t1_a: 'bla', t2_b: 'bou' },
      { t1_a: 'bla2', t2_b: 'bou' }
    ]);
    await conn.end();
  });

  test('rows as array', async function () {
    const conn = await createConnection({ rowsAsArray: true });
    await conn.query('DROP TABLE IF EXISTS t1');
    await conn.query('DROP TABLE IF EXISTS t2');
    await conn.query('CREATE TABLE t1 (a varchar(20))');
    await conn.query('CREATE TABLE t2 (b varchar(20))');
    await conn.query('FLUSH TABLES');
    await conn.beginTransaction();
    await conn.query("INSERT INTO t1 VALUES ('bla'), ('bla2')");
    await conn.query("INSERT INTO t2 VALUES ('bou')");
    const rows = await conn.query('SELECT * FROM t1, t2');
    assert.deepEqual(rows, [
      ['bla', 'bou'],
      ['bla2', 'bou']
    ]);
    await conn.end();
  });

  test('query option rows as array', async function () {
    const conn = await createConnection();
    await conn.query('DROP TABLE IF EXISTS t1');
    await conn.query('DROP TABLE IF EXISTS t2');
    await conn.query('CREATE TABLE t1 (a varchar(20))');
    await conn.query('CREATE TABLE t2 (b varchar(20))');
    await conn.query('FLUSH TABLES');
    await conn.beginTransaction();
    await conn.query("INSERT INTO t1 VALUES ('bla'), ('bla2')");
    await conn.query("INSERT INTO t2 VALUES ('bou')");
    const rows = await conn.query({ rowsAsArray: true, sql: 'SELECT * FROM t1, t2' });
    assert.deepEqual(rows, [
      ['bla', 'bou'],
      ['bla2', 'bou']
    ]);
    await conn.end();
  });

  test('nestTables results query boolean', async function () {
    const conn = await createConnection();
    await conn.query('DROP TABLE IF EXISTS t1');
    await conn.query('DROP TABLE IF EXISTS t2');
    await conn.query('CREATE TABLE t1 (a varchar(20))');
    await conn.query('CREATE TABLE t2 (b varchar(20))');
    await conn.query('FLUSH TABLES');
    await conn.beginTransaction();
    await conn.query("INSERT INTO t1 VALUES ('bla'), ('bla2')");
    await conn.query("INSERT INTO t2 VALUES ('bou')");
    const rows = await conn.query({ nestTables: true, sql: 'SELECT * FROM t1, t2' });
    assert.deepEqual(rows, [
      { t1: { a: 'bla' }, t2: { b: 'bou' } },
      { t1: { a: 'bla2' }, t2: { b: 'bou' } }
    ]);
    await conn.end();
  });

  test('nestTables results query string', async function () {
    const conn = await createConnection();
    await conn.query('DROP TABLE IF EXISTS t1');
    await conn.query('DROP TABLE IF EXISTS t2');
    await conn.query('CREATE TABLE t1 (a varchar(20))');
    await conn.query('CREATE TABLE t2 (b varchar(20))');
    await conn.query('FLUSH TABLES');
    await conn.beginTransaction();
    await conn.query("INSERT INTO t1 VALUES ('bla'), ('bla2')");
    await conn.query("INSERT INTO t2 VALUES ('bou')");
    const rows = await conn.query({ nestTables: '_', sql: 'SELECT * FROM t1, t2' });
    assert.deepEqual(rows, [
      { t1_a: 'bla', t2_b: 'bou' },
      { t1_a: 'bla2', t2_b: 'bou' }
    ]);
    await conn.end();
  });

  test('force version check', async () => {
    const conn = await createConnection({ forceVersionCheck: true });
    const rows = await conn.query("SELECT '1'");
    assert.deepEqual(rows, [{ 1: '1' }]);
    await conn.end();
  });

  test('connection timeout', async () => {
    if (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 1, 2)) {
      const conn = await createConnection({ multipleStatements: true, queryTimeout: 1000 });
      try {
        await conn.query(
          'SELECT 1;select c1.* from information_schema.columns as c1, information_schema.tables, ' +
            'information_schema.tables as t2'
        );
        throw new Error('must have thrown error');
      } catch (err) {
        assert.equal(err.errno, 1969);
        assert.equal(err.sqlState, '70100');
        assert.equal(err.code, 'ER_STATEMENT_TIMEOUT');
        await conn.end();
      }
    } else {
      try {
        const conn = await createConnection({ multipleStatements: true, queryTimeout: 1000 });
        conn.end();
        throw new Error('must have thrown error');
      } catch (err) {
        assert.isTrue(
          err.message.includes('Can only use queryTimeout for MariaDB server after 10.1.1. queryTimeout value:')
        );
        assert.equal(err.errno, 45038);
        assert.equal(err.sqlState, 'HY000');
        assert.equal(err.code, 'ER_TIMEOUT_NOT_SUPPORTED');
      }
    }
  }, 10000);

  test('connection timeout superseded', async () => {
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 1, 2)) {
      // not supported
      const conn = await createConnection({ multipleStatements: true });
      try {
        await conn.query({
          timeout: 1000,
          sql:
            'select c1.* from information_schema.columns as c1, information_schema.tables, ' +
            'information_schema.tables as t2'
        });
        throw new Error('must have thrown error');
      } catch (err) {
        assert.isTrue(err.message.includes('Cannot use timeout for MySQL server'));
        assert.equal(err.errno, 45038);
        assert.equal(err.sqlState, 'HY000');
        assert.equal(err.code, 'ER_TIMEOUT_NOT_SUPPORTED');
        await conn.end();
      }
    } else {
      const conn = await createConnection({ multipleStatements: true, queryTimeout: 10000000 });
      try {
        await conn.query({
          timeout: 1000,
          sql:
            'select c1.* from information_schema.columns as c1, information_schema.tables, ' +
            'information_schema.tables as t2'
        });
      } catch (err) {
        assert.equal(err.errno, 1969);
        assert.equal(err.sqlState, '70100');
        assert.equal(err.code, 'ER_STATEMENT_TIMEOUT');
        await conn.end();
      }
    }
  }, 10000);
});
