//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import Collations from '../../lib/const/collations.js';
import Conf from '../conf.js';
import Connection from '../../lib/connection';
import ConnOptions from '../../lib/config/connection-options';
import { isMaxscale, getHostSuffix, createConnection, createCallbackConnection, utf8Collation } from '../base.js';
import { expect, assert, describe, test, beforeAll, afterAll } from 'vitest';

import dns from 'node:dns';
import Net from 'node:net';
import { rejects } from 'node:assert';

describe.concurrent('connection', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });
  test('with no connection attributes', async () => {
    await connectWithAttributes(false);
  });

  test('with basic connection attributes', async () => {
    await connectWithAttributes(true);
  });

  test('with basic connection attributes non node.js encoding', async () => {
    await connectWithAttributes(true, 'big5');
  });

  test('with small connection attributes', async () => {
    await connectWithAttributes({ par1: 'bouh', par2: 'bla' });
  });

  test('with medium connection attributes', async () => {
    const mediumAttribute = Buffer.alloc(512, 'a').toString();
    await connectWithAttributes({ par1: 'bouh', par2: mediumAttribute });
  });

  async function connectWithAttributes(attr, charset) {
    const conn = await createConnection({ connectAttributes: attr, charset: charset });
    const rows = await conn.query("SELECT '1' as '1'");
    assert.deepEqual(rows, [{ 1: '1' }]);
    assert.equal(rows.meta[0].name(), '1');
    assert.equal(rows.meta[0].orgName(), '');
    await conn.end();
  }

  test('connection attributes with encoding not supported by node.js', async () => {
    const mediumAttribute = Buffer.alloc(500, 'a').toString();
    const conn = await createConnection({
      connectAttributes: { par1: 'bouh', par2: mediumAttribute },
      collation: 'BIG5_CHINESE_CI'
    });
    const rows = await conn.query("SELECT '1'");
    assert.deepEqual(rows, [{ 1: '1' }]);
    await conn.end();
  });

  test('multiple connection.connect() with callback', async () => {
    const conn = createCallbackConnection();
    assert.equal(-1, conn.threadId);
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) reject(err);
        assert.notEqual(-1, conn.threadId);
        //ensure double connect execute callback immediately
        conn.connect((err) => {
          if (err) reject(err);
          conn.end(() => {
            conn.connect((err) => {
              //normal error
              assert.isTrue(err.message.includes('Connection closed'));
              assert.equal(err.sqlState, '08S01');
              assert.equal(err.code, 'ER_CONNECTION_ALREADY_CLOSED');
              resolve();
            });
          });
        });
      });
    });
  });

  test('callback without connect', async () => {
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.query("select '1'", (err, rows) => {
        if (err) {
          reject(err);
        } else {
          assert.deepEqual(rows, [{ 1: '1' }]);
          conn.end();
          resolve();
        }
      });
    });
  });

  test('callback with connection error', async () => {
    const conn = createCallbackConnection({
      connectTimeout: 200,
      socketTimeout: 200
    });
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (!err) reject(new Error('must have throw an error!'));
        assert.isTrue(err.message.includes('close forced'));
        resolve();
      });
      process.nextTick(conn.__tests.getSocket().destroy.bind(conn.__tests.getSocket(), new Error('close forced')));
    });
  });

  test('callback with socket failing without error', async () => {
    const conn = createCallbackConnection({ connectTimeout: 100 });
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (!err) reject(new Error('must have throw an error!'));
        assert.isTrue(err.message.includes('Connection timeout: failed to create socket after'));
        resolve();
      });
      process.nextTick(conn.__tests.getSocket().destroy.bind(conn.__tests.getSocket()));
    });
  });

  test('socket timeout', async () => {
    const conn = await createConnection({ socketTimeout: 100, connectTimeout: null });
    try {
      await conn.query('SELECT SLEEP(1)');
      throw new Error('must have thrown error !');
    } catch (err) {
      assert.isTrue(err.message.includes('socket timeout'));
      assert.equal(err.sqlState, '08S01');
      assert.equal(err.errno, 45026);
      assert.equal(err.code, 'ER_SOCKET_TIMEOUT');
    }
  });

  test('connection.connect() callback mode without callback', async () => {
    const conn = createCallbackConnection();
    try {
      conn.connect();
    } catch (err) {
      assert.isTrue(err.message.includes('missing mandatory callback parameter'));
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.errno, 45016);
      assert.equal(err.code, 'ER_MISSING_PARAMETER');
    }
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        conn.end();
        resolve();
      }, 500);
    });
  });

  test('multiple connection.connect() with callback no function', async () => {
    await new Promise((resolve, reject) => {
      const conn = createCallbackConnection();
      conn.connect((err) => {});
      conn.connect((err) => {});
      conn.end(() => {
        conn.connect((err) => {});
        resolve();
      });
    });
  });

  test('connection.connect() promise success parameter', async () => {
    const conn = await createConnection();
    await conn.end();
  });

  test('connection error event', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) return skip();
    await new Promise((resolve, reject) => {
      createConnection()
        .then((conn) => {
          assert.equal(0, conn.listeners('error').length);
          conn.on('error', (err) => {
            resolve();
          });
          conn.query('KILL ' + conn.threadId).catch((err) => {
            assert.isTrue(
              err.message.includes('Connection was killed') || err.message.includes('Query execution was interrupted')
            );
            assert.equal(err.sqlState, '70100');
            assert.isTrue(err.errno === 1927 || err.errno === 1317);
            resolve();
          });
        })
        .catch(resolve);
    });
  });

  test('connection error event socket failed', async () => {
    const conn = await createConnection({ socketTimeout: 100 });
    conn.on('error', (err) => {
      assert.isTrue(err.message.includes('socket timeout'));
      assert.equal(err.fatal, true);
      assert.equal(err.sqlState, '08S01');
      assert.equal(err.errno, 45026);
      assert.equal(err.code, 'ER_SOCKET_TIMEOUT');
    });
    await conn.end();
  });

  test('multiple connection end with promise', async () => {
    const conn = await createConnection({
      logger: {
        error: (msg) => {}
      }
    });
    await conn.end();
    await conn.end();
  });

  test('connection.connect() and query no waiting', async () => {
    const conn = await createConnection();
    const rows = await conn.query("SELECT '1'");
    assert.deepEqual(rows, [{ 1: '1' }]);
    conn.end();
  });

  test('connection.ping()', async () => {
    const conn = await createConnection();
    conn.ping();
    await conn.ping();
    try {
      await conn.ping(-2);
      throw new Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.message.includes('Ping cannot have negative timeout value'));
    }
    await conn.ping(200);

    conn.query('SELECT SLEEP(1)');
    const initTime = Date.now();

    try {
      await conn.ping(200);
      throw new Error('must have thrown error after ' + (Date.now() - initTime));
    } catch (err) {
      assert.isTrue(
        Date.now() - initTime > 195,
        'expected > 195, without waiting for SLEEP to finish, but was ' + (Date.now() - initTime)
      );
      assert.isTrue(err.message.includes('Ping timeout'));
      assert.isFalse(conn.isValid());
    }
  });

  test('connection.ping() with callback', async () => {
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        assert.equal(0, conn.listeners('error').length);
        conn.ping();
        conn.ping((err) => {
          if (err) {
            reject(err);
          } else {
            conn.ping(-2, (err) => {
              if (!err) {
                rejects(new Error('must have thrown error'));
              } else {
                assert.isTrue(err.message.includes('Ping cannot have negative timeout value'));
                conn.ping(200, (err) => {
                  if (err) {
                    reject(err);
                  } else {
                    conn.query('SELECT SLEEP(1)');
                    const initTime = Date.now();
                    conn.ping(200, (err) => {
                      if (!err) {
                        reject(new Error('must have thrown error'));
                      } else {
                        assert.isTrue(
                          Date.now() - initTime > 195,
                          'expected > 195, without waiting for SLEEP to finish, but was ' + (Date.now() - initTime)
                        );
                        assert.isTrue(err.message.includes('Ping timeout'));
                        assert.isFalse(conn.isValid());
                        resolve();
                      }
                    });
                  }
                });
              }
            });
          }
        });
      });
    });
  });

  test('threadId access compatibility', async () => {
    assert.isDefined(shareConn.threadId);
    assert.isTrue(shareConn.threadId !== -1);
  });

  test('connection.end() callback', async () => {
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect(function (err) {
        if (err) return reject(err);
        conn.end(function () {
          resolve();
        });
      });
    });
  });

  test('connection.end() promise', async () => {
    const conn = await createConnection();
    await conn.end();
  });

  test('connection.destroy()', async () => {
    const conn = await createConnection();
    await conn.destroy();
  }, 10000);

  test('connection.destroy() when executing', async () => {
    const conn = await createConnection();
    conn.query('SELECT 1');
    conn.destroy();
  }, 10000);

  test('connection.close alias', async () => {
    const conn = await createConnection({ keepAliveDelay: 100 });
    conn.query('SELECT 1');
    conn.close();
  }, 10000);

  test('connection.destroy() during query execution', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const conn = await createConnection();
    //launch very long query
    await new Promise((resolve, reject) => {
      conn
        .query(
          'select c1.* from information_schema.columns as c1, information_schema.tables, ' +
            'information_schema.tables as t2'
        )
        .then(() => reject(new Error('expected error !')))
        .catch((err) => {
          assert.isTrue(err != null);
          assert.isTrue(err.message.includes('Connection destroyed, command was killed'));
          assert.isTrue(err.fatal);
          resolve();
        });
      setTimeout(() => {
        conn.destroy();
      }, 10);
    });
  }, 10000);

  test('connection timeout connect (wrong url) with callback', async ({ skip }) => {
    const initTime = Date.now();
    await new Promise((resolve, reject) => {
      dns.resolve4('www.google.com', (err, res) => {
        if (err) resolve();
        else if (res.length > 0) {
          const host = res[0];
          const conn = createCallbackConnection({
            host: host,
            connectTimeout: 1000
          });
          conn.connect((err) => {
            if (err.code !== 'ER_CONNECTION_TIMEOUT' && err.code !== 'ETIMEDOUT') {
              if (err.code === 'ENOTFOUND' || err.code === 'ENETUNREACH') {
                // if no network access or IP¨v6 not allowed, just skip error
                resolve();
                return;
              }
              console.log(err);
            }
            if (err.code === 'ER_CONNECTION_TIMEOUT') {
              assert.isTrue(err.message.includes('Connection timeout: failed to create socket after'));
            }
            assert.isTrue(Date.now() - initTime >= 990, 'expected > 990, but was ' + (Date.now() - initTime));
            assert.isTrue(Date.now() - initTime < 2000, 'expected < 2000, but was ' + (Date.now() - initTime));
            resolve();
          });
        } else reject(new Error('DNS fails'));
      });
    });
  });

  test('stream basic test', async function () {
    const conn = await createConnection({
      stream: (cb) => {
        cb(null, new Net.connect(Conf.baseConfig.port, Conf.baseConfig.host));
      }
    });
    conn.end();

    const conn2 = await createConnection({
      stream: () => {
        return new Net.connect(Conf.baseConfig.port, Conf.baseConfig.host);
      }
    });
    conn2.end();

    const conn3 = await createConnection({
      stream: (cb) => {
        cb();
      }
    });
    conn3.end();
  });

  test('connection error', async () => {
    try {
      const conn = await createConnection({
        host: 'www.facebook.com',
        port: 443,
        connectTimeout: 200,
        socketTimeout: 200
      });
      conn.end();
      throw new Error('must have thrown error!');
    } catch (err) {
      if (err.code === 'ENOTFOUND' || err.code === 'ENETUNREACH') {
        // if no network access or IP¨v6 not allowed, just skip error
        return;
      }
      assert.isTrue(err.message.includes('socket timeout') || err.message.includes('Connection timeout'), err.message);
      assert.equal(err.sqlState, '08S01');
      assert.isTrue(err.errno === 45026 || err.errno === 45012);
    }
  });

  test('connection timeout', async () => {
    try {
      const conn = await createConnection({
        host: 'www.facebook.com',
        port: 443,
        connectTimeout: 1
      });
      conn.end();
      throw new Error('must have thrown error!');
    } catch (err) {
      if (err.code !== 'ER_CONNECTION_TIMEOUT' && err.code !== 'ETIMEDOUT') {
        if (err.code === 'ENOTFOUND' || err.code === 'ENETUNREACH') {
          // if no network access or IP¨v6 not allowed, just skip error
          return;
        }
        console.log(err);
      }

      if (err.code === 'ER_CONNECTION_TIMEOUT') {
        assert.isTrue(err.message.includes('Connection timeout'));
      }
      assert.equal(err.sqlState, '08S01');
      assert.equal(err.errno, 45012);
    }
  });

  test('connection timeout connect (wrong url) with callback no function', async () => {
    await new Promise((resolve, reject) => {
      dns.resolve4('www.google.com', (err, res) => {
        if (err) resolve();
        else if (res.length > 0) {
          const host = res[0];
          const conn = createCallbackConnection({
            host: host,
            connectTimeout: 500
          });
          conn.connect((err) => {});
          conn.end();
          resolve();
        }
      });
    });
  });

  test('connection without database', async () => {
    const conn = await createConnection({ database: null });
    const res = await conn.query('SELECT DATABASE() as a');
    assert.deepEqual(res, [{ a: null }]);
    await conn.end();
  });

  test('connection timeout connect (wrong url) with promise', async () => {
    const initTime = Date.now();
    await new Promise((resolve, reject) => {
      dns.resolve4('www.google.com', function (err, res) {
        if (err) {
          // skipping since DNS not available
          resolve();
        } else if (res.length > 0) {
          const host = res[0];
          createConnection({ host: host, connectTimeout: 1000 })
            .then(() => {
              reject(new Error('must have thrown error'));
            })
            .catch((err) => {
              if (err.code !== 'ER_CONNECTION_TIMEOUT' && err.code !== 'ETIMEDOUT') {
                if (err.code === 'ENOTFOUND' || err.code === 'ENETUNREACH') {
                  // if no network access or IP¨v6 not allowed, just skip error
                  resolve();
                  return;
                }
                console.log(err);
              }
              if (err.code === 'ER_CONNECTION_TIMEOUT') {
                assert.isTrue(
                  err.message.includes(
                    '(conn:-1, no: 45012, SQLState: 08S01) Connection timeout: failed to create socket after'
                  )
                );
              }
              assert.isTrue(Date.now() - initTime >= 990, 'expected > 990, but was ' + (Date.now() - initTime));
              assert.isTrue(Date.now() - initTime < 2000, 'expected < 2000, but was ' + (Date.now() - initTime));
              resolve();
            });
        }
      });
    });
  });

  test('connection timeout error (wrong url)', async () => {
    const initTime = Date.now();
    await new Promise((resolve, reject) => {
      dns.resolve4('www.google.com', (err, res) => {
        if (err) resolve();
        else if (res.length > 0) {
          const host = res[0];
          createConnection({ host: host, connectTimeout: 1000 }).catch((err) => {
            if (err.code !== 'ER_CONNECTION_TIMEOUT' && err.code !== 'ETIMEDOUT') {
              if (err.code === 'ENOTFOUND' || err.code === 'ENETUNREACH') {
                // if no network access or IP¨v6 not allowed, just skip error
                resolve();
                return;
              }
              console.log(err);
            }
            if (err.code === 'ER_CONNECTION_TIMEOUT') {
              assert.isTrue(
                err.message.includes(
                  '(conn:-1, no: 45012, SQLState: 08S01) Connection timeout: failed to create socket after'
                )
              );
            }
            assert.isTrue(Date.now() - initTime >= 990, 'expected > 990, but was ' + (Date.now() - initTime));
            assert.isTrue(Date.now() - initTime < 2000, 'expected < 2000, but was ' + (Date.now() - initTime));
            resolve();
          });
        }
      });
    });
  });

  test('changing session state', async ({ skip }) => {
    if (
      (shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(10, 2, 2)) ||
      (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 7, 4)) ||
      isMaxscale(shareConn)
    ) {
      //session tracking not implemented
      return skip();
    }
    if (!utf8Collation()) return skip();

    const conn = await createConnection();
    if (
      (shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(10, 3, 1)) ||
      (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 2, 2))
    ) {
      //mariadb session tracking default value was empty before 10.3.1
      await conn.query(
        'SET @@session_track_system_variables = ' +
          "'autocommit, character_set_client, character_set_connection, character_set_results, time_zone'"
      );
    }
    // assert.equal(conn.__tests.getCollation(), Collations.fromName('UTF8MB4_UNICODE_CI'));
    await conn.query("SET time_zone = '+00:00', character_set_client = cp850");
    //encoding supported by iconv.js, but not by node.js
    assert.equal(conn.__tests.getCollation(), Collations.fromName('CP850_GENERAL_CI'));
    await conn.query("SET character_set_client = latin1, time_zone = '+01:00'");
    //encoding supported by node.js
    assert.equal(conn.__tests.getCollation(), Collations.fromName('LATIN1_SWEDISH_CI'));
    await conn.end();
  });

  function padStartZero(val, length) {
    val = '' + val;
    const stringLength = val.length;
    let add = '';
    while (add.length + stringLength < length) add += '0';
    return add + val;
  }

  test('connection.connect() error code validation callback', async () => {
    const conn = createCallbackConnection({
      user: 'fooUser',
      password: 'myPwd',
      allowPublicKeyRetrieval: true,
      connectTimeout: 1000
    });

    conn.on('error', (err) => {});
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (!err) {
          reject(new Error('must have thrown error'));
        } else {
          switch (err.errno) {
            case 45012:
              assert.equal(err.sqlState, '08S01');
              break;

            case 45025:
              //Client does not support authentication protocol
              assert.equal(err.sqlState, '08004');
              break;

            case 1251:
              //authentication method unavailable
              assert.equal(err.sqlState, '08004');
              break;

            case 1524:
              //GSSAPI plugin not loaded
              assert.equal(err.sqlState, 'HY000');
              break;

            case 1045:
              assert.equal(err.sqlState, '28000');
              break;

            case 1044:
              //mysql
              assert.equal(err.sqlState, '42000');
              break;

            case 1698:
              assert.equal(err.sqlState, '28000');
              break;

            default:
              reject(err);
              return;
          }
          resolve();
        }
      });
    });
  }, 10000);

  test('connection.connect() error code validation promise', async () => {
    try {
      await createConnection({ user: 'fooUser', password: 'myPwd', allowPublicKeyRetrieval: true });
    } catch (err) {
      switch (err.errno) {
        case 45012:
          //Client does not support authentication protocol
          assert.equal(err.sqlState, '08S01');
          break;
        case 45025:
          //Client does not support authentication protocol
          assert.equal(err.sqlState, '08004');
          break;

        case 1251:
          //authentication method unavailable
          assert.equal(err.sqlState, '08004');
          break;

        case 1524:
          //GSSAPI plugin not loaded
          assert.equal(err.sqlState, 'HY000');
          break;

        case 1045:
          assert.equal(err.sqlState, '28000');
          break;

        case 1044:
          //mysql
          assert.equal(err.sqlState, '42000');
          break;

        case 1698:
          assert.equal(err.sqlState, '28000');
          break;

        default:
          throw err;
      }
    }
  }, 10000);

  test('connection error connect event', async () => {
    const conn = createCallbackConnection({ user: 'fooUser' });
    conn.on('error', (err) => {});
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (!err) {
          reject(new Error('must have thrown error'));
        } else {
          resolve();
        }
      });
    });
  });

  test('connection on error promise', async () => {
    let errorThrown = false;
    try {
      await createConnection({ user: 'fooUser' });
    } catch (err) {
      errorThrown = true;
    }
    if (!errorThrown) {
      throw new Error('must have thrown error');
    }
  });

  test('connection validity', async () => {
    let connOptionTemp = Conf.baseConfig;
    const conn = new Connection(new ConnOptions(connOptionTemp));

    assert.isTrue(!conn.isValid());
    await conn.connect();
    assert.isTrue(conn.isValid());
    await new Promise(conn.end.bind(conn, null));
    assert.isTrue(!conn.isValid());
  });

  test('changing database', async () => {
    let currDb = Conf.baseConfig.database;
    const conn = await createConnection();
    assert.equal(currDb, conn.info.database);
    await conn.query('CREATE DATABASE IF NOT EXISTS changedb');
    await conn.query('USE changedb');
    if (
      ((shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 2)) ||
        (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(5, 7))) &&
      !isMaxscale(conn)
    ) {
      //ok packet contain meta change
      assert.equal(conn.info.database, 'changedb');
    }
    conn.query('use ' + currDb);
    conn.query('DROP DATABASE changedb');
    await conn.end();
  });

  test('pause socket', async () => {
    const conn = await createConnection();
    conn.pause();
    const startTime = process.hrtime();
    setTimeout(() => {
      conn.resume();
    }, 500);

    const rows = await conn.query("SELECT '1'");
    assert.deepEqual(rows, [{ 1: '1' }]);
    const diff = process.hrtime(startTime);
    await conn.end();
    //query has taken more than 500ms
    assert.isTrue(diff[1] > 499000000, ' diff[1]:' + diff[1] + ' expected to be more than 500000000');
  });

  test('pause socket callback', async () => {
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        conn.pause();
        const startTime = process.hrtime();
        setTimeout(() => {
          conn.resume();
        }, 500);

        conn.query("SELECT '1'", (err, rows) => {
          if (err) {
            reject(err);
          } else {
            assert.deepEqual(rows, [{ 1: '1' }]);
            const diff = process.hrtime(startTime);
            //query has taken more than 500ms
            assert.isTrue(diff[1] > 499000000, ' diff[1]:' + diff[1] + ' expected to be more than 500000000');
            conn.end();
            resolve();
          }
        });
      });
    });
  });

  test('charset change', async ({ skip }) => {
    if (!shareConn.info.isMariaDB()) {
      //session tracking not implemented
      return skip();
    }
    const con = await createConnection({ charset: 'latin7' });
    await con.query('set names utf8mb3');
    assert.isTrue(con.info.collation.charset.includes('utf8'), con.info.collation.charset);
    await con.end();
  });

  test.sequential(
    'error reaching max connection',
    async ({ skip }) => {
      // error occurs on handshake packet, with old error format
      if (isMaxscale(shareConn)) return skip();

      const res = await shareConn.query('select @@max_connections as a');
      const resConn = await shareConn.query("SHOW STATUS LIKE 'Threads_connected'");
      const limit = res[0].a - BigInt(resConn[0].Value);
      if (limit < 600) {
        const conns = [];
        try {
          for (let i = 0; i < limit + 10n; i++) {
            const con = await createConnection();
            conns.push(con);
          }
        } catch (err) {
          assert.equal(err.sqlState, 'HY000');
          assert.equal(err.errno, 1040);
          assert.equal(err.code, 'ER_CON_COUNT_ERROR');

          // now that all connections are in use, destroy a query without creating a killing new connection
          conns[0].query(
            'select c1.* from information_schema.columns as c1, information_schema.tables, ' +
              'information_schema.tables as t2'
          );
          conns[0].destroy();
          await new Promise(function (resolve, reject) {
            setTimeout(async function () {
              await Promise.allSettled(
                conns.map((conn) => conn.end().catch((err) => console.warn('Connection close failed:', err.message)))
              );
              resolve();
            }, 2000);
          });
        }
      }
    },
    10000
  );

  test('API escapeId error', async () => {
    try {
      shareConn.escapeId('');
      throw new Error('should have thrown error!');
    } catch (err) {
      assert.equal(err.sqlState, '0A000');
      assert.equal(err.code, 'ER_NULL_ESCAPEID');
    }
    try {
      shareConn.escapeId('\u0000ff');
      throw new Error('should have thrown error!');
    } catch (err) {
      assert.equal(err.sqlState, '0A000');
      assert.equal(err.code, 'ER_NULL_CHAR_ESCAPEID');
    }
  });

  test('API escapeId', function () {
    const conn = createCallbackConnection();
    assert.equal(shareConn.escapeId('good_$one'), '`good_$one`');
    assert.equal(conn.escapeId('good_$one'), '`good_$one`');
    assert.equal(shareConn.escapeId('f:a'), '`f:a`');
    assert.equal(conn.escapeId('f:a'), '`f:a`');
    assert.equal(shareConn.escapeId('good_`è`one'), '`good_``è``one`');
    assert.equal(conn.escapeId('good_`è`one'), '`good_``è``one`');
    conn.end();
  });

  test('debug', () => {
    const conn = createCallbackConnection();
    conn.debug(true);
    conn.debug(false);
    conn.debugCompress(true);
    conn.debugCompress(false);
    conn.end();
  });

  test('API format error', async () => {
    try {
      shareConn.format('fff');
      throw new Error('should have thrown error!');
    } catch (err) {
      assert.equal(err.sqlState, '0A000');
      assert.equal(err.code, 'ER_NOT_IMPLEMENTED_FORMAT');
    }
    const conn = createCallbackConnection();
    try {
      conn.format('fff');
      throw new Error('should have thrown error!');
    } catch (err) {
      assert.equal(err.sqlState, '0A000');
      assert.equal(err.code, 'ER_NOT_IMPLEMENTED_FORMAT');
      conn.end();
    }
  });
  describe.sequential('expiration', () => {
    test('connection error if user expired', async ({ skip }) => {
      if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 4, 3) || isMaxscale(shareConn)) {
        //session tracking not implemented
        return skip();
      }
      if (!utf8Collation()) return skip();
      await shareConn.query('set global disconnect_on_expired_password= ON');

      await shareConn.query("DROP USER IF EXISTS 'jeffrey2'" + getHostSuffix());
      await shareConn.query(
        "CREATE USER 'jeffrey2'" + getHostSuffix() + " IDENTIFIED BY '5$?kLOPµ€rd' PASSWORD EXPIRE INTERVAL 1 DAY"
      );
      await shareConn.query('GRANT ALL ON `' + Conf.baseConfig.database + "`.* TO 'jeffrey2'" + getHostSuffix());
      await shareConn.query('set @tstamp_expired= UNIX_TIMESTAMP(NOW() - INTERVAL 3 DAY)');
      await shareConn.query(
        'update mysql.global_priv set\n' +
          "    priv=json_set(priv, '$.password_last_changed', @tstamp_expired)\n" +
          "    where user='jeffrey2'"
      );
      await shareConn.query('flush privileges');
      try {
        await createConnection({
          user: 'jeffrey2',
          password: '5$?kLOPµ€rd'
        });
        throw new Error('must have thrown error !');
      } catch (err) {
        console.log(err);
        assert.equal(err.sqlState, 'HY000', err.message);
        assert.equal(err.code, 'ER_MUST_CHANGE_PASSWORD_LOGIN');
      } finally {
        await shareConn.query('set global disconnect_on_expired_password= OFF');
      }
    });

    test('connection with expired user', async ({ skip }) => {
      if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 4, 3) || isMaxscale(shareConn)) {
        //session tracking not implemented
        return skip();
      }
      if (!utf8Collation()) return skip();
      shareConn.query("DROP USER IF EXISTS 'jeffrey'" + getHostSuffix());
      shareConn.query('set global disconnect_on_expired_password= ON');
      shareConn.query(
        "CREATE USER 'jeffrey'" + getHostSuffix() + " IDENTIFIED BY '5$?tuiHLKyklµ€rd' PASSWORD EXPIRE INTERVAL 1 DAY"
      );
      shareConn.query('GRANT ALL ON `' + Conf.baseConfig.database + "`.* TO 'jeffrey'" + getHostSuffix());
      shareConn.query('set @tstamp_expired= UNIX_TIMESTAMP(NOW() - INTERVAL 3 DAY)');
      shareConn.query(
        'update mysql.global_priv set\n' +
          "    priv=json_set(priv, '$.password_last_changed', @tstamp_expired)\n" +
          "    where user='jeffrey'"
      );
      await shareConn.query('flush privileges');
      const conn = await createConnection({
        user: 'jeffrey',
        password: '5$?tuiHLKyklµ€rd',
        permitConnectionWhenExpired: true
      });
      await conn.query("SET PASSWORD = PASSWORD('5$?tuiHLKyklµ€rdssss')");
      shareConn.query('set global disconnect_on_expired_password= OFF');
      await conn.end();
    });
  });

  test('collation index > 255', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    if (!shareConn.info.isMariaDB()) return skip(); // requires mariadb 10.2+
    const conn = await createConnection({ collation: 'UTF8MB4_UNICODE_520_NOPAD_CI' });
    const res = await conn.query('SELECT @@COLLATION_CONNECTION as c');
    assert.equal(res[0].c, 'utf8mb4_unicode_520_nopad_ci');
    await conn.end();
  });
});
