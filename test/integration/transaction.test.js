//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import * as ServerStatus from '../../lib/const/server-status';
import * as base from '../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import { createConnection } from '../base.js';
import Conf from '../conf.js';

describe.concurrent('transaction', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
    await shareConn.query('DROP TABLE IF EXISTS testTransaction');
    await shareConn.query('CREATE TABLE testTransaction (v varchar(10))');
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });

  test.sequential('transaction rollback', async () => {
    const conn = await base.createConnection();
    await conn.rollback();
    await conn.query('SET autocommit=0');
    assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
    assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 0);
    await conn.beginTransaction();
    assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
    await conn.query("INSERT INTO testTransaction values ('test')");
    assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
    await conn.rollback();
    assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
    const rows = await conn.query('SELECT count(*) as nb FROM testTransaction');
    assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
    assert.equal(rows[0].nb, 0);
    await conn.end();
  });

  test('transaction rollback with callback', async () => {
    const conn = base.createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect(function (err) {
        if (err) {
          return reject(err);
        } else {
          conn.query('DROP TABLE IF EXISTS testTransaction2', (err) => {
            if (err) {
              return reject(err);
            } else {
              conn.query('CREATE TABLE testTransaction2 (v varchar(10))', (err) => {
                if (err) return reject(err);
                conn.rollback((err) => {
                  if (err) return reject(err);
                  conn.query('SET autocommit=0', (err) => {
                    if (err) return reject(err);
                    assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
                    assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 0);
                    conn.beginTransaction((err) => {
                      if (err) return reject(err);
                      assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
                      conn.query("INSERT INTO testTransaction2 values ('test')");
                      assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
                      conn.rollback((err) => {
                        if (err) return reject(err);
                        assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
                        conn.query('SELECT count(*) as nb FROM testTransaction2', (err, rows) => {
                          if (err) return reject(err);
                          assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
                          assert.equal(rows[0].nb, 0);
                          conn.end(resolve);
                        });
                      });
                    });
                  });
                });
              });
            }
          });
        }
      });
    });
  });

  test('transaction rollback with callback no function', async () => {
    const conn = base.createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect(function (err) {
        if (err) return reject(err);
        conn.query('DROP TABLE IF EXISTS testTransaction5', (err) => {
          if (err) {
            return reject(err);
          } else {
            conn.query('CREATE TABLE testTransaction5 (v varchar(10))', (err) => {
              if (err) return reject(err);
              conn.rollback();
              conn.query('SET autocommit=0', (err) => {
                if (err) return reject(err);
                assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
                assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 0);
                conn.beginTransaction();
                conn.query("INSERT INTO testTransaction5 values ('test')");
                conn.rollback();
                conn.query('SELECT count(*) as nb FROM testTransaction5', (err, rows) => {
                  if (err) return reject(err);
                  assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
                  assert.equal(rows[0].nb, 0);
                  conn.end(resolve);
                });
              });
            });
          }
        });
      });
    });
  });

  test('transaction commit', async function () {
    const conn = await base.createConnection();
    await conn.commit();
    await conn.query('SET autocommit=0');
    assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
    assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 0);
    await conn.beginTransaction();
    assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
    await conn.query("INSERT INTO testTransaction values ('test')");
    assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
    await conn.commit();
    assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
    const rows = await conn.query('SELECT count(*) as nb FROM testTransaction');
    assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
    assert.equal(rows[0].nb, 1);
    await conn.end();
  });

  test('transaction commit error handling', async () => {
    let conn;
    await new Promise((resolve, reject) => {
      base.createConnection().then((con) => {
        conn = con;
        return conn
          .query('SET autocommit=0')
          .then(() => {
            return conn.query('DROP TABLE IF EXISTS testTransaction1');
          })
          .then(() => {
            return conn.query('CREATE TABLE testTransaction1 (v varchar(10))');
          })
          .then(() => {
            return conn.query("INSERT INTO testTransaction1 values ('test')");
          })
          .then(() => {
            process.nextTick(
              conn.__tests.getSocket().destroy.bind(conn.__tests.getSocket(), new Error('close forced'))
            );
            conn
              .commit()
              .then(() => {
                reject('must have thrown error !');
                conn.end();
              })
              .catch((err) => {
                conn.end();
                resolve();
              });
          })
          .catch(reject);
      });
    });
  });

  test('transaction commit no callback with error', async () => {
    const conn = base.createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        conn.query('SET autocommit=0', (err) => {
          if (err) {
            reject(err);
          } else {
            conn.query('DROP TABLE IF EXISTS testTransaction22', (err) => {
              if (err) {
                reject(err);
              } else {
                conn.query('CREATE TABLE testTransaction22 (v varchar(10))', (err) => {
                  if (err) {
                    reject(err);
                  } else {
                    conn.query("INSERT INTO testTransaction22 values ('test')", (err) => {
                      process.nextTick(
                        conn.__tests.getSocket().destroy.bind(conn.__tests.getSocket(), new Error('close forced'))
                      );
                      conn.commit();
                      conn.end(resolve);
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

  test('transaction commit no callback success', async () => {
    const conn = base.createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        conn.query('SET autocommit=0', (err) => {
          if (err) {
            reject(err);
          } else {
            conn.query('DROP TABLE IF EXISTS testTransaction3', (err) => {
              if (err) {
                reject(err);
              } else {
                conn.query('CREATE TABLE testTransaction3 (v varchar(10))', (err) => {
                  if (err) {
                    reject(err);
                  } else {
                    conn.query("INSERT INTO testTransaction3 values ('test')", (err) => {
                      conn.commit();
                      setTimeout(() => {
                        conn.end(resolve);
                      }, 100);
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

  test('transaction commit after end', async () => {
    const conn = await base.createConnection();
    await conn.end();
    try {
      await conn.commit();
      throw new Error('must have thrown error !');
    } catch (err) {
      assert(err.message.includes('Cannot execute new commands: connection closed'));
      assert.equal(err.sqlState, '08S01');
      assert.equal(err.errno, 45013);
      assert.equal(err.code, 'ER_CMD_CONNECTION_CLOSED');
    }
  });

  test('transaction commit with callback', async () => {
    const conn = base.createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) return reject(err);
        conn.query('DROP TABLE IF EXISTS testTransaction4', (err) => {
          if (err) {
            return reject(err);
          } else {
            conn.query('CREATE TABLE testTransaction4 (v varchar(10))', (err) => {
              if (err) return reject(err);
              conn.commit((err) => {
                if (err) return reject(err);
                conn.query('SET autocommit=0', (err) => {
                  if (err) return reject(err);
                  assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
                  assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 0);
                  conn.beginTransaction((err) => {
                    if (err) return reject(err);
                    assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
                    conn.query("INSERT INTO testTransaction4 values ('test')", (err) => {
                      if (err) return reject(err);
                      assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
                      conn.commit((err) => {
                        if (err) return reject(err);
                        assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
                        conn.query('SELECT count(*) as nb FROM testTransaction4', (err, rows) => {
                          if (err) return reject(err);
                          assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
                          assert.equal(rows[0].nb, 1);
                          conn.end(resolve);
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
  }, 5000);
});
