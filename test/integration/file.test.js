//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import * as basePromise from '../../promise.js';
import * as baseCallback from '../../callback.js';
import Conf from '../conf.js';
import { assert, describe, test, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createConnection, createPool, createCallbackConnection, createPoolCallback } from '../base.js';

describe('sql file import', () => {
  let maxAllowedSize;
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
    const row = await shareConn.query('SELECT @@max_allowed_packet as t');
    maxAllowedSize = Number(row[0].t);
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });

  beforeEach(async function () {
    await shareConn.query('DROP DATABASE IF EXISTS fimp');
    await shareConn.query('CREATE DATABASE IF NOT EXISTS fimp');
    await shareConn.query('FLUSH TABLES');
  });

  afterEach(async function () {
    await shareConn.query('DROP DATABASE IF EXISTS fimp');
  });

  describe('promise', () => {
    describe('base promise', () => {
      test('without file name', async function () {
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

      test('simple file import with direct connection options', async function () {
        await basePromise.importFile(
          Object.assign({}, Conf.baseConfig, { file: __dirname + '/../tools/data-dump.sql', database: 'fimp' })
        );
        await ensureLoaded();
      }, 30000);

      test('big file import with direct connection options', async (ctx) => {
        if (!shareConn.info.isMariaDB() || maxAllowedSize <= 32000000) {
          ctx.skip();
          return;
        }

        await basePromise.importFile(
          Object.assign({}, Conf.baseConfig, { file: __dirname + '/../tools/data-dump2.sql', database: 'fimp' })
        );
        await ensureLoaded();
      }, 30000);

      test('no database selected', async function () {
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
      }, 30000);
    });

    describe('base connection', () => {
      test('missing options', async function () {
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
      }, 30000);

      test('wrong file options', async function () {
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
      }, 30000);

      test('simple file import', async function () {
        await shareConn.importFile({ file: __dirname + '/../tools/data-dump.sql', database: 'fimp' });
        const res = await shareConn.query('SELECT DATABASE() as db');
        assert.equal(res[0].db, Conf.baseConfig.database);
        await ensureLoaded();
      }, 30000);

      test('simple file import without initial import ', async function () {
        const conn = await createConnection({ database: null });
        try {
          await conn.importFile({ file: __dirname + '/../tools/data-dump.sql', database: 'fimp' });
          const res = await conn.query('SELECT DATABASE() as db');
          assert.equal(res[0].db, 'fimp');
          await ensureLoaded();
        } finally {
          conn.end();
        }
      }, 30000);
    });

    describe('base pool', () => {
      test('without file name', async function () {
        const pool = createPool({
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

      test('pool import', async function () {
        const pool = createPool({
          connectionLimit: 1
        });
        await pool.importFile({ file: __dirname + '/../tools/data-dump.sql', database: 'fimp' });
        await ensureLoaded();
        await pool.end();
      }, 30000);

      test('no database selected', async function () {
        const pool = createPool({
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
      }, 30000);

      test('Error in file', async function () {
        const conn = await createConnection({});
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
      }, 30000);
    });
  });

  describe('callback', () => {
    describe('base callback', () => {
      test('without file name', async () => {
        await new Promise((resolve, reject) => {
          baseCallback.importFile(Object.assign({}, Conf.baseConfig), (err) => {
            if (!err) return reject(new Error('must have thrown error'));
            assert.equal(err.errno, 45052);
            assert.equal(err.code, 'ER_MISSING_SQL_PARAMETER');
            assert.isTrue(err.message.includes('SQL file parameter is mandatory'));
            assert.equal(err.sqlState, 'HY000');
            resolve();
          });
        });
      });

      test('simple file import without callback', async () => {
        baseCallback.importFile(
          Object.assign({}, Conf.baseConfig, { file: __dirname + '/../tools/data-dump.sql', database: 'fimp' })
        );
        const conn = createCallbackConnection();
        await new Promise((resolve, reject) => {
          conn.connect((err) => {
            if (err) {
              reject(err);
            } else {
              const inter = setInterval(function () {
                conn.query('select count(*) as c from fimp.post', (err, res) => {
                  if (res && res[0] && (res[0].c === 3 || res[0].c === 3n)) {
                    clearInterval(inter);
                    conn.end();
                    resolve();
                  }
                });
              }, 100);
            }
          });
        });
      }, 30000);

      test('simple file import with direct connection options', async () => {
        await new Promise((resolve, reject) => {
          baseCallback.importFile(
            Object.assign({}, Conf.baseConfig, { file: __dirname + '/../tools/data-dump.sql', database: 'fimp' }),
            (err) => {
              if (err) {
                reject(err);
              } else {
                ensureLoadedCb(resolve);
              }
            }
          );
        });
      }, 30000);

      test('big file import with direct connection options', async (ctx) => {
        if (!shareConn.info.isMariaDB()) return ctx.skip();
        // skipping if it takes too long
        if (maxAllowedSize <= 32000000) return ctx.skip();
        await new Promise((resolve, reject) => {
          baseCallback.importFile(
            Object.assign({}, Conf.baseConfig, { file: __dirname + '/../tools/data-dump2.sql', database: 'fimp' }),
            (err) => {
              if (err) {
                reject(err);
              } else {
                ensureLoadedCb(resolve);
              }
            }
          );
        });
      }, 30000);

      test('no database selected', async () => {
        await new Promise((resolve, reject) => {
          baseCallback.importFile(
            Object.assign({}, Conf.baseConfig, { file: __dirname + '/../tools/data-dump.sql', database: null }),
            (err) => {
              if (!err) {
                reject(new Error('expected to throw an error'));
              } else {
                assert.equal(err.errno, 45055);
                assert.equal(err.sqlState, 'HY000');
                assert.equal(err.code, 'ER_MISSING_DATABASE_PARAMETER');
                assert.isTrue(!err.fatal);
                assert.ok(err.message.includes('Database parameter is not set and no database is selected'));
                resolve();
              }
            }
          );
        });
      }, 30000);

      test('error in import file', async () => {
        await new Promise((resolve, reject) => {
          baseCallback.importFile(
            Object.assign({}, Conf.baseConfig, { file: __dirname + '/../tools/data-dump-err.sql' }),
            (err) => {
              if (!err) {
                reject(new Error('expected to throw an error'));
              } else {
                if (err.errno === 1062) {
                  assert.equal(err.sqlState, '23000');
                  assert.equal(err.code, 'ER_DUP_ENTRY');
                  assert.isTrue(!err.fatal);
                  assert.ok(err.message.includes('Duplicate entry'));
                  resolve();
                } else if (err.errno === 1180) {
                  assert.equal(err.sqlState, 'HY000');
                  assert.equal(err.code, 'ER_ERROR_DURING_COMMIT');
                  assert.isTrue(!err.fatal);
                  assert.ok(err.message.includes('Operation not permitted'));
                  resolve();
                } else reject(err);
              }
            }
          );
        });
      }, 30000);
    });

    describe('base connection', () => {
      test('missing options', async () => {
        const conn = createCallbackConnection();
        await new Promise((resolve, reject) => {
          conn.connect((err) => {
            conn.importFile({}, (err) => {
              conn.end();
              if (!err) {
                reject(new Error('expected to throw an error'));
              } else {
                assert.equal(err.errno, 45052);
                assert.equal(err.sqlState, 'HY000');
                assert.equal(err.code, 'ER_MISSING_SQL_PARAMETER');
                assert.isTrue(!err.fatal);
                assert.ok(err.message.includes('SQL file parameter is mandatory'));
                resolve();
              }
            });
          });
        });
      }, 30000);

      test('wrong file options', async () => {
        const conn = createCallbackConnection();
        await new Promise((resolve, reject) => {
          conn.connect((err) => {
            conn.importFile({ file: '/tt' }, (err) => {
              conn.end();
              if (!err) {
                reject(new Error('expected to throw an error'));
              } else {
                assert.equal(err.errno, 45053);
                assert.equal(err.sqlState, 'HY000');
                assert.equal(err.code, 'ER_MISSING_SQL_FILE');
                assert.isTrue(!err.fatal);
                assert.ok(err.message.includes("SQL file parameter '/tt' doesn't exists"));
                resolve();
              }
            });
          });
        });
      }, 30000);

      test('simple file import', async () => {
        const conn = createCallbackConnection();
        await new Promise((resolve, reject) => {
          conn.connect((err) => {
            conn.importFile({ file: __dirname + '/../tools/data-dump.sql', database: 'fimp' }, (err) => {
              if (err) {
                reject(err);
              } else {
                conn.query('SELECT DATABASE() as db', (err, res) => {
                  if (err) {
                    reject(err);
                  } else {
                    assert.equal(res[0].db, Conf.baseConfig.database);
                    ensureLoadedCb(() => {
                      conn.end();
                      resolve();
                    });
                  }
                });
              }
            });
          });
        });
      }, 30000);
    });

    describe('base pool', () => {
      test('without file name', async () => {
        const pool = createPoolCallback({
          connectionLimit: 1
        });
        await new Promise((resolve, reject) => {
          pool.importFile(null, (err) => {
            if (!err) return reject(new Error('must have thrown error'));
            assert.equal(err.errno, 45052);
            assert.equal(err.code, 'ER_MISSING_SQL_PARAMETER');
            assert.isTrue(err.message.includes('SQL file parameter is mandatory'));
            assert.equal(err.sqlState, 'HY000');
            pool.end(resolve);
          });
        });
      });

      test('pool import', async () => {
        const pool = createPoolCallback({
          connectionLimit: 1
        });
        await new Promise((resolve, reject) => {
          pool.importFile(
            Object.assign({}, Conf.baseConfig, { file: __dirname + '/../tools/data-dump.sql', database: 'fimp' }),
            (err) => {
              if (err) {
                reject(err);
              } else {
                ensureLoadedCb(() => pool.end(resolve));
              }
            }
          );
        });
      }, 30000);

      test('no database selected', async () => {
        const pool = createPoolCallback({
          connectionLimit: 1,
          database: null
        });
        await new Promise((resolve, reject) => {
          pool.importFile({ file: __dirname + '/../tools/data-dump.sql' }, (err) => {
            if (!err) {
              reject(new Error('expected to throw an error'));
            } else {
              assert.equal(err.errno, 45055);
              assert.equal(err.sqlState, 'HY000');
              assert.equal(err.code, 'ER_MISSING_DATABASE_PARAMETER');
              assert.isTrue(!err.fatal);
              assert.ok(err.message.includes('Database parameter is not set and no database is selected'));
              pool.end(resolve);
            }
          });
        });
      }, 30000);
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
