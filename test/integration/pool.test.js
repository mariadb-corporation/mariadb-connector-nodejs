//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import stream from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Proxy from '../tools/proxy';
import { createConnection, createPool, isMaxscale, utf8Collation } from '../base.js';
import { baseConfig } from '../conf.js';
import winston from 'winston';
import * as basePromise from '../../promise';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';

describe.concurrent('Pool', () => {
  const fileName = path.join(os.tmpdir(), Math.random() + 'tempStream.txt');
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(baseConfig);
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
    fs.unlink(fileName, (err) => {
      //eat
    });
  });

  test('pool metaAsArray', async function () {
    const pool = createPool({
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

  test('pool query stack trace', async function () {
    const pool = createPool({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 1,
      trace: true
    });
    try {
      await pool.query('wrong query');
      throw Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.stack.includes('pool.test.js:63:18'), err.stack);
    } finally {
      await pool.end();
    }
  });

  test('pool execute stack trace', async function () {
    const pool = createPool({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 1,
      trace: true
    });
    try {
      await pool.execute('wrong query');
      throw Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.stack.includes('pool.test.js:80:18'), err.stack);
    } finally {
      await pool.end();
    }
  });

  test('pool execute wrong param stack trace', async function () {
    const pool = createPool({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 1,
      trace: true
    });
    try {
      await pool.execute('SELECT ?', []);
      throw Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.stack.includes('pool.test.js:97:18'), err.stack);
    } finally {
      await pool.end();
    }
  });

  test('prepare cache reuse', async () => {
    const pool = createPool({
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
      pool.execute('select ?', [i]).catch(() => {});
      assert.equal(
        prepareCache.toString(),
        `info{cache:[${baseConfig.database}|select ?],[${baseConfig.database}|select 4]}`
      );
    }
    await pool.end();
  });

  test('prepare cache reuse with reset', async ({ skip }) => {
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 3, 13)) return skip();

    const pool = createPool({
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
      pool.execute('select ?', [i]).catch(() => {});
      assert.equal(
        prepareCache.toString(),
        `info{cache:[${baseConfig.database}|select ?],[${baseConfig.database}|select 4]}`
      );
    }
    await pool.end();
  });

  test('pool batch stack trace', async function () {
    const pool = createPool({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 1,
      trace: true
    });
    try {
      await pool.batch('WRONG COMMAND', [[1], [1]]);
      throw Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.stack.includes('pool.test.js:240:18'), err.stack);
    } finally {
      await pool.end();
    }
  });

  test('pool batch wrong param stack trace', async function () {
    const pool = createPool({
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
      assert.isTrue(err.stack.includes('pool.test.js:258:18'), err.stack);
    } finally {
      await pool.query('DROP TABLE test_batch');
      await pool.end();
    }
  });

  test('ending pool no active connection', async function () {
    const pool = createPool({
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
  }, 15000);

  test('ending pool with active connection', async function () {
    const pool = createPool({
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
  }, 15000);

  test('ending pool with active connection reaching end', async function () {
    const pool = createPool({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 2,
      trace: true
    });
    await new Promise((res) => setTimeout(() => res(), 100));
    const start = process.hrtime();
    pool.query('SELECT SLEEP(15)').catch(() => {});
    await new Promise((res) => setTimeout(() => res(), 100));
    await pool.end();

    // on windows, less accurate, such needs to have 11 too
    assert.isTrue(process.hrtime(start)[0] === 10 || process.hrtime(start)[0] === 11);
  }, 15000);

  test('pool escape', async ({ skip }) => {
    if (!utf8Collation()) return skip();
    const pool = createPool({ connectionLimit: 1 });
    const pool2 = createPool({ connectionLimit: 1, arrayParenthesis: true });
    await new Promise((resolve) => {
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
        resolve();
      });
    });
  });

  test('pool escape on init', async function () {
    const pool = createPool({ connectionLimit: 1 });
    assert.equal(pool.escape(new Date('1999-01-31 12:13:14.000')), "'1999-01-31 12:13:14'");
    assert.equal(pool.escape(new Date('1999-01-31 12:13:14.65')), "'1999-01-31 12:13:14.650'");
    assert.equal(pool.escapeId('good_$one'), '`good_$one`');
    assert.equal(pool.escapeId('f:a'), '`f:a`');
    assert.equal(pool.escapeId('good_`è`one'), '`good_``è``one`');

    await pool.end();
  });

  test('undefined query', async function () {
    const pool = createPool({ connectionLimit: 1 });
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

  test('undefined execute', async function () {
    const pool = createPool({ connectionLimit: 1 });
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

  test('undefined batch', async function () {
    const pool = createPool({ connectionLimit: 1 });
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

  test('undefined query', async function () {
    const pool = createPool({ connectionLimit: 1 });
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

  test('undefined batch', async function () {
    const pool = createPool({ connectionLimit: 1 });
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

  test('query with null placeholder', async function () {
    const pool = createPool({ connectionLimit: 1 });
    let rows = await pool.query('select ? as a', [null]);
    assert.deepEqual(rows, [{ a: null }]);
    await pool.end();
  });

  test('query with null placeholder no array', async function () {
    const pool = createPool({ connectionLimit: 1 });
    let rows = await pool.query('select ? as a', null);
    assert.deepEqual(rows, [{ a: null }]);
    await pool.end();
  });

  test('pool with wrong authentication', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const initTime = Date.now();
    const pool = createPool({
      acquireTimeout: 4000,
      initializationTimeout: 2000,
      user: 'wrongAuthentication',
      allowPublicKeyRetrieval: true
    });

    setTimeout(async () => {
      try {
        await pool.query('SELECT 2');
        pool.end();
        throw new Error('must have thrown error');
      } catch (err) {
        assert(Date.now() - initTime >= 3980, 'expected > 4s, but was ' + (Date.now() - initTime));
        assert.isTrue(err.message.includes('Error during pool initialization') || err.message.includes('pool timeout'));
        assert.isNotNull(err.cause);
        assert.isTrue(
          err.cause.errno === 1524 ||
            err.cause.errno === 1045 ||
            err.cause.errno === 1698 ||
            err.cause.errno === 45025 ||
            err.cause.errno === 45028 ||
            err.cause.errno === 45044,
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
      assert.isTrue(err.message.includes('Error during pool initialization') || err.message.includes('pool timeout'));
      assert.isNotNull(err.cause);
      assert.isTrue(
        err.cause.errno === 1524 ||
          err.cause.errno === 1045 ||
          err.cause.errno === 1698 ||
          err.cause.errno === 45025 ||
          err.cause.errno === 45028 ||
          err.cause.errno === 45044,
        err.cause.message
      );
      try {
        await pool.query('SELECT 3');
        throw new Error('must have thrown error');
      } catch (err) {
        assert(Date.now() - initTime >= 3980, 'expected > 4s, but was ' + (Date.now() - initTime));
        assert.isTrue(err.message.includes('Error during pool initialization') || err.message.includes('pool timeout'));
        assert.isNotNull(err.cause);
        assert.isTrue(
          err.cause.errno === 1524 ||
            err.cause.errno === 1045 ||
            err.cause.errno === 1698 ||
            err.cause.errno === 45028 ||
            err.cause.errno === 45025 ||
            err.cause.errno === 45044,
          err.cause.message
        );
      } finally {
        await pool.end();
      }
    }
  }, 10000);

  test('pool execute timeout', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPool({
      connectionLimit: 1,
      acquireTimeout: 400
    });
    assert.isFalse(pool.closed);
    pool.query('SELECT SLEEP(1)');
    try {
      await pool.execute('SELECT 1');
      throw new Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.message.includes('pool timeout: failed to retrieve a connection from pool after'));
    } finally {
      await pool.end();
      assert.isTrue(pool.closed);
    }
  }, 10000);

  test('pool batch timeout', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPool({
      connectionLimit: 1,
      acquireTimeout: 400
    });
    pool.query('SELECT SLEEP(1)');
    try {
      await pool.batch('SELECT 1', [[1]]);
      throw new Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.message.includes('pool timeout: failed to retrieve a connection from pool after'));
    } finally {
      await pool.end();
    }
  }, 10000);

  test('pool error event', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPool({
      acquireTimeout: 4000,
      initializationTimeout: 2000,
      allowPublicKeyRetrieval: true,
      user: 'wrongAuthentication'
    });

    await new Promise(function (resolver, rejecter) {
      pool.on('error', (err) => {
        assert.isTrue(err.message.includes('Error during pool initialization'));
        assert.isNotNull(err.cause);
        assert.isTrue(
          err.cause.errno === 1524 ||
            err.cause.errno === 1045 ||
            err.cause.errno === 1698 ||
            err.cause.errno === 45028 ||
            err.cause.errno === 45025 ||
            err.cause.errno === 45044,
          err.cause.message
        );
        pool.end();
        resolver();
      });
    });
  }, 10000);

  test('pool error fail connection', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const initTime = Date.now();
    const pool = createPool({
      acquireTimeout: 4000,
      initializationTimeout: 2000,
      host: 'wronghost'
    });

    await new Promise(function (resolver, rejecter) {
      pool.on('error', async (err) => {
        console.log(err.message);
        assert(Date.now() - initTime >= 1980, 'expected > 2s, but was ' + (Date.now() - initTime));
        assert.isTrue(err.message.includes('Error during pool initialization'));
        await pool.end();
        resolver();
      });
    });
  }, 10000);

  test('pool with wrong authentication connection', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    let err;
    let pool;
    try {
      pool = createPool({
        acquireTimeout: 4000,
        initializationTimeout: 2000,
        user: 'wrongAuthentication',
        allowPublicKeyRetrieval: true
      });
      await pool.getConnection();
      throw new Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.message.includes('Error during pool initialization') || err.message.includes('pool timeout'));
    }
    try {
      await pool.getConnection();
      throw new Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.message.includes('Error during pool initialization') || err.message.includes('pool timeout'));
    } finally {
      await pool.end();
    }
  }, 15000);

  test('create pool', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPool({ connectionLimit: 1 });
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
  }, 5000);

  test('pool execute', async function () {
    const pool = createPool({ connectionLimit: 1 });
    const res = await pool.execute('SELECT ? as a', [5]);
    assert.isTrue(res[0].a === 5 || res[0].a === 5n);
    await pool.end();
  });

  test('create pool with multipleStatement', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPool({
      connectionLimit: 5,
      multipleStatements: true
    });

    const results = await pool.query("select '1'; select '2'");
    assert.deepEqual(results, [[{ 1: '1' }], [{ 2: '2' }]]);
    await pool.end();
  }, 5000);

  test('ensure commit', async function () {
    await shareConn.query('DROP TABLE IF EXISTS ensureCommit');
    await shareConn.query('CREATE TABLE ensureCommit(firstName varchar(32))');
    await shareConn.query("INSERT INTO ensureCommit values ('john')");

    const pool = createPool({ connectionLimit: 1 });
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

  test('pool without control after use', async function () {
    await shareConn.query('DROP TABLE IF EXISTS ensureCommit');
    await shareConn.query('CREATE TABLE ensureCommit(firstName varchar(32))');
    await shareConn.query("INSERT INTO ensureCommit values ('john')");
    const pool = createPool({
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

  test('double end', async function () {
    const pool = createPool({ connectionLimit: 1 });
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

  test('pool ending during requests', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPool({ connectionLimit: 1 });
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
  }, 20000);

  test('pool wrong query', async function () {
    const pool = createPool({ connectionLimit: 1 });
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
      await pool.end();
    }
  }, 5000);

  test('pool getConnection after close', async function () {
    const pool = createPool({ connectionLimit: 1 });
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

  test('pool query after close', async function () {
    const pool = createPool({ connectionLimit: 1 });
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

  test('pool getConnection timeout', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPool({ connectionLimit: 1, acquireTimeout: 200 });
    let errorThrown = false;
    await new Promise((resolve, reject) => {
      pool
        .query('SELECT SLEEP(1)')
        .then(() => {
          return pool.end();
        })
        .then(() => {
          assert.isOk(errorThrown);
          resolve();
        })
        .catch(reject);

      pool.getConnection().catch((err) => {
        assert(err.message.includes('pool timeout: failed to retrieve a connection from pool after'));
        assert(err.message.includes('(pool connections: active=1 idle=0 limit=1)'));
        assert.equal(err.sqlState, 'HY000');
        assert.equal(err.errno, 45028);
        assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
        errorThrown = true;
      });
    });
  });

  test('pool getConnection timeout with leak', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    let tmpLogFile = path.join(os.tmpdir(), 'logFile.txt');
    try {
      fs.unlinkSync(tmpLogFile);
    } catch (e) {}
    let logger = winston.createLogger({
      transports: [new winston.transports.File({ filename: tmpLogFile })]
    });
    const pool = createPool({
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
    await new Promise((resolve, reject) => {
      let errorThrown = false;
      pool
        .query('SELECT SLEEP(1)')
        .then(async () => {
          await pool.end();
          assert.isOk(errorThrown);
          //wait 100ms to ensure stream has been written
          setTimeout(() => {
            const data = fs.readFileSync(tmpLogFile, 'utf8');
            assert.isTrue(data.includes('A possible connection leak on thread'));
            assert.isTrue(data.includes('was returned to pool'));
            logger.close();
            try {
              fs.unlinkSync(tmpLogFile);
            } catch (e) {}
            resolve();
          }, 100);
        })
        .catch(reject);
      setTimeout(() => {
        pool.getConnection().catch((err) => {
          assert(err.message.includes('pool timeout: failed to retrieve a connection from pool after'));
          assert(err.message.includes('(pool connections: active=1 idle=0 leak=1 limit=1)'));
          assert.equal(err.sqlState, 'HY000');
          assert.equal(err.errno, 45028);
          assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
          errorThrown = true;
        });
      }, 50);
    });
  });

  test('pool leakDetectionTimeout timeout', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPool({
      connectionLimit: 1,
      acquireTimeout: 200,
      leakDetectionTimeout: 300
    });
    const conn = await pool.getConnection();
    await conn.query('SELECT SLEEP(1)');
    await conn.release();
    await pool.end();
  });

  test('pool reset validation', async function () {
    const conf = { connectionLimit: 5, timezone: 'Z', initSql: 'set @aa= 1' };
    if (shareConn.info.isMariaDB()) {
      conf['queryTimeout'] = 10000;
    }
    const pool = createPool(conf);
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

  test('pool getConnection timeout recovery', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPool({
      connectionLimit: 2,
      acquireTimeout: 800,
      leakDetectionTimeout: 1250
    });
    await new Promise((resolve, reject) => {
      let errorThrown = false;
      setTimeout(() => {
        for (let i = 0; i < 2; i++) {
          pool.query('SELECT SLEEP(1)').catch(reject);
        }

        for (let i = 0; i < 2; i++) {
          pool
            .getConnection()
            .then(() => reject(new Error('must have thrown error')))
            .catch((err) => {
              assert(err.message.includes('pool timeout: failed to retrieve a connection from pool after'));
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
                reject(err);
              });
          }, 1100);
        }
        setTimeout(async () => {
          const conn = await pool.getConnection();
          assert.isOk(errorThrown);
          await conn.release();
          await pool.end();
          resolve();
        }, 1200);
      }, 1000);
    });
  }, 5000);

  test('pool query timeout', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPool({ connectionLimit: 1, acquireTimeout: 500 });
    const initTime = Date.now();
    pool.query('SELECT SLEEP(2)').finally(() => {
      pool.end();
    });
    await new Promise((resolve, reject) => {
      pool
        .query('SELECT 1')
        .then(() => {
          reject(new Error('must have thrown error 1 !'));
        })
        .catch((err) => {
          try {
            assert(err.message.includes('pool timeout'));
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
          reject(new Error('must have thrown error 2 !'));
        })
        .catch((err) => {
          const elapse = Date.now() - initTime;
          try {
            assert(err.message.includes('retrieve connection from pool timeout'));
            assert.equal(err.sqlState, 'HY000');
            assert.equal(err.errno, 45028);
            assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
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
          reject(new Error('must have thrown error 3 !'));
        } catch (err) {
          try {
            assert.isTrue(
              err.message.includes('pool timeout: failed to retrieve a connection from pool after'),
              err.message
            );
            assert.equal(err.sqlState, 'HY000');
            assert.equal(err.errno, 45028);
            assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
            const elapse = Date.now() - initTime;
            assert.isTrue(elapse >= 670 && elapse < 850, 'elapse time was ' + elapse + ' but must be just after 700');
            resolve();
          } catch (e) {
            console.log(e);
            reject(e);
          }
        }
      }, 200);
    });
  }, 5000);

  test('pool grow', async () => {
    const pool = createPool({ connectionLimit: 10 });
    await new Promise((resolve, reject) => {
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
            if (!closed) reject(err);
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
              if (baseConfig.host === 'localhost') {
                assert.equal(pool.activeConnections(), 0);
                assert.equal(pool.totalConnections(), 0);
                assert.equal(pool.idleConnections(), 0);
                assert.equal(pool.taskQueueSize(), 0);
              }
              resolve();
            } catch (e) {
              reject(e);
            }
          }, 5000);
        });
      }, 8000);
    });
  }, 20000);

  test('connection fail handling', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPool({
      connectionLimit: 2,
      minDelayValidation: 200
    });
    await new Promise((resolve, reject) => {
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
          reject(new Error('must have thrown error'));
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
            resolve();
          } catch (e) {
            reject(e);
          }
        }
      }, 500);
    });
  });

  test('query fail handling', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPool({
      connectionLimit: 2,
      minDelayValidation: 200
    });
    await new Promise((resolve, reject) => {
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
                  if (pool.totalConnections() === 2) {
                    assert.equal(pool.activeConnections(), 0);
                    assert.equal(pool.totalConnections(), 2);
                    assert.equal(pool.idleConnections(), 2);
                    assert.equal(pool.taskQueueSize(), 0);
                    pool
                      .end()
                      .then(() => {
                        resolve();
                      })
                      .catch(reject);
                  } else {
                    setTimeout(() => {
                      //connection recreated
                      assert.equal(pool.activeConnections(), 0);
                      assert.equal(pool.totalConnections(), 2);
                      assert.equal(pool.idleConnections(), 2);
                      assert.equal(pool.taskQueueSize(), 0);
                      pool
                        .end()
                        .then(() => {
                          resolve();
                        })
                        .catch(reject);
                    }, 250);
                  }
                }, 250);
              });
            }, 250);
          });
        });
      }, 500);
    });
  }, 20000);

  test('connection end', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPool({ connectionLimit: 2 });
    await new Promise((resolve, reject) => {
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
                resolve();
              })
              .catch(reject);
          })
          .catch(reject);
      }, 500);
    });
  });

  test('connection release alias', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPool({ connectionLimit: 2 });
    await new Promise((resolve, reject) => {
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
                resolve();
              })
              .catch(reject);
          })
          .catch(reject);
      }, 500);
    });
  });

  test('connection destroy', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPool({ connectionLimit: 2 });

    await new Promise((resolve) => setTimeout(resolve, 500));

    //check available connections in pool
    assert.equal(pool.activeConnections(), 0);
    assert.equal(pool.totalConnections(), 2);
    assert.equal(pool.idleConnections(), 2);

    const conn = await pool.getConnection();
    //check available connections in pool
    assert.equal(pool.activeConnections(), 1);
    assert.equal(pool.totalConnections(), 2);
    assert.equal(pool.idleConnections(), 1);

    conn.destroy();

    assert.equal(pool.activeConnections(), 0);
    assert.equal(pool.totalConnections(), 1);
    assert.equal(pool.idleConnections(), 1);
    await pool.end();
  });

  test('pool rollback on connection return', async () => {
    const pool = createPool({ connectionLimit: 1 });
    let conn = await pool.getConnection();
    await conn.query('DROP TABLE IF EXISTS rollbackTable');
    await conn.query('CREATE TABLE rollbackTable(col varchar(10))');
    await conn.query('set autocommit = 0');
    await conn.beginTransaction();
    await conn.query("INSERT INTO rollbackTable value ('test')");
    await conn.release();
    conn = await pool.getConnection();

    const res = await conn.query('SELECT * FROM rollbackTable');
    assert.equal(res.length, 0);
    await conn.end();
    await pool.end();
  });

  test('pool charset change', async function () {
    const pool = createPool({ connectionLimit: 1 });
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

  test('pool batch', async () => {
    let params = { connectionLimit: 1, resetAfterUse: false };
    const pool = createPool(params);
    await pool.query('DROP TABLE IF EXISTS parse');
    await pool.query('CREATE TABLE parse(id int, id2 int, id3 int, t varchar(128), id4 int)');
    let res = await pool.batch('INSERT INTO `parse` values (1, ?, 2, ?, 3)', [
      [1, 'john'],
      [2, 'jack']
    ]);
    if (res.affectedRows) {
      assert.equal(res.affectedRows, 2);
    } else {
      assert.deepEqual(res, [
        {
          affectedRows: 1,
          insertId: 0n,
          warningStatus: 0
        },
        {
          affectedRows: 1,
          insertId: 0n,
          warningStatus: 0
        }
      ]);
    }
    res = await pool.query('select * from `parse`');
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
    await pool.end();
  });

  test('pool batch single array', async function () {
    const config = baseConfig;
    const poolString = `mariadb://${config.user}${config.password ? ':' + config.password : ''}@${
      config.host
    }:${config.port}/${config.database}?connectionLimit=1&resetAfterUse=false`;
    const pool = basePromise.createPool(poolString);

    await pool.query('DROP TABLE IF EXISTS singleBatchArray');
    await pool.query('CREATE TABLE singleBatchArray(id int)');
    let res = await pool.batch('INSERT INTO `singleBatchArray` values (?)', [1, 2, 3]);
    if (res.affectedRows) {
      assert.equal(res.affectedRows, 3);
    } else {
      assert.deepEqual(res, [
        {
          affectedRows: 1,
          insertId: 0n,
          warningStatus: 0
        },
        {
          affectedRows: 1,
          insertId: 0n,
          warningStatus: 0
        },
        {
          affectedRows: 1,
          insertId: 0n,
          warningStatus: 0
        }
      ]);
    }
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

  test("ensure pipe ending doesn't stall connection", async ({ skip }) => {
    if (isMaxscale(shareConn) || !shareConn.info.isMariaDB()) return skip();
    const ver = process.version.substring(1).split('.');
    //stream.pipeline doesn't exist before node.js 8
    if (parseInt(ver[0]) < 10) return skip();

    const pool = createPool({ connectionLimit: 1 });
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
    await new Promise((resolve, reject) => {
      stream.pipeline(queryStream, transformStream, someWriterStream, async (err) => {
        if (err) queryStream.close();
        assert.isTrue(received >= 0 && received < 10000, 'received ' + received + ' results');
        await conn.query('SELECT 1');
        await conn.end();
        await pool.end();
        resolve();
      });

      setTimeout(someWriterStream.destroy.bind(someWriterStream), 2);
    });
  }, 10000);

  test("ensure pipe ending doesn't stall connection promise", async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    //sequence engine only exists in MariaDB
    if (!shareConn.info.isMariaDB()) return skip();
    const ver = process.version.substring(1).split('.');
    //promise pipeline doesn't exist before node.js 15.0
    if (parseInt(ver[0]) < 15) return skip();

    const pool = createPool({ connectionLimit: 1 });

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
      const { pipeline } = await import('stream/promises');
      await pipeline(queryStream, transformStream, someWriterStream);
      throw new Error('Error must have been thrown');
    } catch (e) {
      // eat expect error
    }
    assert.isTrue(received >= 0 && received < 10000, 'received ' + received + ' results');
    const res = await conn.query('SELECT 1');
    await conn.end();
    await pool.end();
  }, 10000);

  test('test minimum idle decrease', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPool({
      connectionLimit: 10,
      minimumIdle: 8,
      idleTimeout: 1,
      acquireTimeout: 20000
    });

    const requests = [];
    for (let i = 0; i < 5000; i++) {
      requests.push(pool.query('SELECT ' + i));
    }
    await new Promise((resolve, reject) => {
      const test = () => {
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
              resolve();
            }, 3000);
          })
          .catch((err) => {
            pool.end();
            reject(err);
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
          reject(new Error("pool doesn't have at least 8 connections after 10s"));
        }
      };
      waitServerConnections(10);
    });
  }, 30000);

  test('test minimum idle', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPool({
      connectionLimit: 10,
      minimumIdle: 4,
      idleTimeout: 2
    });
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();

    await new Promise((resolve) => setTimeout(resolve, 4000));
    //minimumIdle-1 is possible after reaching idleTimeout and connection
    // is still not recreated
    assert.isTrue(pool.totalConnections() === 4 || pool.totalConnections() === 3);
    assert.isTrue(pool.idleConnections() === 4 || pool.idleConnections() === 3);
    await pool.end();
  }, 5000);

  test('test minimum idle 0', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPool({
      connectionLimit: 10,
      minimumIdle: 0,
      idleTimeout: 2
    });

    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();

    await new Promise((accept, reject) => {
      setTimeout(() => {
        assert.isTrue(pool.totalConnections() === 0);
        assert.isTrue(pool.idleConnections() === 0);
        pool
          .end()
          .then(() => accept())
          .catch(reject);
      }, 4000);
    });
  }, 10000);

  test('pool immediate error', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPool({ connectionLimit: 1 });
    await new Promise((resolve, reject) => {
      pool
        .getConnection()
        .then(() => {
          reject(new Error('must have thrown an Exception'));
        })
        .catch((err) => {
          assert(err.message.includes('pool is ending, connection request aborted'));
          assert.equal(err.sqlState, 'HY000');
          assert.equal(err.errno, 45037);
          assert.equal(err.code, 'ER_CLOSING_POOL');
          setTimeout(resolve, 200);
        });
      pool.end();
    });
  });

  test('pool server defect timeout', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const proxy = new Proxy({
      port: baseConfig.port,
      host: baseConfig.host
    });
    await proxy.start();
    const initTime = Date.now();
    const pool = createPool({
      port: proxy.port(),
      acquireTimeout: 1000,
      minDelayValidation: 0,
      connectionLimit: 1
    });

    // test uses a proxy that stops answer for 1.5s,
    // with pool.getConnection with 1s timeout.
    // (minDelayValidation is set to 0 to ensure ping is done each time for existing connections)
    const conn = await pool.getConnection();
    await conn.release();
    await proxy.close();
    try {
      await pool.getConnection();
      throw new Error('must have thrown error !' + (Date.now() - initTime));
    } catch (err) {
      assert(err.message.includes('pool timeout: failed to retrieve a connection from pool after'), err.message);
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
  }, 50000);

  test('prepare cache reuse pool with reset', async ({ skip }) => {
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 3, 13)) return skip();

    const pool = createPool({
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
    await pool.end();
  });

  test('ensure failing connection on pool not exiting application', async function () {
    const pool = createPool({
      port: 8888,
      initializationTimeout: 100
    });
    pool.on('error', console.log);
    // pool will throw an error after some time and must not exit test suite
    await new Promise((resolve, reject) => {
      new setTimeout(resolve, 3000);
    });
    await pool.end();
  }, 5000);

  test('pool timeout', async ({ skip }) => {
    const pool = createPool({
      connectionLimit: 1,
      trace: true,
      acquireTimeout: 500,
      connectTimeout: 100,
      initializationTimeout: 400,
      port: 45684
    });

    await new Promise((res) => setTimeout(() => res(), 600));
    try {
      await pool.query('SELECT 1');
    } catch (err) {
      const ver = process.version.substring(1).split('.');
      //on node.js 16+ error will have cause error
      if (parseInt(ver[0]) < 16) {
        await pool.end();
        return skip();
      }
      assert.isNotNull(err.cause);
    }
    await pool.end();
  }, 15000);

  test('pool ensure multiple query', async function () {
    const pool = createPool({ connectionLimit: 2 });
    await new Promise((res) =>
      setTimeout(async () => {
        try {
          await pool.query('SELECT ?', [1]);
          await pool.query('SELECT ?', [2]);
        } finally {
          await pool.end();
        }
        res();
      }, 100)
    );
  });

  test('pool.toString', async function () {
    const pool = createPool({ connectionLimit: 1 });
    await pool.query('DO 1');
    assert.equal('poolPromise(active=0 idle=1 limit=1)', pool.toString());
    await pool.end();
  });

  test('pool with connection timeout', async function () {
    const pool = createPool({ acquireTimeout: 200, connectionLimit: 1, connectTimeout: 0.0001 });
    try {
      const conn = await pool.getConnection();
      // must normally fail, but in case having a superfast host
      conn.release();
    } catch (err) {
      assert.isNotNull(err.cause);
    }
    await new Promise((r) => setTimeout(r, 50));
    await pool.end();
  });
});
