'use strict';

const basePromise = require('../../promise');
const baseCallback = require('../../callback');
require('../base.js');
const { assert } = require('chai');
const Conf = require('../conf');
const base = require('../base');

describe('sql file import', () => {
  beforeEach(async function () {
    await shareConn.query('DROP DATABASE IF EXISTS fimp');
    await shareConn.query('CREATE DATABASE IF NOT EXISTS fimp');
  });

  afterEach(async function () {
    await shareConn.query('DROP DATABASE fimp');
  });

  describe('promise', () => {
    describe('base promise', () => {
      it('simple file import with direct connection options', async function () {
        this.timeout(10000);
        await basePromise.importFile(
          Object.assign({}, Conf.baseConfig, { file: __dirname + '/../tools/data-dump.sql', database: 'fimp' })
        );
        await ensureLoaded();
      });

      it('big file import with direct connection options', async function () {
        this.timeout(10000);
        await basePromise.importFile(
          Object.assign({}, Conf.baseConfig, { file: __dirname + '/../tools/data-dump2.sql', database: 'fimp' })
        );
        await ensureLoaded();
      });

      it('no database selected', async function () {
        this.timeout(10000);
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
        this.timeout(10000);
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
        this.timeout(10000);
        try {
          await shareConn.importFile({ file: '/tt' });
          throw new Error('expected to throw an error');
        } catch (err) {
          assert.equal(err.errno, 45053);
          assert.equal(err.sqlState, 'HY000');
          assert.equal(err.code, 'ER_MISSING_SQL_FILE');
          assert.isTrue(!err.fatal);
          console.log(err);
          assert.ok(err.message.includes("SQL file parameter '/tt' doesn't exists"));
        }
      });
      it('simple file import', async function () {
        this.timeout(10000);
        await shareConn.importFile({ file: __dirname + '/../tools/data-dump.sql', database: 'fimp' });
        const res = await shareConn.query('SELECT DATABASE() as db');
        assert.equal(res[0].db, Conf.baseConfig.database);
        await ensureLoaded();
      });
    });

    describe('base pool', () => {
      it('pool import', async function () {
        this.timeout(10000);
        const pool = base.createPool({
          connectionLimit: 1
        });
        await pool.importFile({ file: __dirname + '/../tools/data-dump.sql', database: 'fimp' });
        await ensureLoaded();
        await pool.end();
      });

      it('no database selected', async function () {
        this.timeout(10000);
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
    });
  });

  describe('callback', () => {
    describe('base callback', () => {
      it('simple file import without callback', function () {
        baseCallback.importFile(
          Object.assign({}, Conf.baseConfig, { file: __dirname + '/../tools/data-dump.sql', database: 'fimp' })
        );
      });
      it('simple file import with direct connection options', function (done) {
        this.timeout(10000);
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
        this.timeout(10000);
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
        this.timeout(10000);
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
    });

    describe('base connection', () => {
      it('missing options', function (done) {
        this.timeout(10000);
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
        this.timeout(10000);
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
        this.timeout(10000);
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
      it('pool import', function (done) {
        this.timeout(10000);
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
        this.timeout(10000);
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
