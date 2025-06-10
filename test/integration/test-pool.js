//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

const base = require('../base.js');
const { assert, expect } = require('chai');
const Conf = require('../conf');
const stream = require('stream');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Proxy = require('../tools/proxy');
const { baseConfig } = require('../conf');
const winston = require('winston');
const { isMaxscale } = require('../base');

describe('Pool', () => {
  const fileName = path.join(os.tmpdir(), Math.random() + 'tempStream.txt');

  before(function () {
    if (process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
  });

  after(function () {
    fs.unlink(fileName, (err) => {
      //eat
    });
  });

  it('pool metaAsArray', async function () {
    if (process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    const pool = base.createPool({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 1
    });
    try {
      const res = await pool.query(
        'DROP TABLE IF EXISTS t; ' +
          'CREATE TABLE t (i int);\n' +
          'INSERT INTO t(i) VALUES (1);\n' +
          'SELECT i FROM t; '
      );
      assert.equal(2, res.length);
      assert.equal(4, res[0].length);
      assert.equal(4, res[1].length);
      assert.equal('i', res[1][3][0].name());
    } catch (e) {
      console.log(e);
    } finally {
      await pool.end();
    }
  });

  it('pool query stack trace', async function () {
    if (process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    const pool = base.createPool({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 1,
      trace: true
    });
    try {
      await pool.query('wrong query');
      throw Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.stack.includes('test-pool.js:65:18'), err.stack);
    } finally {
      await pool.end();
    }
  });

  it('pool execute stack trace', async function () {
    if (process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    const pool = base.createPool({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 1,
      trace: true
    });
    try {
      await pool.execute('wrong query');
      throw Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.stack.includes('test-pool.js:83:18'), err.stack);
    } finally {
      await pool.end();
    }
  });

  it('pool execute wrong param stack trace', async function () {
    if (process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    const pool = base.createPool({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 1,
      trace: true
    });
    try {
      await pool.execute('SELECT ?', []);
      throw Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.stack.includes('test-pool.js:101:18'), err.stack);
    } finally {
      await pool.end();
    }
  });

  it('prepare cache reuse', async () => {
    const pool = base.createPool({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 1,
      prepareCacheLength: 2
    });
    await pool.execute('select ?', [1]);
    const conn = await pool.getConnection();
    const prepareCache = conn.prepareCache;
    assert.equal(prepareCache.toString(), `info{cache:[${baseConfig.database}|select ?]}`);
    conn.release();

    await pool.execute('select ?', [1]);
    assert.equal(prepareCache.toString(), `info{cache:[${baseConfig.database}|select ?]}`);

    await pool.execute('select ? + 1', [1]);
    assert.equal(
      prepareCache.toString(),
      `info{cache:[${baseConfig.database}|select ? + 1],[${baseConfig.database}|select ?]}`
    );

    await pool.execute('select ? + 2', [1]);
    assert.equal(
      `info{cache:[${baseConfig.database}|select ? + 2],[${baseConfig.database}|select ? + 1]}`,
      prepareCache.toString()
    );

    await pool.execute('select ? + 3', [1]);
    assert.equal(
      `info{cache:[${baseConfig.database}|select ? + 3],[${baseConfig.database}|select ? + 2]}`,
      prepareCache.toString()
    );

    await pool.execute({ sql: 'select ? + 2' }, [1]);
    assert.equal(
      `info{cache:[${baseConfig.database}|select ? + 2],[${baseConfig.database}|select ? + 3]}`,
      prepareCache.toString()
    );

    await pool.execute({ sql: 'select 4' });
    assert.equal(
      prepareCache.toString(),
      `info{cache:[${baseConfig.database}|select 4],[${baseConfig.database}|select ? + 2]}`
    );

    await pool.execute('select ?', [1]);
    assert.equal(
      prepareCache.toString(),
      `info{cache:[${baseConfig.database}|select ?],[${baseConfig.database}|select 4]}`
    );
    for (let i = 0; i < 10; i++) {
      pool.execute('select ?', [i]);
      assert.equal(
        prepareCache.toString(),
        `info{cache:[${baseConfig.database}|select ?],[${baseConfig.database}|select 4]}`
      );
    }
    pool.end();
  });

  it('prepare cache reuse with reset', async function () {
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 3, 13)) this.skip();

    const pool = base.createPool({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 1,
      prepareCacheLength: 2,
      resetAfterUse: true
    });
    await pool.execute('select ?', [1]);
    const conn = await pool.getConnection();
    const prepareCache = conn.prepareCache;
    assert.equal(prepareCache.toString(), `info{cache:[${baseConfig.database}|select ?]}`);
    await conn.release();
    assert.equal(prepareCache.toString(), `info{cache:}`);

    await pool.execute('select ?', [1]);
    assert.equal(prepareCache.toString(), `info{cache:[${baseConfig.database}|select ?]}`);

    await pool.execute('select ? + 1', [1]);
    assert.equal(
      prepareCache.toString(),
      `info{cache:[${baseConfig.database}|select ? + 1],[${baseConfig.database}|select ?]}`
    );

    await pool.execute('select ? + 2', [1]);
    assert.equal(
      `info{cache:[${baseConfig.database}|select ? + 2],[${baseConfig.database}|select ? + 1]}`,
      prepareCache.toString()
    );

    await pool.execute('select ? + 3', [1]);
    assert.equal(
      `info{cache:[${baseConfig.database}|select ? + 3],[${baseConfig.database}|select ? + 2]}`,
      prepareCache.toString()
    );

    await pool.execute({ sql: 'select ? + 2' }, [1]);
    assert.equal(
      `info{cache:[${baseConfig.database}|select ? + 2],[${baseConfig.database}|select ? + 3]}`,
      prepareCache.toString()
    );

    await pool.execute({ sql: 'select 4' });
    assert.equal(
      prepareCache.toString(),
      `info{cache:[${baseConfig.database}|select 4],[${baseConfig.database}|select ? + 2]}`
    );

    await pool.execute('select ?', [1]);
    assert.equal(
      prepareCache.toString(),
      `info{cache:[${baseConfig.database}|select ?],[${baseConfig.database}|select 4]}`
    );
    for (let i = 0; i < 10; i++) {
      pool.execute('select ?', [i]);
      assert.equal(
        prepareCache.toString(),
        `info{cache:[${baseConfig.database}|select ?],[${baseConfig.database}|select 4]}`
      );
    }
    pool.end();
  });

  it('pool batch stack trace', async function () {
    if (process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    const pool = base.createPool({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 1,
      trace: true
    });
    try {
      await pool.batch('WRONG COMMAND', [[1], [1]]);
      throw Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.stack.includes('test-pool.js:245:18'), err.stack);
    } finally {
      await pool.end();
    }
  });

  it('pool batch wrong param stack trace', async function () {
    if (process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    const pool = base.createPool({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 1,
      trace: true
    });
    try {
      await pool.query('CREATE TABLE IF NOT EXISTS test_batch(id int)');
      await pool.batch('INSERT INTO test_batch VALUES (?,?)', [[1], [1]]);
      throw Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.stack.includes('test-pool.js:264:18'), err.stack);
    } finally {
      await pool.query('DROP TABLE test_batch');
      await pool.end();
    }
  });

  it('ending pool no active connection', async function () {
    if (process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    this.timeout(15000);
    const pool = base.createPool({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 2,
      trace: true
    });
    await new Promise((res) => setTimeout(() => res(), 100));
    const start = process.hrtime();
    await new Promise((res) => setTimeout(() => res(), 100));
    await pool.end();
    assert.equal(process.hrtime(start)[0], 0);
  });

  it('ending pool with active connection', async function () {
    if (process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    this.timeout(15000);
    const pool = base.createPool({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 2,
      trace: true
    });
    await new Promise((res) => setTimeout(() => res(), 100));
    const start = process.hrtime();
    pool.query('SELECT SLEEP(3)');
    await new Promise((res) => setTimeout(() => res(), 100));
    await pool.end();
    assert.equal(process.hrtime(start)[0], 3);
  });

  it('ending pool with active connection reaching end', async function () {
    if (process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    this.timeout(15000);
    const pool = base.createPool({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 2,
      trace: true
    });
    await new Promise((res) => setTimeout(() => res(), 100));
    const start = process.hrtime();
    pool.query('SELECT SLEEP(15)');
    await new Promise((res) => setTimeout(() => res(), 100));
    await pool.end();

    // on windows, less accurate, so need to have 11 too
    assert.isTrue(process.hrtime(start)[0] === 10 || process.hrtime(start)[0] === 11);
  });

  it('pool escape', function (done) {
    if (!base.utf8Collation()) this.skip();
    const pool = base.createPool({ connectionLimit: 1 });
    const pool2 = base.createPool({ connectionLimit: 1, arrayParenthesis: true });

    pool.on('connection', async (conn) => {
      assert.equal(pool.escape(new Date('1999-01-31 12:13:14.000')), "'1999-01-31 12:13:14'");
      assert.equal(pool.escape(Buffer.from("let's rocks\n😊 🤘")), "_binary'let\\'s rocks\\n😊 🤘'");
      assert.equal(pool.escape(19925.1), '19925.1');
      let prefix =
        (conn.info.isMariaDB() && conn.info.hasMinVersion(10, 1, 4)) ||
        (!conn.info.isMariaDB() && conn.info.hasMinVersion(5, 7, 6))
          ? 'ST_'
          : '';
      assert.equal(pool.escape({ type: 'Point', coordinates: [20, 10] }), prefix + "PointFromText('POINT(20 10)')");
      assert.equal(pool.escape({ id: 2, val: "t'est" }), '\'{\\"id\\":2,\\"val\\":\\"t\\\'est\\"}\'');
      const fctStr = new Object();
      fctStr.toSqlString = () => {
        return "bla'bla";
      };
      assert.equal(pool.escape(fctStr), "'bla\\'bla'");
      assert.equal(pool.escape(null), 'NULL');
      assert.equal(pool.escape("let'g'o😊"), "'let\\'g\\'o😊'");
      assert.equal(pool.escape("a'\nb\tc\rd\\e%_\u001a"), "'a\\'\\nb\\tc\\rd\\\\e%_\\Z'");
      const arr = ["let'g'o😊", false, null, fctStr];
      assert.equal(pool.escape(arr), "'let\\'g\\'o😊',false,NULL,'bla\\'bla'");
      assert.equal(pool2.escape(arr), "('let\\'g\\'o😊',false,NULL,'bla\\'bla')");

      assert.equal(pool.escapeId('good_$one'), '`good_$one`');
      assert.equal(pool.escape(''), "''");
      assert.equal(pool.escapeId('f:a'), '`f:a`');
      assert.equal(pool.escapeId('`f:a`'), '```f:a```');
      assert.equal(pool.escapeId('good_`è`one'), '`good_``è``one`');
      await pool.end();
      await pool2.end();
      done();
    });
  });

  it('pool escape on init', async function () {
    const pool = base.createPool({ connectionLimit: 1 });
    assert.equal(pool.escape(new Date('1999-01-31 12:13:14.000')), "'1999-01-31 12:13:14'");
    assert.equal(pool.escape(new Date('1999-01-31 12:13:14.65')), "'1999-01-31 12:13:14.650'");
    assert.equal(pool.escapeId('good_$one'), '`good_$one`');
    assert.equal(pool.escapeId('f:a'), '`f:a`');
    assert.equal(pool.escapeId('good_`è`one'), '`good_``è``one`');

    await pool.end();
  });

  it('undefined query', async function () {
    const pool = base.createPool({ connectionLimit: 1 });
    try {
      await pool.query(undefined);
      throw new Error('must have thrown an error');
    } catch (err) {
      assert(err.message.includes('sql parameter is mandatory'));
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.errno, 45049);
      assert.equal(err.code, 'ER_UNDEFINED_SQL');
    } finally {
      await pool.end();
    }
  });

  it('undefined execute', async function () {
    const pool = base.createPool({ connectionLimit: 1 });
    try {
      await pool.execute(undefined);
      throw new Error('must have thrown an error');
    } catch (err) {
      assert(err.message.includes('sql parameter is mandatory'));
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.errno, 45049);
      assert.equal(err.code, 'ER_UNDEFINED_SQL');
    } finally {
      await pool.end();
    }
  });

  it('undefined batch', async function () {
    const pool = base.createPool({ connectionLimit: 1 });
    try {
      await pool.batch(undefined);
      throw new Error('must have thrown an error');
    } catch (err) {
      assert(err.message.includes('sql parameter is mandatory'));
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.errno, 45049);
      assert.equal(err.code, 'ER_UNDEFINED_SQL');
    } finally {
      await pool.end();
    }
  });

  it('undefined query', async function () {
    const pool = base.createPool({ connectionLimit: 1 });
    try {
      await pool.query(undefined);
      throw new Error('must have thrown an error');
    } catch (err) {
      assert(err.message.includes('sql parameter is mandatory'));
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.errno, 45049);
      assert.equal(err.code, 'ER_UNDEFINED_SQL');
    } finally {
      await pool.end();
    }
  });

  it('undefined batch', async function () {
    const pool = base.createPool({ connectionLimit: 1 });
    try {
      await pool.batch(undefined);
      throw new Error('must have thrown an error');
    } catch (err) {
      assert(err.message.includes('sql parameter is mandatory'));
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.errno, 45049);
      assert.equal(err.code, 'ER_UNDEFINED_SQL');
    } finally {
      await pool.end();
    }
  });

  it('query with null placeholder', async function () {
    const pool = base.createPool({ connectionLimit: 1 });
    let rows = await pool.query('select ? as a', [null]);
    assert.deepEqual(rows, [{ a: null }]);
    await pool.end();
  });

  it('query with null placeholder no array', async function () {
    const pool = base.createPool({ connectionLimit: 1 });
    let rows = await pool.query('select ? as a', null);
    assert.deepEqual(rows, [{ a: null }]);
    await pool.end();
  });

  it('pool with wrong authentication', async function () {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha') this.skip(); //to avoid host being blocked
    this.timeout(10000);
    const initTime = Date.now();
    const pool = base.createPool({
      acquireTimeout: 4000,
      initializationTimeout: 2000,
      user: 'wrongAuthentication'
    });

    setTimeout(async () => {
      try {
        await pool.query('SELECT 2');
        pool.end();
        throw new Error('must have thrown error');
      } catch (err) {
        assert(Date.now() - initTime >= 3980, 'expected > 4s, but was ' + (Date.now() - initTime));
        assert.isTrue(err.message.includes('Error during pool initialization:'));
        assert.isTrue(
          err.errno === 1524 ||
            err.errno === 1045 ||
            err.errno === 1698 ||
            err.errno === 45025 ||
            err.errno === 45028 ||
            err.errno === 45044,
          err.message
        );
      }
    }, 0);
    try {
      await pool.query('SELECT 1');
      await pool.end();
      throw new Error('must have thrown error');
    } catch (err) {
      assert(Date.now() - initTime >= 3980, 'expected > 4s, but was ' + (Date.now() - initTime));
      assert.isTrue(err.message.includes('Error during pool initialization:'));
      assert.isTrue(
        err.errno === 1524 ||
          err.errno === 1045 ||
          err.errno === 1698 ||
          err.errno === 45025 ||
          err.errno === 45028 ||
          err.errno === 45044,
        err.message
      );
      try {
        await pool.query('SELECT 3');
        throw new Error('must have thrown error');
      } catch (err) {
        assert(Date.now() - initTime >= 3980, 'expected > 4s, but was ' + (Date.now() - initTime));
        assert.isTrue(err.message.includes('Error during pool initialization:'));
        assert.isTrue(
          err.errno === 1524 ||
            err.errno === 1045 ||
            err.errno === 1698 ||
            err.errno === 45028 ||
            err.errno === 45025 ||
            err.errno === 45044,
          err.message
        );
      } finally {
        await pool.end();
      }
    }
  });

  it('pool execute timeout', async function () {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha') this.skip(); //to avoid host being blocked
    this.timeout(10000);
    const pool = base.createPool({
      connectionLimit: 1,
      acquireTimeout: 400
    });
    assert.isFalse(pool.closed);
    pool.query('SELECT SLEEP(1)');
    try {
      await pool.execute('SELECT 1');
      throw new Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.message.includes('retrieve connection from pool timeout'));
    } finally {
      await pool.end();
      assert.isTrue(pool.closed);
    }
  });

  it('pool batch timeout', async function () {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha') this.skip(); //to avoid host being blocked
    this.timeout(10000);
    const pool = base.createPool({
      connectionLimit: 1,
      acquireTimeout: 400
    });
    pool.query('SELECT SLEEP(1)');
    try {
      await pool.batch('SELECT 1', [[1]]);
      throw new Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.message.includes('retrieve connection from pool timeout'));
    } finally {
      await pool.end();
    }
  });

  it('pool error event', async function () {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha') this.skip(); //to avoid host being blocked
    this.timeout(10000);
    const pool = base.createPool({
      acquireTimeout: 4000,
      initializationTimeout: 2000,
      user: 'wrongAuthentication'
    });

    await new Promise(function (resolver, rejecter) {
      pool.on('error', (err) => {
        assert.isTrue(err.message.includes('Error during pool initialization:'));
        assert.isTrue(
          err.errno === 1524 ||
            err.errno === 1045 ||
            err.errno === 1698 ||
            err.errno === 45028 ||
            err.errno === 45025 ||
            err.errno === 45044,
          err.message
        );
        pool.end();
        resolver();
      });
    });
  });

  it('pool error fail connection', async function () {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha') this.skip(); //to avoid host being blocked
    this.timeout(10000);
    const initTime = Date.now();
    const pool = base.createPool({
      acquireTimeout: 4000,
      initializationTimeout: 2000,
      host: 'wronghost'
    });

    await new Promise(function (resolver, rejecter) {
      pool.on('error', (err) => {
        assert(Date.now() - initTime >= 1980, 'expected > 2s, but was ' + (Date.now() - initTime));
        assert.isTrue(err.message.includes('Error during pool initialization:'));
        pool.end();
        resolver();
      });
    });
  });

  it('pool with wrong authentication connection', async function () {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    this.timeout(15000);
    let err;
    let pool;
    try {
      pool = base.createPool({
        acquireTimeout: 4000,
        initializationTimeout: 2000,
        user: 'wrongAuthentication'
      });
      await pool.getConnection();
      throw new Error('must have thrown error');
    } catch (err) {
      assert.equal(err.errno, 45028);
      expect(err.message).to.have.string('retrieve connection from pool timeout after');
      expect(err.message).to.have.string('Error during pool initialization');
    }
    try {
      await pool.getConnection();
      throw new Error('must have thrown error');
    } catch (err) {
      assert.equal(err.errno, 45028);
      expect(err.message).to.have.string('retrieve connection from pool timeout after');
      expect(err.message).to.have.string('Error during pool initialization');
    } finally {
      pool.end();
    }
  });

  it('create pool', async function () {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    this.timeout(5000);
    const pool = base.createPool({ connectionLimit: 1 });
    const initTime = Date.now();
    let conn = await pool.getConnection();
    await conn.query('SELECT SLEEP(1)');
    conn.release();

    await pool.getConnection();
    await conn.query('SELECT SLEEP(1)');
    const time = Date.now() - initTime;
    assert(time >= 1980, 'expected > 2s, but was ' + time);
    conn.release();
    await pool.end();
  });

  it('pool execute', async function () {
    const pool = base.createPool({ connectionLimit: 1 });
    const res = await pool.execute('SELECT ? as a', [5]);
    assert.isTrue(res[0].a === 5 || res[0].a === 5n);
    await pool.end();
  });

  it('create pool with multipleStatement', async function () {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    this.timeout(5000);
    const pool = base.createPool({
      connectionLimit: 5,
      multipleStatements: true
    });

    const results = await pool.query("select '1'; select '2'");
    assert.deepEqual(results, [[{ 1: '1' }], [{ 2: '2' }]]);
    await pool.end();
  });

  it('ensure commit', async function () {
    await shareConn.query('DROP TABLE IF EXISTS ensureCommit');
    await shareConn.query('CREATE TABLE ensureCommit(firstName varchar(32))');
    await shareConn.query("INSERT INTO ensureCommit values ('john')");

    const pool = base.createPool({ connectionLimit: 1 });
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      await conn.query("UPDATE ensureCommit SET firstName='Tom'");
      await conn.commit();
      await conn.end();
      const res = await shareConn.query('SELECT * FROM ensureCommit');
      assert.deepEqual(res, [{ firstName: 'Tom' }]);
    } finally {
      conn.rollback();
      await pool.end();
    }
  });

  it('pool without control after use', async function () {
    await shareConn.query('DROP TABLE IF EXISTS ensureCommit');
    await shareConn.query('CREATE TABLE ensureCommit(firstName varchar(32))');
    await shareConn.query("INSERT INTO ensureCommit values ('john')");
    const pool = base.createPool({
      connectionLimit: 1,
      noControlAfterUse: true
    });
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      await conn.query("UPDATE ensureCommit SET firstName='Tom'");
      await conn.commit();
      await conn.end();
      const res = await shareConn.query('SELECT * FROM ensureCommit');
      assert.deepEqual(res, [{ firstName: 'Tom' }]);
    } finally {
      conn.rollback();
      await pool.end();
    }
  });

  it('double end', async function () {
    const pool = base.createPool({ connectionLimit: 1 });
    const conn = await pool.getConnection();
    await conn.end();
    await pool.end();
    try {
      await pool.end();
      throw new Error('must have thrown an error !');
    } catch (err) {
      assert.isTrue(err.message.includes('pool is already closed'));
    }
  });

  it('pool ending during requests', async function () {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    this.timeout(20000);
    const pool = base.createPool({ connectionLimit: 1 });
    const conn = await pool.getConnection();
    await conn.end();
    const reflect = (p) =>
      p.then(
        (v) => ({ v, status: 'resolved' }),
        (e) => ({ e, status: 'rejected' })
      );

    const requests = [];
    for (let i = 0; i < 10000; i++) {
      requests.push(pool.query('SELECT ' + i));
    }

    setTimeout(pool.end.bind(pool), 200);

    const handle = setTimeout(async () => {
      const results = await Promise.all(requests.map(reflect));
      let success = 0,
        error = 0;
      results.forEach((x) => {
        if (x.status === 'resolved') {
          success++;
        } else {
          error++;
        }
      });
      console.log('error: ' + error + ' success:' + success);
    }, 9500);

    const results = await Promise.all(requests.map(reflect));
    let success = 0,
      error = 0;
    results.forEach((x) => {
      if (x.status === 'resolved') {
        success++;
      } else {
        error++;
      }
    });
    console.log('error:' + error + ' success:' + success);
    assert.isTrue(error > 0, 'error: ' + error + ' success:' + success);
    assert.isTrue(success > 0, 'error: ' + error + ' success:' + success);
    clearTimeout(handle);
  });

  it('pool wrong query', async function () {
    this.timeout(5000);
    const pool = base.createPool({ connectionLimit: 1 });
    try {
      await pool.query('wrong query');
      throw new Error('must have thrown error !');
    } catch (err) {
      if (err.errno === 1141) {
        // SKYSQL ERROR
        assert.isTrue(
          err.message.includes(
            'Query could not be tokenized and will hence be rejected. Please ensure that the SQL syntax is correct.'
          )
        );
        assert.equal(err.sqlState, 'HY000');
      } else {
        assert(err.message.includes('You have an error in your SQL syntax'));
        assert.equal(err.sqlState, '42000');
        assert.equal(err.code, 'ER_PARSE_ERROR');
      }
      pool.end();
    }
  });

  it('pool getConnection after close', async function () {
    const pool = base.createPool({ connectionLimit: 1 });
    await pool.end();
    try {
      await pool.getConnection();
      throw new Error('must have throw error');
    } catch (err) {
      assert(err.message.includes('pool is closed'));
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.errno, 45027);
      assert.equal(err.code, 'ER_POOL_ALREADY_CLOSED');
    }
  });

  it('pool query after close', async function () {
    const pool = base.createPool({ connectionLimit: 1 });
    await pool.end();
    try {
      await pool.query('select ?', 1);
      throw new Error('must have throw error');
    } catch (err) {
      assert(err.message.includes('pool is closed'));
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.errno, 45027);
      assert.equal(err.code, 'ER_POOL_ALREADY_CLOSED');
    }
  });

  it('pool getConnection timeout', function (done) {
    if (
      process.env.srv === 'maxscale' ||
      process.env.srv === 'skysql' ||
      process.env.srv === 'skysql-ha' ||
      process.env.srv === 'xpand'
    )
      this.skip();
    const pool = base.createPool({ connectionLimit: 1, acquireTimeout: 200 });
    let errorThrown = false;
    pool
      .query('SELECT SLEEP(1)')
      .then(() => {
        return pool.end();
      })
      .then(() => {
        assert.isOk(errorThrown);
        done();
      })
      .catch(done);

    pool.getConnection().catch((err) => {
      assert(err.message.includes('retrieve connection from pool timeout'));
      assert(err.message.includes('(pool connections: active=1 idle=0 limit=1)'));
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.errno, 45028);
      assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
      errorThrown = true;
    });
  });

  it('pool getConnection timeout with leak', function (done) {
    let tmpLogFile = path.join(os.tmpdir(), 'logFile.txt');
    try {
      fs.unlinkSync(tmpLogFile);
    } catch (e) {}
    let logger = winston.createLogger({
      transports: [new winston.transports.File({ filename: tmpLogFile })]
    });
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    const pool = base.createPool({
      connectionLimit: 1,
      acquireTimeout: 200,
      leakDetectionTimeout: 10,
      logger: {
        network: null,
        query: (msg) => logger.info(msg),
        error: (msg) => logger.info(msg),
        warning: (msg) => logger.info(msg)
      }
    });
    let errorThrown = false;
    pool
      .query('SELECT SLEEP(1)')
      .then(async () => {
        await pool.end();
        assert.isOk(errorThrown);
        //wait 100ms to ensure stream has been written
        setTimeout(() => {
          const data = fs.readFileSync(tmpLogFile, 'utf8');
          assert.isTrue(data.includes('A possible connection leak on the thread'));
          assert.isTrue(data.includes('was returned to pool'));
          logger.close();
          try {
            fs.unlinkSync(tmpLogFile);
          } catch (e) {}
          done();
        }, 100);
      })
      .catch(done);
    setTimeout(() => {
      pool.getConnection().catch((err) => {
        assert(err.message.includes('retrieve connection from pool timeout'));
        assert(err.message.includes('(pool connections: active=1 idle=0 leak=1 limit=1)'));
        assert.equal(err.sqlState, 'HY000');
        assert.equal(err.errno, 45028);
        assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
        errorThrown = true;
      });
    }, 50);
  });

  it('pool leakDetectionTimeout timeout', async function () {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    const pool = base.createPool({
      connectionLimit: 1,
      acquireTimeout: 200,
      leakDetectionTimeout: 300
    });
    const conn = await pool.getConnection();
    await conn.query('SELECT SLEEP(1)');
    await conn.release();
    await pool.end();
  });

  it('pool reset validation', async function () {
    const conf = { connectionLimit: 5, timezone: 'Z', initSql: 'set @aa= 1' };
    if (shareConn.info.isMariaDB()) {
      conf['queryTimeout'] = 10000;
    }
    const pool = base.createPool(conf);
    try {
      const cs = [1, 2, 3, 4, 5];

      await Promise.all(
        cs.map(async (n) => {
          let conn;
          try {
            conn = await pool.getConnection();
            let sql = 'SELECT @@time_zone AS tz, @aa AS aa, CONNECTION_ID() AS id';
            if (shareConn.info.isMariaDB()) sql += ', @@session.max_statement_time as timeout';
            const res = await conn.query(sql);
            assert.equal('+00:00', res[0].tz);
            assert.equal('1', res[0].aa);
            if (shareConn.info.isMariaDB()) {
              assert.equal('10', res[0]['timeout']);
            }
          } finally {
            if (conn) conn.release();
          }
        })
      );
    } finally {
      if (pool) await pool.end();
    }
  });

  it('pool getConnection timeout recovery', function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    this.timeout(5000);
    const pool = base.createPool({
      connectionLimit: 2,
      acquireTimeout: 800,
      leakDetectionTimeout: 1250
    });
    let errorThrown = false;
    setTimeout(() => {
      for (let i = 0; i < 2; i++) {
        pool.query('SELECT SLEEP(1)').catch(done);
      }

      for (let i = 0; i < 2; i++) {
        pool
          .getConnection()
          .then(() => done(new Error('must have thrown error')))
          .catch((err) => {
            assert(err.message.includes('retrieve connection from pool timeout'));
            assert.equal(err.sqlState, 'HY000');
            assert.equal(err.errno, 45028);
            assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
            errorThrown = true;
          });
      }
      for (let i = 0; i < 100; i++) {
        setTimeout(() => {
          pool
            .getConnection()
            .then((conn) => {
              conn.release();
            })
            .catch((err) => {
              done(err);
            });
        }, 1100);
      }
      setTimeout(async () => {
        const conn = await pool.getConnection();
        assert.isOk(errorThrown);
        await conn.release();
        await pool.end();
        done();
      }, 1200);
    }, 1000);
  });

  it('pool query timeout', function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    this.timeout(5000);
    const pool = base.createPool({ connectionLimit: 1, acquireTimeout: 500 });
    const initTime = Date.now();
    pool.query('SELECT SLEEP(2)').finally(() => {
      pool.end();
    });

    pool
      .query('SELECT 1')
      .then(() => {
        done(new Error('must have thrown error 1 !'));
      })
      .catch((err) => {
        try {
          assert(err.message.includes('retrieve connection from pool timeout'));
          assert.equal(err.sqlState, 'HY000');
          assert.equal(err.errno, 45028);
          assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
        } catch (e) {
          console.log(e);
        }
      });
    pool
      .query('SELECT 2')
      .then(() => {
        done(new Error('must have thrown error 2 !'));
      })
      .catch((err) => {
        try {
          assert(err.message.includes('retrieve connection from pool timeout'));
          assert.equal(err.sqlState, 'HY000');
          assert.equal(err.errno, 45028);
          assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
          const elapse = Date.now() - initTime;
          assert.isOk(elapse >= 470 && elapse < 650, 'elapse time was ' + elapse + ' but must be just after 500');
        } catch (e) {
          console.log('elapse:' + elapse);

          console.log(e);
          console.log(err);
        }
      });
    setTimeout(async () => {
      try {
        await pool.query('SELECT 3');
        done(new Error('must have thrown error 3 !'));
      } catch (err) {
        try {
          assert.isTrue(err.message.includes('retrieve connection from pool timeout'), err.message);
          assert.equal(err.sqlState, 'HY000');
          assert.equal(err.errno, 45028);
          assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
          const elapse = Date.now() - initTime;
          assert.isTrue(elapse >= 670 && elapse < 850, 'elapse time was ' + elapse + ' but must be just after 700');
          done();
        } catch (e) {
          console.log(e);
          done(e);
        }
      }
    }, 200);
  });

  it('pool grow', function (done) {
    this.timeout(20000);
    const pool = base.createPool({ connectionLimit: 10 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 10);
      assert.equal(pool.idleConnections(), 10);
      assert.equal(pool.taskQueueSize(), 0);
      let closed = false;
      const queryPromises = [];
      for (let i = 0; i < 10000; i++) {
        queryPromises.push(pool.query('SELECT ? as a', [i + '']));
      }

      Promise.all(queryPromises)
        .then((rows) => {
          for (let i = 0; i < rows.length; i++) {
            assert.deepEqual(rows[i], [{ a: i + '' }]);
          }
        })
        .catch((err) => {
          if (!closed) done(err);
        });

      setImmediate(() => {
        if (pool.activeConnections() < 10) {
          setTimeout(() => {
            assert.equal(pool.activeConnections(), 10);
            assert.equal(pool.totalConnections(), 10);
            assert.equal(pool.idleConnections(), 0);
            assert.isOk(pool.taskQueueSize() > 8000);
          }, 200);
        } else {
          assert.equal(pool.activeConnections(), 10);
          assert.equal(pool.totalConnections(), 10);
          assert.equal(pool.idleConnections(), 0);
          assert.isTrue(pool.taskQueueSize() > 9900);
        }

        setTimeout(async () => {
          closed = true;
          try {
            await pool.end();
            if (Conf.baseConfig.host === 'localhost') {
              assert.equal(pool.activeConnections(), 0);
              assert.equal(pool.totalConnections(), 0);
              assert.equal(pool.idleConnections(), 0);
              assert.equal(pool.taskQueueSize(), 0);
            }
            done();
          } catch (e) {
            done(e);
          }
        }, 5000);
      });
    }, 8000);
  });

  it('connection fail handling', function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    const pool = base.createPool({
      connectionLimit: 2,
      minDelayValidation: 200
    });
    setTimeout(async () => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);
      assert.equal(pool.taskQueueSize(), 0);

      const conn = await pool.getConnection();
      assert.equal(pool.activeConnections(), 1);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 1);
      assert.equal(pool.taskQueueSize(), 0);
      try {
        await conn.query('KILL CONNECTION_ID()');
        done(new Error('must have thrown error'));
      } catch (err) {
        try {
          assert.equal(err.sqlState, '70100');
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);
          assert.equal(pool.taskQueueSize(), 0);
          await conn.end();
          assert.equal(pool.activeConnections(), 0);
          assert.equal(pool.taskQueueSize(), 0);
          await pool.end();
          done();
        } catch (e) {
          done(e);
        }
      }
    }, 500);
  });

  it('query fail handling', function (done) {
    this.timeout(20000);
    if (isMaxscale()) this.skip();
    const pool = base.createPool({
      connectionLimit: 2,
      minDelayValidation: 200
    });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);
      assert.equal(pool.taskQueueSize(), 0);

      pool.query('KILL CONNECTION_ID()').catch((err) => {
        assert.equal(err.sqlState, 70100);
        setImmediate(() => {
          //waiting for rollback to end
          assert.equal(pool.taskQueueSize(), 0);

          setTimeout(() => {
            pool.query('do 1');
            pool.query('do 1').then(() => {
              setTimeout(() => {
                //connection recreated
                assert.equal(pool.activeConnections(), 0);
                assert.equal(pool.totalConnections(), 2);
                assert.equal(pool.idleConnections(), 2);
                assert.equal(pool.taskQueueSize(), 0);
                pool
                  .end()
                  .then(() => {
                    done();
                  })
                  .catch(done);
              }, 250);
            });
          }, 250);
        });
      });
    }, 500);
  });

  it('connection end', function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    const pool = base.createPool({ connectionLimit: 2 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);

      pool
        .getConnection()
        .then((conn) => {
          //check available connections in pool
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);

          conn
            .end()
            .then(() => {
              assert.equal(pool.activeConnections(), 0);
              assert.equal(pool.totalConnections(), 2);
              assert.equal(pool.idleConnections(), 2);
              return pool.end();
            })
            .then(() => {
              done();
            })
            .catch(done);
        })
        .catch(done);
    }, 500);
  });

  it('connection release alias', function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    const pool = base.createPool({ connectionLimit: 2 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);

      pool
        .getConnection()
        .then((conn) => {
          //check available connections in pool
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);

          conn
            .release()
            .then(() => {
              assert.equal(pool.activeConnections(), 0);
              assert.equal(pool.totalConnections(), 2);
              assert.equal(pool.idleConnections(), 2);
              return pool.end();
            })
            .then(() => {
              done();
            })
            .catch(done);
        })
        .catch(done);
    }, 500);
  });

  it('connection destroy', function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    const pool = base.createPool({ connectionLimit: 2 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);

      pool
        .getConnection()
        .then((conn) => {
          //check available connections in pool
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);

          conn.destroy();

          assert.equal(pool.activeConnections(), 0);
          assert.equal(pool.totalConnections(), 1);
          assert.equal(pool.idleConnections(), 1);
          return pool.end();
        })
        .then(() => {
          done();
        })
        .catch(done);
    }, 500);
  });

  it('pool rollback on connection return', function (done) {
    const pool = base.createPool({ connectionLimit: 1 });
    pool.getConnection().then((conn) => {
      conn
        .query('DROP TABLE IF EXISTS rollbackTable')
        .then(() => {
          return conn.query('CREATE TABLE rollbackTable(col varchar(10))');
        })
        .then(() => {
          return conn.query('set autocommit = 0');
        })
        .then(() => {
          return conn.beginTransaction();
        })
        .then(() => {
          return conn.query("INSERT INTO rollbackTable value ('test')");
        })
        .then(() => {
          return conn.release();
        })
        .then(() => {
          pool
            .getConnection()
            .then((conn) => {
              return conn.query('SELECT * FROM rollbackTable');
            })
            .then((res) => {
              assert.equal(res.length, 0);
              return conn.end();
            })
            .then(() => {
              return pool.end();
            })
            .then(() => {
              done();
            });
        })
        .catch(done);
    });
  });

  it('pool charset change', async function () {
    const pool = base.createPool({ connectionLimit: 1 });
    try {
      const query = "SET NAMES 'utf8'";

      const result1 = await pool.query(query);
      assert.equal(result1.constructor.name, 'OkPacket');

      const result2 = await pool.query({ sql: query });
      assert.equal(result2.constructor.name, 'OkPacket');
    } finally {
      await pool.end();
    }
  });

  it('pool batch', function (done) {
    let params = { connectionLimit: 1, resetAfterUse: false };
    const pool = base.createPool(params);
    pool
      .query('DROP TABLE IF EXISTS parse')
      .then(() => {
        return pool.query('CREATE TABLE parse(id int, id2 int, id3 int, t varchar(128), id4 int)');
      })
      .then(() => {
        return pool.batch('INSERT INTO `parse` values (1, ?, 2, ?, 3)', [
          [1, 'john'],
          [2, 'jack']
        ]);
      })
      .then((res) => {
        assert.equal(res.affectedRows, 2);
        return pool.query('select * from `parse`');
      })
      .then((res) => {
        assert.deepEqual(res, [
          {
            id: 1,
            id2: 1,
            id3: 2,
            t: 'john',
            id4: 3
          },
          {
            id: 1,
            id2: 2,
            id3: 2,
            t: 'jack',
            id4: 3
          }
        ]);
        return pool.end();
      })
      .then(() => {
        done();
      })
      .catch(done);
  });

  it('pool batch single array', async function () {
    const pool = base.createPool({ connectionLimit: 1, resetAfterUse: false });

    await pool.query('DROP TABLE IF EXISTS singleBatchArray');
    await pool.query('CREATE TABLE singleBatchArray(id int)');
    let res = await pool.batch('INSERT INTO `singleBatchArray` values (?)', [1, 2, 3]);
    assert.equal(res.affectedRows, 3);
    res = await pool.query('select * from `singleBatchArray`');
    assert.deepEqual(res, [
      {
        id: 1
      },
      {
        id: 2
      },
      {
        id: 3
      }
    ]);
    await pool.end();
  });

  it("ensure pipe ending doesn't stall connection", function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    //sequence engine only exist in MariaDB
    if (!shareConn.info.isMariaDB()) this.skip();
    const ver = process.version.substring(1).split('.');
    //stream.pipeline doesn't exist before node.js 8
    if (parseInt(ver[0]) < 10) this.skip();

    this.timeout(10000);
    const pool = base.createPool({ connectionLimit: 1 });

    pool
      .getConnection()
      .then((conn) => {
        let received = 0;
        const transformStream = new stream.Transform({
          objectMode: true,
          transform: function transformer(chunk, encoding, callback) {
            callback(
              null,
              JSON.stringify(chunk, (key, value) => (typeof value === 'bigint' ? value.toString() : value))
            );
            received++;
          }
        });

        const queryStream = conn.queryStream("SELECT seq ,REPEAT('a', 100) as val FROM seq_1_to_10000");
        const someWriterStream = fs.createWriteStream(fileName);

        stream.pipeline(queryStream, transformStream, someWriterStream, async (err) => {
          if (err) queryStream.close();
          assert.isTrue(received >= 0 && received < 10000, 'received ' + received + ' results');
          await conn.query('SELECT 1');
          await conn.end();
          await pool.end();
          done();
        });

        setTimeout(someWriterStream.destroy.bind(someWriterStream), 2);
      })
      .catch(done);
  });

  it("ensure pipe ending doesn't stall connection promise", async function () {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    //sequence engine only exist in MariaDB
    if (!shareConn.info.isMariaDB()) this.skip();
    const ver = process.version.substring(1).split('.');
    //promise pipeline doesn't exist before node.js 15.0
    if (parseInt(ver[0]) < 15) this.skip();

    this.timeout(10000);
    const pool = base.createPool({ connectionLimit: 1 });

    const conn = await pool.getConnection();
    let received = 0;
    const transformStream = new stream.Transform({
      objectMode: true,
      transform: function transformer(chunk, encoding, callback) {
        callback(
          null,
          JSON.stringify(chunk, (key, value) => (typeof value === 'bigint' ? value.toString() : value))
        );
        received++;
      }
    });

    const queryStream = conn.queryStream("SELECT seq ,REPEAT('a', 100) as val FROM seq_1_to_10000");
    const someWriterStream = fs.createWriteStream(fileName);
    someWriterStream.on('close', () => {
      queryStream.close();
    });

    setTimeout(someWriterStream.destroy.bind(someWriterStream), 2);
    try {
      const { pipeline } = require('stream/promises');
      await pipeline(queryStream, transformStream, someWriterStream);
      throw new Error('Error must have been thrown');
    } catch (e) {
      // eat expect error
    }
    assert.isTrue(received >= 0 && received < 10000, 'received ' + received + ' results');
    const res = await conn.query('SELECT 1');
    await conn.end();
    await pool.end();
  });

  it('test minimum idle decrease', function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    this.timeout(30000);
    const pool = base.createPool({
      connectionLimit: 10,
      minimumIdle: 8,
      idleTimeout: 1,
      acquireTimeout: 20000
    });

    const requests = [];
    for (let i = 0; i < 5000; i++) {
      requests.push(pool.query('SELECT ' + i));
    }

    var test = () => {
      Promise.all(requests)
        .then(() => {
          setTimeout(() => {
            assert.isTrue(
              pool.totalConnections() === 8 || pool.totalConnections() === 9 || pool.totalConnections() === 10
            );
            assert.isTrue(
              pool.idleConnections() === 8 || pool.idleConnections() === 9 || pool.idleConnections() === 10
            );
          }, 5);

          setTimeout(() => {
            //wait for 2 second > idleTimeout
            //minimumIdle-1 is possible after reaching idleTimeout and connection
            // is still not recreated
            assert.isTrue(pool.totalConnections() === 8 || pool.totalConnections() === 7);
            assert.isTrue(pool.idleConnections() === 8 || pool.idleConnections() === 7);
          }, 2000);

          setTimeout(async () => {
            //minimumIdle-1 is possible after reaching idleTimeout and connection
            // is still not recreated
            assert.isTrue(pool.totalConnections() === 8 || pool.totalConnections() === 7);
            assert.isTrue(pool.idleConnections() === 8 || pool.idleConnections() === 7);
            await pool.end();
            done();
          }, 3000);
        })
        .catch((err) => {
          pool.end();
          done(err);
        });
    };

    const waitServerConnections = (max) => {
      if (max > 0) {
        setTimeout(() => {
          if (pool.totalConnections() < 8) {
            waitServerConnections(max - 1);
          } else test();
        }, 1000);
      } else {
        done(new Error("pool doesn't have at least 8 connections after 10s"));
      }
    };
    waitServerConnections(10);
  });

  it('test minimum idle', function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    this.timeout(5000);
    const pool = base.createPool({
      connectionLimit: 10,
      minimumIdle: 4,
      idleTimeout: 2
    });

    setTimeout(() => {
      //minimumIdle-1 is possible after reaching idleTimeout and connection
      // is still not recreated
      assert.isTrue(pool.totalConnections() === 4 || pool.totalConnections() === 3);
      assert.isTrue(pool.idleConnections() === 4 || pool.idleConnections() === 3);
      pool
        .end()
        .then(() => done())
        .catch(done);
    }, 4000);
  });

  it('pool immediate error', function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    const pool = base.createPool({ connectionLimit: 1 });
    pool
      .getConnection()
      .then(() => {
        done(new Error('must have thrown an Exception'));
      })
      .catch((err) => {
        assert(err.message.includes('Cannot add request to pool, pool is closed'));
        assert.equal(err.sqlState, 'HY000');
        assert.equal(err.errno, 45027);
        assert.equal(err.code, 'ER_POOL_ALREADY_CLOSED');
        setTimeout(done, 200);
      });
    pool.end();
  });

  it('pool server defect timeout', async function () {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    this.timeout(50000);
    const proxy = new Proxy({
      port: Conf.baseConfig.port,
      host: Conf.baseConfig.host
    });
    await proxy.start();
    const initTime = Date.now();
    const pool = base.createPool({
      port: proxy.port(),
      acquireTimeout: 1000,
      minDelayValidation: 0,
      connectionLimit: 1
    });

    // test use proxy that stop answer for 1.5s,
    // with pool.getConnection with 1s timeout.
    // (minDelayValidation is set to 0, to ensure ping is done each time for existing connection)
    const conn = await pool.getConnection();
    await conn.release();
    await proxy.close();
    try {
      await pool.getConnection();
      throw new Error('must have thrown error !' + (Date.now() - initTime));
    } catch (err) {
      assert(err.message.includes('retrieve connection from pool timeout after'), err.message);
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.errno, 45028);
      assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');

      assert.isTrue(Date.now() - initTime > 995, 'expected > 1000, but was ' + (Date.now() - initTime));
      try {
        await proxy.resume();
        const conn2 = await pool.getConnection();
        await conn2.release();
      } catch (e2) {
        console.log(e2);
      } finally {
        await pool.end();
        proxy.close();
      }
    }
  });

  it('prepare cache reuse pool with reset', async function () {
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 3, 13)) this.skip();

    const pool = base.createPool({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 1,
      prepareCacheLength: 2,
      resetAfterUse: true
    });
    await pool.execute('select ?', [1]);
    let conn = await pool.getConnection();
    const prepareCache = conn.prepareCache;
    assert.equal(prepareCache.toString(), `info{cache:[${baseConfig.database}|select ?]}`);
    await conn.release();
    assert.equal(prepareCache.toString(), `info{cache:}`);

    await pool.execute('select ?', [1]);
    assert.equal(prepareCache.toString(), `info{cache:[${baseConfig.database}|select ?]}`);
    conn = await pool.getConnection();
    conn.execute('select ?', [2]);
    assert.equal(prepareCache.toString(), `info{cache:[${baseConfig.database}|select ?]}`);
    await conn.release();
    assert.equal(prepareCache.toString(), `info{cache:}`);
    pool.end();
  });

  it('ensure failing connection on pool not exiting application', async function () {
    this.timeout(5000);
    const pool = base.createPool({
      port: 8888,
      initializationTimeout: 100
    });

    // pool will throw an error after some time and must not exit test suite
    await new Promise((resolve, reject) => {
      new setTimeout(resolve, 3000);
    });
    await pool.end();
  });
});
