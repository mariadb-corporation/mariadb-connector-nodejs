//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2023 MariaDB Corporation Ab

'use strict';

const base = require('../base.js');
const { assert } = require('chai');

describe('connection option', () => {
  it('with undefined collation', function (done) {
    if (process.env.srv === 'xpand') this.skip();
    base
      .createConnection({ charset: 'unknown' })
      .then(() => {
        done(new Error('must have thrown error!'));
      })
      .catch((err) => {
        assert(err.message.includes('Unknown'));
        done();
      });
  });

  it('collation with no id', async function () {
    if (process.env.srv === 'xpand' || process.env.srv === 'mariadb-es' || process.env.srv === 'mariadb-es-test')
      this.skip();
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(11, 2, 0)) this.skip();
    const conn = await base.createConnection();
    await conn.query('set NAMES utf8mb4 COLLATE uca1400_vietnamese_ai_ci');
    conn.end();
  });

  it('wrong IANA timezone', function (done) {
    base
      .createConnection({ timezone: 'unknown' })
      .then(() => {
        done(new Error('must have thrown error'));
      })
      .catch((err) => {
        assert.isTrue(err.message.includes("setting timezone 'unknown' fails on server."));
        assert.equal(err.errno, 45033);
        assert.equal(err.sqlState, '08S01');
        assert.equal(err.code, 'ER_WRONG_IANA_TIMEZONE');
        done();
      });
  });

  it('ensure Etc/GMT', async function () {
    let conn = await base.createConnection({ timezone: 'Etc/GMT-8' });
    let res = await conn.query('SELECT @@time_zone as t');
    assert.equal(res[0].t, '+08:00');
    conn.end();

    conn = await base.createConnection({ timezone: 'GMT-8' });
    res = await conn.query('SELECT @@time_zone as t');
    assert.equal(res[0].t, '-08:00');
    conn.end();
  });

  it('automatic timezone', async function () {
    const conn = await base.createConnection({ timezone: 'auto' });
    conn.end();
  });

  it('timezone Z', async function () {
    // node.js before v13 doesn't permit to set TZ value repeatedly
    if (parseInt(process.versions.node.split('.')[0]) <= 12) this.skip();

    const defaultTz = process.env.TZ;
    const conn = await base.createConnection({ timezone: 'Z' });
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
    conn.end();
    process.env.TZ = defaultTz;
  });

  it('timezone +0h', async function () {
    const conn = await base.createConnection({ timezone: '+00:00' });

    let d = new Date('2000-01-01T00:00:00Z');
    let res = await conn.query("SELECT UNIX_TIMESTAMP('2000-01-01T00:00:00') tt", [d]);
    assert.equal(Number(res[0].tt), d.getTime() / 1000);
    conn.end();
  });

  it('timezone +10h00', async function () {
    // node.js before v13 doesn't permit to set TZ value repeatedly
    if (parseInt(process.versions.node.split('.')[0]) <= 12) this.skip();

    const defaultTz = process.env.TZ;
    const conn = await base.createConnection({ timezone: '+10:00' });
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

  it('timezone Etc/GMT-10', async function () {
    // node.js before v13 doesn't permit to set TZ value repeatedly
    if (parseInt(process.versions.node.split('.')[0]) <= 12) this.skip();

    const defaultTz = process.env.TZ;
    const conn = await base.createConnection({ timezone: 'Etc/GMT-10' });
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

  it('timezone GMT+10', async function () {
    // node.js before v13 doesn't permit to set TZ value repeatedly
    if (parseInt(process.versions.node.split('.')[0]) <= 12) this.skip();

    const defaultTz = process.env.TZ;
    const conn = await base.createConnection({ timezone: 'GMT+10' });
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

  it('wrong timezone format', function (done) {
    base
      .createConnection({ timezone: '+e:00' })
      .then((conn) => {
        done(new Error('Must have thrown exception'));
      })
      .catch((err) => {
        assert.isTrue(err.message.includes("setting timezone '+e:00' fails on server"));
        assert.equal(err.errno, 45033);
        assert.equal(err.sqlState, '08S01');
        assert.equal(err.code, 'ER_WRONG_IANA_TIMEZONE');
        done();
      });
  });

  it('Server with different tz', async function () {
    // node.js before v13 doesn't permit to set TZ value repeatedly
    if (parseInt(process.versions.node.split('.')[0]) <= 12) this.skip();

    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    //MySQL 5.5 doesn't have milliseconds
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
    const defaultTz = process.env.TZ;
    const conn = await base.createConnection({ timezone: 'Etc/GMT+5' });
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

  it('nestTables results boolean', async function () {
    const conn = await base.createConnection({ nestTables: true });
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
    conn.end();
  });

  it('nestTables results string', async function () {
    const conn = await base.createConnection({ nestTables: '_' });
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
    conn.end();
  });

  it('rows as array', async function () {
    const conn = await base.createConnection({ rowsAsArray: true });
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
    conn.end();
  });

  it('query option rows as array', async function () {
    const conn = await base.createConnection();
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
    conn.end();
  });

  it('nestTables results query boolean', async function () {
    const conn = await base.createConnection();
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
    conn.end();
  });

  it('nestTables results query string', async function () {
    const conn = await base.createConnection();
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

  it('force version check', function (done) {
    base
      .createConnection({ forceVersionCheck: true })
      .then((conn) => {
        conn
          .query("SELECT '1'")
          .then((rows) => {
            assert.deepEqual(rows, [{ 1: '1' }]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('connection timeout', function (done) {
    if (process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    this.timeout(10000);
    if (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 1, 2)) {
      base
        .createConnection({ multipleStatements: true, queryTimeout: 1000 })
        .then((conn) => {
          conn
            .query(
              'SELECT 1;select c1.* from information_schema.columns as c1, information_schema.tables, information_schema.tables as t2'
            )
            .then(() => {
              conn.end();
              done(new Error('must have thrown error'));
            })
            .catch((err) => {
              assert.equal(err.errno, 1969);
              assert.equal(err.sqlState, '70100');
              assert.equal(err.code, 'ER_STATEMENT_TIMEOUT');
              conn.end();
              done();
            });
        })
        .catch(done);
    } else {
      base
        .createConnection({ multipleStatements: true, queryTimeout: 1000 })
        .then((conn) => {
          conn.end();
          done(new Error('must have thrown error'));
        })
        .catch((err) => {
          assert.isTrue(
            err.message.includes('Can only use queryTimeout for MariaDB server after 10.1.1. queryTimeout value:')
          );
          assert.equal(err.errno, 45038);
          assert.equal(err.sqlState, 'HY000');
          assert.equal(err.code, 'ER_TIMEOUT_NOT_SUPPORTED');
          done();
        });
    }
  });

  it('connection timeout superseded', function (done) {
    if (process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    this.timeout(10000);

    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 1, 2)) {
      // not supported
      base
        .createConnection({ multipleStatements: true })
        .then((conn) => {
          conn
            .query({
              timeout: 1000,
              sql: 'SELECT 1;select c1.* from information_schema.columns as c1, information_schema.tables, information_schema.tables as t2'
            })
            .then(() => {
              conn.end();
              done(new Error('must have thrown error'));
            })
            .catch((err) => {
              assert.isTrue(
                err.message.includes('Cannot use timeout for MySQL server') ||
                  err.message.includes('Cannot use timeout for xpand/MariaDB')
              );
              assert.equal(err.errno, 45038);
              assert.equal(err.sqlState, 'HY000');
              assert.equal(err.code, 'ER_TIMEOUT_NOT_SUPPORTED');
              conn.end();
              done();
            });
        })
        .catch(done);
    } else {
      base
        .createConnection({ multipleStatements: true, queryTimeout: 10000000 })
        .then((conn) => {
          conn
            .query({
              timeout: 1000,
              sql: 'SELECT 1;select c1.* from information_schema.columns as c1, information_schema.tables, information_schema.tables as t2'
            })
            .then(() => {
              conn.end();
              done(new Error('must have thrown error'));
            })
            .catch((err) => {
              assert.equal(err.errno, 1969);
              assert.equal(err.sqlState, '70100');
              assert.equal(err.code, 'ER_STATEMENT_TIMEOUT');
              conn.end();
              done();
            });
        })
        .catch(done);
    }
  });
});
