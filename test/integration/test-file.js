//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

const basePromise = require('../../promise');
const baseCallback = require('../../callback');
require('../base.js');
const { assert } = require('chai');
const Conf = require('../conf');
const base = require('../base');
const { isXpand } = require('../base');

describe('sql file import', () => {
  let maxAllowedSize;
  before(async function () {
    const row = await shareConn.query('SELECT @@max_allowed_packet as t');
    maxAllowedSize = Number(row[0].t);
  });

  beforeEach(async function () {
    if (process.env.srv === 'skysql-ha') this.skip();
    await shareConn.query('DROP DATABASE IF EXISTS fimp');
    await shareConn.query('CREATE DATABASE IF NOT EXISTS fimp');
    await shareConn.query('FLUSH TABLES');
  });

  afterEach(async function () {
    if (process.env.srv === 'skysql-ha') this.skip();
    await shareConn.query('DROP DATABASE IF EXISTS fimp');
  });

  describe('promise', () => {
    describe('base promise', () => {
      it('without file name', async function () {
        try {
          await basePromise.importFile(Object.assign({}, Conf.baseConfig));
          throw new Error('must have thrown error');
        } catch (err) {
          assert.equal(err.errno, 45052);
          assert.equal(err.code, 'ER_MISSING_SQL_PARAMETER');
          assert.isTrue(err.message.includes('SQL file parameter is mandatory'));
          assert.equal(err.sqlState, 'HY000');
        }
      });

      it('simple file import with direct connection options', async function () {
        if (process.env.srv === 'skysql-ha') this.skip();
        this.timeout(30000);
        await basePromise.importFile(
          Object.assign({}, Conf.baseConfig, { file: __dirname + '/../tools/data-dump.sql', database: 'fimp' })
        );
        await ensureLoaded();
      });

      it('big file import with direct connection options', async function () {
        if (process.env.srv === 'skysql-ha' || isXpand()) this.skip();
        this.timeout(300000);
        if (maxAllowedSize <= 32000000) return this.skip();
        await basePromise.importFile(
          Object.assign({}, Conf.baseConfig, { file: __dirname + '/../tools/data-dump2.sql', database: 'fimp' })
        );
        await ensureLoaded();
      });

      it('no database selected', async function () {
        if (process.env.srv === 'skysql-ha') this.skip();
        this.timeout(30000);
        try {
          await basePromise.importFile(
            Object.assign({}, Conf.baseConfig, { file: __dirname + '/../tools/data-dump.sql', database: null })
          );
          throw new Error('expected to throw an error');
        } catch (err) {
          assert.equal(err.errno, 45055);
          assert.equal(err.sqlState, 'HY000');
          assert.equal(err.code, 'ER_MISSING_DATABASE_PARAMETER');
          assert.isTrue(!err.fatal);
          assert.ok(err.message.includes('Database parameter is not set and no database is selected'));
        }
      });
    });

    describe('base connection', () => {
      it('missing options', async function () {
        if (process.env.srv === 'skysql-ha') this.skip();
        this.timeout(30000);
        try {
          await shareConn.importFile();
          throw new Error('expected to throw an error');
        } catch (err) {
          assert.equal(err.errno, 45052);
          assert.equal(err.sqlState, 'HY000');
          assert.equal(err.code, 'ER_MISSING_SQL_PARAMETER');
          assert.isTrue(!err.fatal);
          assert.ok(err.message.includes('SQL file parameter is mandatory'));
        }
      });

      it('wrong file options', async function () {
        if (process.env.srv === 'skysql-ha') this.skip();
        this.timeout(30000);
        try {
          await shareConn.importFile({ file: '/tt' });
          throw new Error('expected to throw an error');
        } catch (err) {
          assert.equal(err.errno, 45053);
          assert.equal(err.sqlState, 'HY000');
          assert.equal(err.code, 'ER_MISSING_SQL_FILE');
          assert.isTrue(!err.fatal);
          assert.ok(err.message.includes("SQL file parameter '/tt' doesn't exists"));
        }
      });
      it('simple file import', async function () {
        if (process.env.srv === 'skysql-ha') this.skip();
        this.timeout(30000);
        await shareConn.importFile({ file: __dirname + '/../tools/data-dump.sql', database: 'fimp' });
        const res = await shareConn.query('SELECT DATABASE() as db');
        assert.equal(res[0].db, Conf.baseConfig.database);
        await ensureLoaded();
      });

      it('simple file import without initial import ', async function () {
        if (process.env.srv === 'skysql-ha') this.skip();
        this.timeout(30000);
        const conn = await base.createConnection({ database: null });
        try {
          await conn.importFile({ file: __dirname + '/../tools/data-dump.sql', database: 'fimp' });
          const res = await conn.query('SELECT DATABASE() as db');
          assert.equal(res[0].db, 'fimp');
          await ensureLoaded();
        } finally {
          conn.end();
        }
      });
    });

    describe('base pool', () => {
      it('without file name', async function () {
        const pool = base.createPool({
          connectionLimit: 1
        });
        try {
          await pool.importFile(null);
          throw new Error('must have thrown error');
        } catch (err) {
          assert.equal(err.errno, 45052);
          assert.equal(err.code, 'ER_MISSING_SQL_PARAMETER');
          assert.isTrue(err.message.includes('SQL file parameter is mandatory'));
          assert.equal(err.sqlState, 'HY000');
        }
        await pool.end();
      });

      it('pool import', async function () {
        if (process.env.srv === 'skysql-ha') this.skip();
        this.timeout(30000);
        const pool = base.createPool({
          connectionLimit: 1
        });
        await pool.importFile({ file: __dirname + '/../tools/data-dump.sql', database: 'fimp' });
        await ensureLoaded();
        await pool.end();
      });

      it('no database selected', async function () {
        if (process.env.srv === 'skysql-ha') this.skip();
        this.timeout(30000);
        const pool = base.createPool({
          connectionLimit: 1,
          database: null
        });
        try {
          await pool.importFile({ file: __dirname + '/../tools/data-dump.sql' });
          throw new Error('expected to throw an error');
        } catch (err) {
          assert.equal(err.errno, 45055);
          assert.equal(err.sqlState, 'HY000');
          assert.equal(err.code, 'ER_MISSING_DATABASE_PARAMETER');
          assert.isTrue(!err.fatal);
          assert.ok(err.message.includes('Database parameter is not set and no database is selected'));
        } finally {
          await pool.end();
        }
      });

      it('Error in file', async function () {
        if (process.env.srv === 'skysql-ha' || process.env.srv === 'xpand') this.skip();
        this.timeout(30000);
        const conn = await base.createConnection({});
        try {
          await conn.importFile({ file: __dirname + '/../tools/data-dump-err.sql' });
          throw new Error('expected to throw an error');
        } catch (err) {
          if (err.errno === 1062) {
            assert.equal(err.sqlState, '23000');
            assert.equal(err.code, 'ER_DUP_ENTRY');
            assert.isTrue(!err.fatal);
            assert.ok(err.message.includes('Duplicate entry'));
          } else if (err.errno === 1180) {
            assert.equal(err.sqlState, 'HY000');
            assert.equal(err.code, 'ER_ERROR_DURING_COMMIT');
            assert.isTrue(!err.fatal);
            assert.ok(err.message.includes('Operation not permitted'));
          } else throw err;
        } finally {
          await conn.end();
        }
      });
    });
  });

  describe('callback', () => {
    describe('base callback', () => {
      it('without file name', function (done) {
        baseCallback.importFile(Object.assign({}, Conf.baseConfig), (err) => {
          if (!err) return done(new Error('must have thrown error'));
          assert.equal(err.errno, 45052);
          assert.equal(err.code, 'ER_MISSING_SQL_PARAMETER');
          assert.isTrue(err.message.includes('SQL file parameter is mandatory'));
          assert.equal(err.sqlState, 'HY000');
          done();
        });
      });

      it('simple file import without callback', function (done) {
        if (process.env.srv === 'skysql-ha') this.skip();
        this.timeout(30000);
        baseCallback.importFile(
          Object.assign({}, Conf.baseConfig, { file: __dirname + '/../tools/data-dump.sql', database: 'fimp' })
        );
        const conn = base.createCallbackConnection();
        conn.connect((err) => {
          if (err) {
            done(err);
          } else {
            const inter = setInterval(function () {
              conn.query('select count(*) as c from fimp.post', (err, res) => {
                if (res && res[0] && res[0].c == 3) {
                  clearInterval(inter);
                  conn.end();
                  done();
                }
              });
            }, 100);
          }
        });
      });

      it('simple file import with direct connection options', function (done) {
        if (process.env.srv === 'skysql-ha') this.skip();
        this.timeout(30000);
        baseCallback.importFile(
          Object.assign({}, Conf.baseConfig, { file: __dirname + '/../tools/data-dump.sql', database: 'fimp' }),
          (err) => {
            if (err) {
              done(err);
            } else {
              ensureLoadedCb(done);
            }
          }
        );
      });

      it('big file import with direct connection options', function (done) {
        // skipping if it takes too long
        if (process.env.srv === 'skysql-ha' || isXpand()) this.skip();
        this.timeout(300000);
        if (maxAllowedSize <= 32000000) return this.skip();
        baseCallback.importFile(
          Object.assign({}, Conf.baseConfig, { file: __dirname + '/../tools/data-dump2.sql', database: 'fimp' }),
          (err) => {
            if (err) {
              done(err);
            } else {
              ensureLoadedCb(done);
            }
          }
        );
      });

      it('no database selected', function (done) {
        if (process.env.srv === 'skysql-ha') this.skip();
        this.timeout(30000);
        baseCallback.importFile(
          Object.assign({}, Conf.baseConfig, { file: __dirname + '/../tools/data-dump.sql', database: null }),
          (err) => {
            if (!err) {
              done(new Error('expected to throw an error'));
            } else {
              assert.equal(err.errno, 45055);
              assert.equal(err.sqlState, 'HY000');
              assert.equal(err.code, 'ER_MISSING_DATABASE_PARAMETER');
              assert.isTrue(!err.fatal);
              assert.ok(err.message.includes('Database parameter is not set and no database is selected'));
              done();
            }
          }
        );
      });

      it('error in import file', function (done) {
        if (process.env.srv === 'skysql-ha' || process.env.srv === 'xpand') this.skip();
        this.timeout(30000);
        baseCallback.importFile(
          Object.assign({}, Conf.baseConfig, { file: __dirname + '/../tools/data-dump-err.sql' }),
          (err) => {
            if (!err) {
              done(new Error('expected to throw an error'));
            } else {
              if (err.errno === 1062) {
                assert.equal(err.sqlState, '23000');
                assert.equal(err.code, 'ER_DUP_ENTRY');
                assert.isTrue(!err.fatal);
                assert.ok(err.message.includes('Duplicate entry'));
                done();
              } else if (err.errno === 1180) {
                assert.equal(err.sqlState, 'HY000');
                assert.equal(err.code, 'ER_ERROR_DURING_COMMIT');
                assert.isTrue(!err.fatal);
                assert.ok(err.message.includes('Operation not permitted'));
                done();
              } else done(err);
            }
          }
        );
      });
    });

    describe('base connection', () => {
      it('missing options', function (done) {
        if (process.env.srv === 'skysql-ha') this.skip();
        this.timeout(30000);
        const conn = base.createCallbackConnection();
        conn.connect((err) => {
          conn.importFile({}, (err) => {
            conn.end();
            if (!err) {
              done(new Error('expected to throw an error'));
            } else {
              assert.equal(err.errno, 45052);
              assert.equal(err.sqlState, 'HY000');
              assert.equal(err.code, 'ER_MISSING_SQL_PARAMETER');
              assert.isTrue(!err.fatal);
              assert.ok(err.message.includes('SQL file parameter is mandatory'));
              done();
            }
          });
        });
      });

      it('wrong file options', function (done) {
        if (process.env.srv === 'skysql-ha') this.skip();
        this.timeout(30000);
        const conn = base.createCallbackConnection();
        conn.connect((err) => {
          conn.importFile({ file: '/tt' }, (err) => {
            conn.end();
            if (!err) {
              done(new Error('expected to throw an error'));
            } else {
              assert.equal(err.errno, 45053);
              assert.equal(err.sqlState, 'HY000');
              assert.equal(err.code, 'ER_MISSING_SQL_FILE');
              assert.isTrue(!err.fatal);
              assert.ok(err.message.includes("SQL file parameter '/tt' doesn't exists"));
              done();
            }
          });
        });
      });

      it('simple file import', function (done) {
        if (process.env.srv === 'skysql-ha') this.skip();
        this.timeout(30000);
        const conn = base.createCallbackConnection();
        conn.connect((err) => {
          conn.importFile({ file: __dirname + '/../tools/data-dump.sql', database: 'fimp' }, (err) => {
            if (err) {
              done(err);
            } else {
              conn.query('SELECT DATABASE() as db', (err, res) => {
                if (err) {
                  done(err);
                } else {
                  assert.equal(res[0].db, Conf.baseConfig.database);
                  ensureLoadedCb(() => {
                    conn.end();
                    done();
                  });
                }
              });
            }
          });
        });
      });
    });

    describe('base pool', () => {
      it('without file name', function (done) {
        const pool = base.createPoolCallback({
          connectionLimit: 1
        });
        pool.importFile(null, (err) => {
          if (!err) return done(new Error('must have thrown error'));
          assert.equal(err.errno, 45052);
          assert.equal(err.code, 'ER_MISSING_SQL_PARAMETER');
          assert.isTrue(err.message.includes('SQL file parameter is mandatory'));
          assert.equal(err.sqlState, 'HY000');
          done();
        });
        pool.end();
      });

      it('pool import', function (done) {
        if (process.env.srv === 'skysql-ha') this.skip();
        this.timeout(30000);
        const pool = base.createPoolCallback({
          connectionLimit: 1
        });
        pool.importFile(
          Object.assign({}, Conf.baseConfig, { file: __dirname + '/../tools/data-dump.sql', database: 'fimp' }),
          (err) => {
            if (err) {
              done(err);
            } else {
              ensureLoadedCb(pool.end(done));
            }
          }
        );
      });

      it('no database selected', function (done) {
        if (process.env.srv === 'skysql-ha') this.skip();
        this.timeout(30000);
        const pool = base.createPoolCallback({
          connectionLimit: 1,
          database: null
        });
        pool.importFile({ file: __dirname + '/../tools/data-dump.sql' }, (err) => {
          if (!err) {
            done(new Error('expected to throw an error'));
          } else {
            assert.equal(err.errno, 45055);
            assert.equal(err.sqlState, 'HY000');
            assert.equal(err.code, 'ER_MISSING_DATABASE_PARAMETER');
            assert.isTrue(!err.fatal);
            assert.ok(err.message.includes('Database parameter is not set and no database is selected'));
            pool.end(done);
          }
        });
      });
    });
  });

  async function ensureLoaded() {
    const res = await shareConn.query('select count(*) as c from fimp.post');
    assert.equal(res[0].c, 3);
  }
  function ensureLoadedCb(cb) {
    shareConn.query('select count(*) as c from fimp.post').then((res) => {
      assert.equal(res[0].c, 3);
      cb();
    });
  }
});
