//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB plc

'use strict';

const base = require('../base.js');
const { assert } = require('chai');

// Pool.escape() takes the session state from one of the pool connections, idle or in use: with
// NO_BACKSLASH_ESCAPES, a quote must be doubled, not backslash-escaped (CONJS-368). It used to
// read none of the connections in use, so a saturated pool escaped with backslashes (CONJS-378).
describe('pool escape with NO_BACKSLASH_ESCAPES', () => {
  const sessionVariables = { sql_mode: 'NO_BACKSLASH_ESCAPES' };

  it('promise pool: all connections in use', async function () {
    if (base.isMaxscale()) this.skip();
    const pool = base.createPool({ connectionLimit: 2, sessionVariables });
    try {
      const conn1 = await pool.getConnection();
      const conn2 = await pool.getConnection();
      assert.equal(pool.activeConnections(), 2);
      assert.equal(pool.idleConnections(), 0);
      assert.equal(pool.escape("a'b"), "'a''b'");
      assert.equal(pool.escape("x' OR 1=1 -- "), "'x'' OR 1=1 -- '");
      assert.equal(pool.escape('a\\b'), "'a\\b'");
      assert.equal(pool.escapeId('good_`è`one'), '`good_``è``one`');

      // the escaped value stays a single string for the server
      const rows = await conn1.query(`SELECT ${pool.escape("x' OR 1=1 -- ")} AS v`);
      assert.equal(rows[0].v, "x' OR 1=1 -- ");

      conn1.release();
      conn2.release();
      assert.equal(pool.escape("a'b"), "'a''b'");
    } finally {
      await pool.end();
    }
  });

  it('pool without any connection yet', async function () {
    const pool = base.createPool({ connectionLimit: 1, sessionVariables });
    try {
      assert.equal(pool.escapeId('a`b'), '`a``b`');
      // the pool is creating its first connection: an error until it is there
      try {
        pool.escape('ab');
        throw new Error('must have thrown an error');
      } catch (err) {
        assert.equal(err.code, 'ER_ESCAPE_NO_CONNECTION');
      }
      await new Promise((resolve, reject) => {
        const retry = (attempt) => {
          try {
            assert.equal(pool.escape("a'b"), "'a''b'");
            resolve();
          } catch (err) {
            if (err.code !== 'ER_ESCAPE_NO_CONNECTION' || attempt > 100) return reject(err);
            setTimeout(() => retry(attempt + 1), 50);
          }
        };
        retry(0);
      });
    } finally {
      await pool.end();
    }
  });

  it('pool that cannot connect', async function () {
    const pool = base.createPool({ connectionLimit: 1, port: 1, initializationTimeout: 1000 });
    try {
      await new Promise((resolve, reject) => {
        const retry = (attempt) => {
          try {
            pool.escape("a'b");
            reject(new Error('must have thrown an error'));
          } catch (err) {
            if (err.code !== 'ER_ESCAPE_NO_CONNECTION') return reject(err);
            if (err.cause) return resolve();
            if (attempt > 100) return reject(new Error('no connection error reported'));
            setTimeout(() => retry(attempt + 1), 50);
          }
        };
        retry(0);
      });
    } finally {
      await pool.end().catch(() => {});
    }
  });

  it('callback pool: all connections in use', function (done) {
    if (base.isMaxscale()) this.skip();
    const pool = base.createPoolCallback({ connectionLimit: 1, sessionVariables });
    pool.getConnection((err, conn) => {
      if (err) return done(err);
      try {
        assert.equal(pool.idleConnections(), 0);
        assert.equal(pool.escape("a'b"), "'a''b'");
        assert.equal(pool.escape("x' OR 1=1 -- "), "'x'' OR 1=1 -- '");
      } catch (e) {
        conn.release();
        return done(e);
      }
      conn.release();
      pool.end(done);
    });
  });
});
