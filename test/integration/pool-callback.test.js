//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import Conf from '../conf.js';
import { createConnection, createPoolCallback, utf8Collation, isMaxscale, isDeno } from '../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';

describe.concurrent('Pool callback', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });

  test('pool with wrong authentication', async ({ skip }) => {
    // until https://github.com/denoland/deno/issues/30886 for deno
    if (isMaxscale(shareConn) || isDeno()) return skip();
    const initTime = Date.now();
    const pool = createPoolCallback({
      acquireTimeout: 4000,
      initializationTimeout: 2000,
      user: 'wrongAuthentication'
    });
    await new Promise(function (resolve, reject) {
      pool.query('SELECT 1', (err) => {
        if (!err) {
          reject(new Error('must have thrown error'));
        } else {
          assert(Date.now() - initTime >= 3980, 'expected > 4s, but was ' + (Date.now() - initTime));
          pool.query('SELECT 3', (err) => {
            if (!err) {
              reject(new Error('must have thrown error'));
            } else {
              assert.isTrue(
                err.errno === 1524 ||
                  err.errno === 1045 ||
                  err.errno === 1698 ||
                  err.errno === 45028 ||
                  err.errno === 45025 ||
                  err.errno === 45044,
                err.message
              );
              pool.end(resolve);
            }
          });
        }
      });
      pool.query('SELECT 2', (err) => {
        if (!err) {
          reject(new Error('must have thrown error'));
        }
        assert(Date.now() - initTime >= 3980, 'expected > 4s, but was ' + (Date.now() - initTime));
      });
    });
  }, 10000);

  test('pool query stack trace', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 1,
      trace: true
    });
    await new Promise(function (resolve, reject) {
      pool.query('wrong query', (err) => {
        if (!err) {
          reject(Error('must have thrown error !'));
        } else {
          assert.isTrue(err.stack.includes('pool-callback.test.js:'), err.stack);
          pool.end(resolve);
        }
      });
    });
  });

  test('pool execute stack trace', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 1,
      trace: true
    });
    await new Promise(function (resolve, reject) {
      pool.execute('wrong query', (err) => {
        if (!err) {
          reject(Error('must have thrown error !'));
        } else {
          assert.isTrue(err.stack.includes('pool-callback.test.js:'), err.stack);
          pool.end(resolve);
        }
      });
    });
  });

  test('pool execute wrong param stack trace', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 1,
      trace: true
    });
    await new Promise(function (resolve, reject) {
      pool.execute('SELECT ?', [], (err) => {
        if (!err) {
          reject(Error('must have thrown error !'));
        } else {
          assert.isTrue(err.stack.includes('pool-callback.test.js:'), err.stack);
          pool.end(resolve);
        }
      });
    });
  }, 20000);

  test('pool batch stack trace', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 1,
      trace: true
    });
    await new Promise(function (resolve, reject) {
      pool.batch('WRONG COMMAND', [0], (err) => {
        if (!err) {
          reject(Error('must have thrown error !'));
        } else {
          assert.isTrue(err.stack.includes('pool-callback.test.js:'), err.stack);
          pool.end(resolve);
        }
      });
    });
  });

  test('pool batch wrong param stack trace', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 1,
      trace: true
    });
    await new Promise(function (resolve, reject) {
      pool.query('CREATE TABLE IF NOT EXISTS test_batch_callback(id int, id2 int)');
      pool.batch('INSERT INTO test_batch_callback VALUES (?,?)', [[1], [2]], (err) => {
        if (!err) {
          reject(Error('must have thrown error !'));
        } else {
          pool.query('DROP TABLE test_batch_callback');
          assert.isTrue(err.stack.includes('pool-callback.test.js:'), err.stack);
          pool.end(resolve);
        }
      });
    });
  });

  test('pool error event', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({
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
        pool.end(resolver);
      });
    });
  }, 10000);

  test('pool error fail connection', async ({ skip }) => {
    // until https://github.com/denoland/deno/issues/30886 for deno
    if (isMaxscale(shareConn) || isDeno()) return skip();
    const initTime = Date.now();
    const pool = createPoolCallback({
      acquireTimeout: 4000,
      initializationTimeout: 2000,
      host: 'wronghost'
    });

    await new Promise(function (resolver, rejecter) {
      pool.on('error', (err) => {
        assert(Date.now() - initTime >= 1980, 'expected > 2s, but was ' + (Date.now() - initTime));
        assert.isTrue(err.message.includes('Error during pool initialization'));
        pool.end(resolver);
      });
    });
  }, 10000);

  test('pool with wrong authentication connection', async ({ skip }) => {
    // until https://github.com/denoland/deno/issues/30886 for deno
    if (isMaxscale(shareConn) || isDeno()) return skip();
    const pool = createPoolCallback({
      connectionLimit: 3,
      user: 'wrongAuthentication',
      acquireTimeout: 4000,
      initializationTimeout: 2000
    });
    await new Promise(function (resolve, reject) {
      pool.getConnection((err) => {
        if (!err) {
          reject(new Error('must have thrown error'));
        } else {
          pool.getConnection((err) => {
            if (!err) {
              reject(new Error('must have thrown error'));
            } else {
              assert.isTrue(
                err.errno === 1524 ||
                  err.errno === 1045 ||
                  err.errno === 1698 ||
                  err.errno === 45028 ||
                  err.errno === 45025 ||
                  err.errno === 45044,
                err.errno + ' - ' + err.message
              );
              pool.end(resolve);
            }
          });
        }
      });
      pool.getConnection((err) => {
        if (!err) {
          reject(new Error('must have thrown error'));
        }
      });
    });
  }, 10000);

  test('create pool', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({ connectionLimit: 1 });
    const initTime = Date.now();
    await new Promise(function (resolve, reject) {
      pool.getConnection((err, conn) => {
        if (err) reject(err);
        conn.query('SELECT SLEEP(1)', (err, rows) => {
          if (err) reject(err);
          conn.release();
        });
      });
      pool.getConnection((err, conn) => {
        if (err) {
          reject(err);
        } else {
          conn.query('SELECT SLEEP(1)', () => {
            if (err) {
              reject(err);
            } else {
              assert(Date.now() - initTime >= 1985, 'expected > 2s, but was ' + (Date.now() - initTime));
              conn.release();
              pool.end((err) => {
                resolve();
              });
            }
          });
        }
      });
    });
  }, 5000);

  test('create pool with noControlAfterUse', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({
      connectionLimit: 1,
      noControlAfterUse: true
    });
    await new Promise(function (resolve, reject) {
      const initTime = Date.now();
      pool.getConnection((err, conn) => {
        conn.query('SELECT SLEEP(1)', () => {
          conn.release();
        });
      });
      pool.getConnection((err, conn) => {
        conn.query('SELECT SLEEP(1)', () => {
          assert(Date.now() - initTime >= 1985, 'expected > 2s, but was ' + (Date.now() - initTime));
          conn.release();
          pool.end((err) => {
            resolve();
          });
        });
      });
    });
  }, 5000);

  test('pool wrong query', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({ connectionLimit: 1 });
    await new Promise(function (resolve, reject) {
      pool.query('wrong query', (err) => {
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
        pool.end((err) => {
          resolve();
        });
      });
    });
  }, 5000);

  test('pool getConnection after close', async ({ skip }) => {
    const pool = createPoolCallback({ connectionLimit: 1 });
    await new Promise(function (resolve, reject) {
      pool.end(() => {
        pool.getConnection((err) => {
          assert.isTrue(pool.closed);
          assert(err.message.includes('pool is closed'));
          assert.equal(err.sqlState, 'HY000');
          assert.equal(err.errno, 45027);
          assert.equal(err.code, 'ER_POOL_ALREADY_CLOSED');
          resolve();
        });
      });
    });
  });

  test('pool escape', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    if (!utf8Collation()) return skip();
    const pool = createPoolCallback({ connectionLimit: 1 });
    const pool2 = createPoolCallback({ connectionLimit: 1, arrayParenthesis: true });
    await new Promise(function (resolve, reject) {
      pool.on('connection', (conn) => {
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
        pool.end();
        pool2.end(resolve);
      });
    });
  });

  test('pool escape on init', async function () {
    const pool = createPoolCallback({ connectionLimit: 1 });
    assert.equal(pool.escape(new Date('1999-01-31 12:13:14.000')), "'1999-01-31 12:13:14'");
    assert.equal(pool.escape(new Date('1999-01-31 12:13:14.65')), "'1999-01-31 12:13:14.650'");
    assert.equal(pool.escapeId('good_$one'), '`good_$one`');
    assert.equal(pool.escapeId('f:a'), '`f:a`');
    assert.equal(pool.escapeId('good_`è`one'), '`good_``è``one`');
    await new Promise(function (resolve, reject) {
      pool.end(resolve);
    });
  });

  test('pool query after close', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({ connectionLimit: 1 });
    await new Promise(function (resolve, reject) {
      pool.end(() => {
        pool.query('select ?', 1, (err) => {
          assert(err.message.includes('pool is closed'));
          assert.equal(err.sqlState, 'HY000');
          assert.equal(err.errno, 45027);
          assert.equal(err.code, 'ER_POOL_ALREADY_CLOSED');
          resolve();
        });
      });
    });
  });

  test('pool getConnection timeout', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({
      connectionLimit: 1,
      acquireTimeout: 500
    });
    let errorThrown = false;

    await new Promise(function (resolve, reject) {
      pool.getConnection((err, conn) => {
        if (err) {
          reject(err);
        } else {
          conn.release();
        }
      });
      pool.query('SELECT SLEEP(1)', (err) => {
        if (err) {
          reject(err);
        } else {
          pool.end((err) => {
            assert.isOk(errorThrown);
            resolve();
          });
        }
      });

      try {
        pool.getConnection();
        throw Error('must have thrown error');
      } catch (err) {
        assert(err.message.includes('missing mandatory callback parameter'));
        assert.equal(err.sqlState, 'HY000');
        assert.equal(err.errno, 45016);
        assert.equal(err.code, 'ER_MISSING_PARAMETER');
      }

      pool.getConnection((err) => {
        assert(err.message.includes('pool timeout: failed to retrieve a connection from pool after'));
        assert.equal(err.sqlState, 'HY000');
        assert.equal(err.errno, 45028);
        assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
        errorThrown = true;
      });
    });
  }, 5000);

  test('pool query timeout', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    let errorNo = 0;
    const pool = createPoolCallback({
      connectionLimit: 1,
      acquireTimeout: 500
    });

    await new Promise(function (resolve, reject) {
      const initTime = Date.now();
      pool.query('SELECT SLEEP(?)', 5, () => {
        pool.end(() => {
          if (errorNo === 3) {
            resolve();
          } else {
            reject(new Error(`error expected 3, but was ${errorNo}`));
          }
        });
      });
      pool.query('SELECT 1', (err, res) => {
        assert(err.message.includes('pool timeout: failed to retrieve a connection from pool after'));
        assert.equal(err.sqlState, 'HY000');
        assert.equal(err.errno, 45028);
        assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
        errorNo += 1;
      });
      pool.query('SELECT 2', (err) => {
        assert(err.message.includes('pool timeout: failed to retrieve a connection from pool after'));
        assert.equal(err.sqlState, 'HY000');
        assert.equal(err.errno, 45028);
        assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
        const elapse = Date.now() - initTime;
        assert.isOk(elapse >= 475 && elapse < 650, 'elapse time was ' + elapse + ' but must be just after 500');
        errorNo += 1;
      });
      setTimeout(() => {
        pool.query('SELECT 3', (err) => {
          assert(err.message.includes('pool timeout: failed to retrieve a connection from pool after'));
          assert.equal(err.sqlState, 'HY000');
          assert.equal(err.errno, 45028);
          assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
          const elapse = Date.now() - initTime;
          assert.isOk(elapse >= 675 && elapse < 850, 'elapse time was ' + elapse + ' but must be just after 700');
          errorNo += 1;
        });
      }, 200);
    });
  }, 10000);

  test('pool direct execute', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({ connectionLimit: 1 });
    await new Promise(function (resolve, reject) {
      pool.execute('SELECT ? as a', [2], (err, res, meta) => {
        if (err) return reject(err);
        assert.isTrue(res[0].a === 2 || res[0].a === 2n);
        assert.isTrue(meta.length === 1);
        pool.execute({ sql: 'SELECT ? as a' }, [2], (err, res, meta) => {
          if (err) return reject(err);
          assert.isTrue(res[0].a === 2 || res[0].a === 2n);
          assert.isTrue(meta.length === 1);
          pool.execute('SELECT 2 as a', (err, res, meta) => {
            if (err) return reject(err);
            assert.isTrue(res[0].a === 2 || res[0].a === 2n);
            assert.isTrue(meta.length === 1);
            pool.end(() => {
              resolve();
            });
          });
        });
      });
    });
  });

  test('pool grow', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({ connectionLimit: 10 });
    await new Promise(function (resolve, reject) {
      setTimeout(() => {
        //check available connections in pool
        assert.equal(pool.activeConnections(), 0);
        assert.equal(pool.totalConnections(), 10);
        assert.equal(pool.idleConnections(), 10);
        assert.equal(pool.taskQueueSize(), 0);
        let closed = false;
        let doneSend = false;
        for (let i = 0; i < 10000; i++) {
          pool.query('SELECT ? as a', [i + ''], (err, rows) => {
            if (err) {
              if (!doneSend) {
                doneSend = true;
                reject(err);
              }
            } else {
              assert.deepEqual(rows, [{ a: i + '' }]);
            }
          });
        }
        setTimeout(() => {
          if (pool.activeConnections() < 10) {
            // for very slow env
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
            console.log(pool.taskQueueSize());
            assert.isOk(pool.taskQueueSize() > 9800);
          }

          setTimeout(() => {
            closed = true;
            pool.end(() => {
              if (Conf.baseConfig.host === 'localhost') {
                assert.equal(pool.activeConnections(), 0);
                assert.equal(pool.totalConnections(), 0);
                assert.equal(pool.idleConnections(), 0);
                assert.equal(pool.taskQueueSize(), 0);
              }
              if (!doneSend) {
                doneSend = true;
                resolve();
              }
            });
          }, 5000);
        }, 1);
      }, 8000);
    });
  }, 20000);

  test('connection fail handling', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({
      connectionLimit: 2,
      minDelayValidation: 200
    });
    await new Promise(function (resolve, reject) {
      setTimeout(() => {
        //check available connections in pool
        assert.equal(pool.activeConnections(), 0);
        assert.equal(pool.totalConnections(), 2);
        assert.equal(pool.idleConnections(), 2);
        assert.equal(pool.taskQueueSize(), 0);

        pool.getConnection((err, conn) => {
          if (err) {
            reject(err);
          } else {
            assert.equal(pool.activeConnections(), 1);
            assert.equal(pool.totalConnections(), 2);
            assert.equal(pool.idleConnections(), 1);
            assert.equal(pool.taskQueueSize(), 0);

            conn.query('KILL CONNECTION_ID()', (err) => {
              assert.equal(err.sqlState, '70100');
              assert.equal(pool.activeConnections(), 1);
              assert.equal(pool.totalConnections(), 2);
              assert.equal(pool.idleConnections(), 1);
              assert.equal(pool.taskQueueSize(), 0);
              conn.end(() => {
                assert.equal(pool.activeConnections(), 0);
                assert.equal(pool.taskQueueSize(), 0);
                pool.end(() => {
                  resolve();
                });
              });
            });
          }
        });
      }, 500);
    });
  });

  test('query fail handling', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({
      connectionLimit: 2,
      minDelayValidation: 200
    });
    await new Promise(function (resolve, reject) {
      setTimeout(() => {
        //check available connections in pool
        assert.equal(pool.activeConnections(), 0);
        assert.equal(pool.totalConnections(), 2);
        assert.equal(pool.idleConnections(), 2);
        assert.equal(pool.taskQueueSize(), 0);

        pool.query('KILL CONNECTION_ID()', (err) => {
          assert.equal(err.sqlState, '70100');
          setImmediate(() => {
            assert.equal(pool.taskQueueSize(), 0);

            setTimeout(() => {
              pool.query('do 1');
              pool.query('do 1', () => {
                setTimeout(() => {
                  //connection recreated
                  assert.equal(pool.activeConnections(), 0);
                  assert.equal(pool.totalConnections(), 2);
                  assert.equal(pool.idleConnections(), 2);
                  assert.equal(pool.taskQueueSize(), 0);
                  pool.end(() => {
                    resolve();
                  });
                }, 250);
              });
            }, 250);
          });
        });
      }, 500);
    });
  });

  test('connection end', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({ connectionLimit: 2 });
    await new Promise(function (resolve, reject) {
      setTimeout(() => {
        //check available connections in pool
        assert.equal(pool.activeConnections(), 0);
        assert.equal(pool.totalConnections(), 2);
        assert.equal(pool.idleConnections(), 2);

        pool.getConnection((err, conn) => {
          if (err) {
            reject(err);
          } else {
            //check available connections in pool
            assert.equal(pool.activeConnections(), 1);
            assert.equal(pool.totalConnections(), 2);
            assert.equal(pool.idleConnections(), 1);

            conn.end(() => {
              assert.equal(pool.activeConnections(), 0);
              assert.equal(pool.totalConnections(), 2);
              assert.equal(pool.idleConnections(), 2);
              pool.end(() => {
                resolve();
              });
            });
          }
        });
      }, 500);
    });
  });

  test('connection release alias', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({ connectionLimit: 2 });
    await new Promise(function (resolve, reject) {
      setTimeout(() => {
        //check available connections in pool
        assert.equal(pool.activeConnections(), 0);
        assert.equal(pool.totalConnections(), 2);
        assert.equal(pool.idleConnections(), 2);

        pool.getConnection((err, conn) => {
          if (err) {
            reject(err);
          } else {
            //check available connections in pool
            assert.equal(pool.activeConnections(), 1);
            assert.equal(pool.totalConnections(), 2);
            assert.equal(pool.idleConnections(), 1);

            conn.release(() => {
              assert.equal(pool.activeConnections(), 0);
              assert.equal(pool.totalConnections(), 2);
              assert.equal(pool.idleConnections(), 2);
              pool.end(() => {
                resolve();
              });
            });
          }
        });
      }, 500);
    });
  });

  test('connection destroy', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({ connectionLimit: 2 });
    await new Promise(function (resolve, reject) {
      setTimeout(() => {
        //check available connections in pool
        assert.equal(pool.activeConnections(), 0);
        assert.equal(pool.totalConnections(), 2);
        assert.equal(pool.idleConnections(), 2);

        pool.getConnection((err, conn) => {
          if (err) {
            reject(err);
          } else {
            //check available connections in pool
            assert.equal(pool.activeConnections(), 1);
            assert.equal(pool.totalConnections(), 2);
            assert.equal(pool.idleConnections(), 1);

            conn.destroy();

            assert.equal(pool.activeConnections(), 0);
            assert.equal(pool.totalConnections(), 1);
            assert.equal(pool.idleConnections(), 1);
            pool.end(() => {
              resolve();
            });
          }
        });
      }, 500);
    });
  });

  test('pool rollback on connection return', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({ connectionLimit: 1 });
    await new Promise(function (resolve, reject) {
      pool.getConnection((err, conn) => {
        if (err) {
          reject(err);
        } else {
          conn.query('DROP TABLE IF EXISTS rollbackTable', (err, res) => {
            conn.query('CREATE TABLE rollbackTable(col varchar(10))', (err, res) => {
              conn.query('set autocommit = 0', (err, res) => {
                conn.beginTransaction((err, res) => {
                  conn.query("INSERT INTO rollbackTable value ('test')", (err, res) => {
                    conn.release((err) => {
                      pool.getConnection((err, conn) => {
                        conn.query('SELECT * FROM rollbackTable', (err, res) => {
                          assert.equal(res.length, 0);
                          conn.end(() => {
                            pool.end(() => {
                              resolve();
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        }
      });
    });
  });

  test('pool batch', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    let params = { connectionLimit: 1, resetAfterUse: false };
    const pool = createPoolCallback(params);
    await new Promise(function (resolve, reject) {
      pool.query('DROP TABLE IF EXISTS poolCbParseBatch', (err, res) => {
        pool.query('CREATE TABLE poolCbParseBatch(id int, id2 int, id3 int, t varchar(128), id4 int)', (err, res) => {
          pool.batch(
            'INSERT INTO `poolCbParseBatch` values (1, ?, 2, ?, 3)',
            [
              [1, 'john'],
              [2, 'jack']
            ],
            (err, res) => {
              if (err) {
                reject(err);
              } else {
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

                pool.query('select * from `poolCbParseBatch`', (err2, res2) => {
                  assert.deepEqual(res2, [
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
                  pool.query('DROP TABLE poolCbParseBatch');
                  pool.end(() => {
                    resolve();
                  });
                });
              }
            }
          );
        });
      });
    });
  });

  test('pool batch without parameters', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({
      connectionLimit: 1,
      resetAfterUse: false
    });
    await new Promise(function (resolve, reject) {
      pool.batch('INSERT INTO `poolCbParseBatch` values (1, ?, 2, ?, 3)', (err, res) => {
        pool.end();
        if (err) {
          assert.isTrue(err.message.includes('Batch must have values set'));
          resolve();
        } else {
          reject(new Error('must have thrown error'));
        }
      });
    });
  });

  test('pool batch single array', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({
      connectionLimit: 1,
      resetAfterUse: false
    });
    await new Promise(function (resolve, reject) {
      pool.query('DROP TABLE IF EXISTS singleBatchArrayCallback', (err, res) => {
        if (err) {
          pool.end();
          reject(err);
        } else {
          pool.query('CREATE TABLE singleBatchArrayCallback(id int)', (err, res) => {
            if (err) {
              pool.end();
              reject(err);
            } else {
              pool.batch('INSERT INTO `singleBatchArrayCallback` values (?)', [1, 2, 3], (err, res) => {
                if (err) {
                  pool.end();
                  reject(err);
                } else {
                  pool.query('select * from `singleBatchArrayCallback`', (err, res) => {
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
                    pool.end(resolve);
                  });
                }
              });
            }
          });
        }
      });
    });
  });

  test('test minimum idle decrease', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({
      connectionLimit: 10,
      minimumIdle: 4,
      idleTimeout: 2,
      acquireTimeout: 20000
    });
    await new Promise(function (resolve, reject) {
      setTimeout(() => {
        for (let i = 0; i < 5000; i++) {
          pool.query('SELECT ' + i);
        }
        pool.query('SELECT 5000', [], (err) => {
          if (err) {
            pool.end();
            reject(err);
          } else {
            setTimeout(() => {
              assert.equal(pool.totalConnections(), 10);
              assert.isTrue(pool.idleConnections() === 9 || pool.idleConnections() === 10);
            }, 5);

            setTimeout(() => {
              //minimumIdle-1 is possible after reaching idleTimeout and connection
              // is still not recreated
              assert.isTrue(pool.totalConnections() === 4 || pool.totalConnections() === 3);
              assert.isTrue(pool.idleConnections() === 4 || pool.idleConnections() === 3);
              pool.end(resolve);
            }, 7000);
          }
        });
      }, 4000);
    });
  }, 30000);

  test('test minimum idle', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();

    const pool = createPoolCallback({
      connectionLimit: 10,
      minimumIdle: 4,
      idleTimeout: 2,
      acquireTimeout: 20000
    });
    await new Promise(function (resolve, reject) {
      setTimeout(() => {
        //minimumIdle-1 is possible after reaching idleTimeout and connection
        // is still not recreated
        assert.isTrue(pool.totalConnections() === 4 || pool.totalConnections() === 3);
        assert.isTrue(pool.idleConnections() === 4 || pool.idleConnections() === 3);
        pool.end(resolve);
      }, 4000);
    });
  }, 10000);

  test('pool immediate error', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({});
    await new Promise(function (resolve, reject) {
      pool.getConnection((err, conn) => {
        if (err) {
          assert(err.message.includes('pool is ending, connection request aborted'));
          assert.equal(err.sqlState, 'HY000');
          assert.equal(err.errno, 45037);
          assert.equal(err.code, 'ER_CLOSING_POOL');
          resolve();
        } else {
          reject(new Error('must have thrown an Exception'));
        }
      });
      pool.end();
    });
  });

  test('pool execute timeout', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();

    const pool = createPoolCallback({
      connectionLimit: 1,
      acquireTimeout: 400
    });
    assert.isFalse(pool.closed);
    await new Promise(function (resolve, reject) {
      pool.query('SELECT SLEEP(1)');
      pool.execute('SELECT 1', (err, res) => {
        pool.end();
        assert.isTrue(pool.closed);
        if (err) {
          assert.isTrue(err.message.includes('pool timeout: failed to retrieve a connection from pool after'));
          resolve();
        } else {
          reject(new Error('must have thrown error'));
        }
      });
    });
  }, 10000);

  test('pool batch timeout', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();

    const pool = createPoolCallback({
      connectionLimit: 1,
      acquireTimeout: 400
    });
    pool.query('SELECT SLEEP(1)');
    await new Promise(function (resolve, reject) {
      pool.batch('SELECT ?', [[1]], (err, res) => {
        pool.end();
        if (err) {
          assert.isTrue(err.message.includes('pool timeout: failed to retrieve a connection from pool after'));
          resolve();
        } else {
          reject(new Error('must have thrown error'));
        }
      });
    });
  }, 10000);

  test('ensure failing connection on pool not exiting application', async ({ skip }) => {
    // until https://github.com/denoland/deno/issues/30886 for deno
    if (isMaxscale(shareConn) || isDeno()) return skip();

    const pool = createPoolCallback({
      port: 8888,
      initializationTimeout: 100
    });

    // pool will throw an error after some time and must not exit the test suite
    await new Promise((resolve, reject) => {
      new setTimeout(resolve, 3000);
    });
    pool.end();
  }, 5000);

  test('pool.toString', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({
      connectionLimit: 1
    });
    await new Promise(function (resolve, reject) {
      pool.query('DO 1', () => {
        assert.equal('poolCallback(active=0 idle=1 limit=1)', pool.toString());
        pool.end(resolve);
      });
    });
  });

  test('direct execution without cache', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const pool = createPoolCallback({
      connectionLimit: 1,
      acquireTimeout: 400
    });
    await new Promise(function (resolve, reject) {
      pool.execute('select ? as a', [2], (err, res, meta) => {
        if (err) return reject(err);
        assert.isTrue(res[0].a === 2 || res[0].a === 2n);
        assert.isTrue(meta.length === 1);
        pool.end(resolve);
      });
    });
  });
});
