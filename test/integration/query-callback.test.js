//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import { createConnection, createCallbackConnection, utf8Collation } from '../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import Conf from '../conf.js';

describe('basic query callback', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });

  test('query with value without placeholder', async () => {
    const conn = await createConnection();
    const rows = await conn.query("select '1'", [2]);
    assert.deepEqual(rows, [{ 1: '1' }]);
    await conn.end();
  });

  test('query with null placeholder', async () => {
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        conn.query('select ? as a', [null], (err, rows) => {
          conn.end(() => {
            if (err) {
              reject(err);
            } else {
              assert.deepEqual(rows, [{ a: null }]);
              resolve();
            }
          });
        });
      });
    });
  });

  test('query stack trace', async function () {
    const conn = await createConnection({ trace: true });
    try {
      await conn.query('wrong query');
      throw Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.stack.includes('query-callback.test.js:'), err.stack);
    } finally {
      await conn.end();
    }
  });

  test('query parameter error stack trace', async function () {
    const conn = await createConnection({ trace: true });
    try {
      await conn.query('SELECT', []);
      throw Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.stack.includes('query-callback.test.js:'), err.stack);
    } finally {
      await conn.end();
    }
  });

  test('query with null placeholder no array', async () => {
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        conn.query('select ? as a', null, (err, rows) => {
          conn.end(() => {
            if (err) {
              reject(err);
            } else {
              assert.deepEqual(rows, [{ a: null }]);
              resolve();
            }
          });
        });
      });
    });
  });

  test('parameter last', async () => {
    const value = "'`\\";
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        conn.query('DROP TABLE IF EXISTS parse');
        conn.query('CREATE TABLE parse(t varchar(128))');
        conn.beginTransaction();
        conn.query('INSERT INTO `parse` value (?)', value);
        conn.query('select * from `parse` where t = ?', value, (err, res) => {
          conn.end(() => {
            if (err) {
              reject(err);
            } else {
              assert.strictEqual(res[0].t, value);
              resolve();
            }
          });
        });
      });
    });
  });

  test('array parameter', async () => {
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          conn.query('DROP TABLE IF EXISTS arrayParam');
          conn.query('CREATE TABLE arrayParam (id int, val varchar(10))');
          conn.beginTransaction();
          conn.query("INSERT INTO arrayParam VALUES (1, 'a'), (2, 'b'), (3, 'c'), (4, 'd')");
          conn.query('SELECT * FROM arrayParam WHERE val IN (?)', [['b', 'c', '1']], (err, rows) => {
            conn.end(() => {
              if (err) {
                reject(err);
              } else {
                assert.deepEqual(rows, [
                  {
                    id: 2,
                    val: 'b'
                  },
                  {
                    id: 3,
                    val: 'c'
                  }
                ]);
                resolve();
              }
            });
          });
        }
      });
    });
  });

  test('array parameter with null value', async () => {
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          conn.query('DROP TABLE IF EXISTS arrayParamNull');
          conn.query('CREATE TABLE arrayParamNull (id int, val varchar(10))');
          conn.beginTransaction();
          conn.query('INSERT INTO arrayParamNull VALUES (?)', [[1, null]]);
          conn.query('INSERT INTO arrayParamNull VALUES (?)', [[2, 'a']]);
          conn.query('SELECT * FROM arrayParamNull', null, (err, rows) => {
            conn.end(() => {
              if (err) {
                reject(err);
              } else {
                assert.deepEqual(rows, [
                  {
                    id: 1,
                    val: null
                  },
                  {
                    id: 2,
                    val: 'a'
                  }
                ]);
                resolve();
              }
            });
          });
        }
      });
    });
  });

  test('array parameter with null value with parenthesis', async () => {
    const conn = createCallbackConnection({ arrayParenthesis: true });
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          conn.query('DROP TABLE IF EXISTS arrayParamNullParen');
          conn.query('CREATE TABLE arrayParamNullParen (id int, val varchar(10))');
          conn.beginTransaction();
          conn.query('INSERT INTO arrayParamNullParen VALUES ?', [[1, null]]);
          conn.query('INSERT INTO arrayParamNullParen VALUES ?', [[2, 'a']]);
          conn.query('SELECT * FROM arrayParamNullParen', null, (err, rows) => {
            conn.end(() => {
              if (err) {
                reject(err);
              } else {
                assert.deepEqual(rows, [
                  {
                    id: 1,
                    val: null
                  },
                  {
                    id: 2,
                    val: 'a'
                  }
                ]);
                resolve();
              }
            });
          });
        }
      });
    });
  });

  test('permitSetMultiParamEntries set', async () => {
    const jsonValue = { id: 1, val: 'test' };
    const conn = createCallbackConnection({ permitSetMultiParamEntries: true });
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          conn.query('DROP TABLE IF EXISTS setTable');
          conn.query('CREATE TABLE setTable (id int, val varchar(128))');
          conn.beginTransaction();
          conn.query('INSERT INTO setTable SET ?', jsonValue);
          conn.query('select * from setTable', (err, res) => {
            conn.end(() => {
              if (err) {
                reject(err);
              } else {
                assert.deepEqual(res[0], jsonValue);
                resolve();
              }
            });
          });
        }
      });
    });
  });

  test('query with escape values', async () => {
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          conn.query(
            'select /* \\ ? ` # */ \'\\\\"\\\'?\' as a, \' \' as b, ? as c, "\\\\\'\\"?" as d, " " as e\n' +
              ', ? -- comment \n' +
              '  as f # another comment',
            ['val', 'val2'],
            (err, rows) => {
              conn.end(() => {
                if (err) {
                  reject(err);
                } else {
                  assert.deepEqual(rows, [
                    {
                      a: '\\"\'?',
                      b: ' ',
                      c: 'val',
                      d: '\\\'"?',
                      e: ' ',
                      f: 'val2'
                    }
                  ]);
                  resolve();
                }
              });
            }
          );
        }
      });
    });
  });

  test('query with end of line comment', async () => {
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          conn.query("select /* blabla */ '1' -- test comment\n , ?", ['val'], (err, rows) => {
            conn.end(() => {
              if (err) {
                reject(err);
              } else {
                assert.deepEqual(rows, [
                  {
                    1: '1',
                    val: 'val'
                  }
                ]);
                resolve();
              }
            });
          });
        }
      });
    });
  });

  test('query with # end of line comment', async () => {
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          conn.query("select /* blabla */ '1' # test comment\n , ?", ['val'], (err, rows) => {
            conn.end(() => {
              if (err) {
                reject(err);
              } else {
                assert.deepEqual(rows, [
                  {
                    1: '1',
                    val: 'val'
                  }
                ]);
                resolve();
              }
            });
          });
        }
      });
    });
  });

  test('query warning', async ({ skip }) => {
    //mysql 8 force truncation as error, even with SQL_MODE disable it.
    if (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0)) return skip();
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          conn.query("set @@SQL_MODE = 'ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION'");
          conn.query('DROP TABLE IF EXISTS h');
          conn.query('create table h (c1 varchar(5))');
          conn.query("insert into h values ('123456')", (err, res) => {
            conn.end(() => {
              if (err) {
                reject(err);
              } else {
                assert.equal(res.warningStatus, 1);
                resolve();
              }
            });
          });
        }
      });
    });
  });

  test('255 columns', async () => {
    let table = 'CREATE TABLE myTable(';
    let insert = 'INSERT INTO myTable VALUES (';
    let expRes = {};
    for (let i = 0; i < 255; i++) {
      if (i !== 0) {
        table += ',';
        insert += ',';
      }
      table += 'i' + i + ' int';
      insert += i;
      expRes['i' + i] = i;
    }
    table += ')';
    insert += ')';
    const conn = createCallbackConnection({});
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          conn.query('DROP TABLE IF EXISTS myTable');
          conn.query(table);
          conn.beginTransaction();
          conn.query(insert);
          conn.query('SELECT * FROM myTable', (err, res) => {
            conn.end(() => {
              if (err) {
                reject(err);
              } else {
                assert.deepEqual(res[0], expRes);
                resolve();
              }
            });
          });
        }
      });
    });
  });

  test('escape validation', async ({ skip }) => {
    if (!utf8Collation()) return skip();
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          conn.query('DROP TABLE IF EXISTS tt1');
          conn.query('CREATE TABLE tt1 (id int, tt varchar(256)) CHARSET utf8mb4');
          conn.beginTransaction();
          conn.query('INSERT INTO tt1 VALUES (?,?)', [1, 'jack\nkमस्']);
          conn.query('SELECT * FROM tt1', (err, res) => {
            if (err) {
              reject(err);
            } else {
              assert.equal(res[0].tt, 'jack\nkमस्');
              conn.end(resolve);
            }
          });
        }
      });
    });
  });

  test('permitSetMultiParamEntries escape ', async () => {
    const fctStr = new Object();
    fctStr.toSqlString = () => {
      return "bla'bla";
    };
    const arr = {
      stg: "let'g'o😊",
      bool: false,
      nullVal: null,
      fctSt: fctStr
    };
    await new Promise((resolve, reject) => {
      const conn = createCallbackConnection({ permitSetMultiParamEntries: true });
      conn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          assert.equal(conn.escape(arr), "`stg`='let\\'g\\'o😊',`bool`=false,`nullVal`=NULL,`fctSt`='bla\\'bla'");
          conn.end();
          const conn2 = createCallbackConnection({ permitSetMultiParamEntries: false });
          conn2.connect((err) => {
            if (err) {
              reject(err);
            } else {
              assert.equal(
                conn2.escape(arr),
                '\'{\\"stg\\":\\"let\\\'g\\\'o😊\\",\\"bool\\":false,\\"nullVal\\":null,\\"fctSt\\":{}}\''
              );
              conn2.end(resolve);
            }
          });
        }
      });
    });
  }, 5000);

  test('timeout', async () => {
    const initTime = Date.now();
    const query =
      'select c1.* from information_schema.columns as c1, ' +
      'information_schema.tables, information_schema.tables as t2'; //takes more than 20s
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          conn.query({ sql: query, timeout: 100 }, (err, res) => {
            conn.end(() => {
              if (err) {
                testTimeout(resolve, initTime, err);
              } else {
                reject(new Error('must have thrown an error'));
              }
            });
          });
        }
      });
    });
  }, 20000);

  test('timeout with parameter', async () => {
    const initTime = Date.now();
    const query =
      'select c1.* from information_schema.columns as c1, ' +
      'information_schema.tables, information_schema.tables as t2 WHERE 1 = ?'; //takes more than 20s
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          conn.query({ sql: query, timeout: 100 }, [1], (err, res) => {
            conn.end(() => {
              if (err) {
                testTimeout(resolve, initTime, err);
              } else {
                reject(new Error('must have thrown an error'));
              }
            });
          });
        }
      });
    });
  }, 20000);

  const testTimeout = (resolve, initTime, err) => {
    if (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 1, 2)) {
      const elapse = Date.now() - initTime;
      assert.isOk(elapse < 10000, 'elapse time was ' + elapse + ' but must be less around 100');
      assert.isTrue(err.message.includes('Query execution was interrupted (max_statement_time exceeded)'));
      assert.equal(err.errno, 1969);
      assert.equal(err.sqlState, 70100);
      assert.equal(err.code, 'ER_STATEMENT_TIMEOUT');
    } else {
      if (shareConn.info.isMariaDB()) {
        assert.isTrue(err.message.includes('Cannot use timeout for MariaDB server before 10.1.2. timeout value:'));
      } else {
        assert.isTrue(err.message.includes('Cannot use timeout for MySQL server. timeout value:'));
      }
      assert.equal(err.errno, 45038);
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.code, 'ER_TIMEOUT_NOT_SUPPORTED');
    }
    resolve();
  };
});
