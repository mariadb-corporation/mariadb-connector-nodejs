//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import { createConnection, isMaxscale, createCallbackConnection } from '../base.js';
import Conf from '../conf.js';

describe.concurrent('Error', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
    await shareConn.query('SELECT 1');
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });

  test('query error with trace', async () => {
    const conn = await createConnection({ trace: true });
    try {
      await conn.query('wrong query');
      throw new Error('must have thrown error !');
    } catch (err) {
      assert.isTrue(err != null);
      assert.isTrue(err.stack.includes('error.test.js'));
      if (err.errno === 1141) {
        // SKYSQL ERROR
        assert.isTrue(
          err.message.includes(
            'Query could not be tokenized and will hence be rejected. Please ensure that the SQL syntax is correct.'
          )
        );
        assert.equal(err.sqlState, 'HY000');
      } else {
        assert.equal(err.errno, 1064);
        assert.equal(err.code, 'ER_PARSE_ERROR');
        assert.equal(err.sqlState, 42000);
        assert.isTrue(err.message.includes('You have an error in your SQL syntax'));
        assert.isTrue(err.message.includes('sql: wrong query - parameters:[]'));
        assert.isTrue(err.sqlMessage.includes('You have an error in your SQL syntax'));
      }
    }
    await conn.end();
  });

  test('stream type error', async function () {
    try {
      await createConnection({ stream: 'wrong' });
      throw new Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.message.includes('stream option is not a function'));
      assert.equal(err.errno, 45043);
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.code, 'ER_BAD_PARAMETER_VALUE');
    }
  });

  test('query callback error with trace', async () => {
    const conn = createCallbackConnection({ trace: true });
    await new Promise((resolve, reject) => {
      conn.connect((err1) => {
        conn.query('wrong query', (err, rows, meta) => {
          if (!err) {
            reject(new Error('must have thrown error !'));
          } else {
            assert.isTrue(err.stack.includes('error.test.js'));
            if (err.errno === 1141) {
              // SKYSQL ERROR
              assert.isTrue(
                err.message.includes(
                  'Query could not be tokenized and will hence be rejected. ' +
                    'Please ensure that the SQL syntax is correct.'
                )
              );
              assert.equal(err.sqlState, 'HY000');
            } else {
              assert.isTrue(err.message.includes('You have an error in your SQL syntax'));
              assert.isTrue(err.message.includes('sql: wrong query - parameters:[]'));
              assert.equal(err.sqlState, 42000);
              assert.equal(err.errno, 1064);
              assert.equal(err.code, 'ER_PARSE_ERROR');
            }
            conn.end(resolve);
          }
        });
      });
    });
  });

  test('query error sql length', async () => {
    const conn = await createConnection({ debugLen: 10 });
    try {
      await conn.query('wrong query /*comments*/ ?', ['par']);
      throw new Error('must have thrown error !');
    } catch (err) {
      assert.isTrue(err.message.includes('You have an error in your SQL syntax'));
      assert.isTrue(err.message.includes('sql: wrong quer...'));
      assert.equal(err.sqlState, 42000);
      assert.equal(err.errno, 1064);
      assert.equal(err.code, 'ER_PARSE_ERROR');
    }
    await conn.end();
  });

  test('query error parameter length', async () => {
    const conn = await createConnection({ debugLen: 55 });
    try {
      await conn.query('wrong query ?, ?', [123456789, 'long parameter that must be truncated']);
      throw new Error('must have thrown error !');
    } catch (err) {
      assert.isTrue(err.message.includes('You have an error in your SQL syntax'));
      assert.isTrue(err.message.includes("sql: wrong query ?, ? - parameters:[123456789,'long paramete..."));
      assert.equal(err.sql, "wrong query ?, ? - parameters:[123456789,'long paramete...");
      assert.equal(err.sqlState, 42000);
      assert.equal(err.errno, 1064);
      assert.equal(err.code, 'ER_PARSE_ERROR');
      await conn.end();
    }
  });

  test('query error check parameter type', async () => {
    class strangeParam {
      constructor(par) {
        this.param = par;
      }

      toString() {
        return 'addon-' + this.param;
      }
    }
    const o = new Object();
    o.toString = function () {
      return 'objectValue';
    };
    try {
      await shareConn.query('wrong query ?, ?, ?, ?, ?, ?, ?', [
        new strangeParam('bla'),
        true,
        123,
        456.5,
        'long parameter that must be truncated',
        { bla: 4, blou: 't' },
        o
      ]);
      throw new Error('must have thrown error !');
    } catch (err) {
      assert.equal(err.errno, 1064);
      assert.equal(err.code, 'ER_PARSE_ERROR');
      assert.equal(err.sqlState, 42000);
      assert.isTrue(err.message.includes('You have an error in your SQL syntax'), err.message);
      assert.isTrue(
        err.message.includes(
          'wrong query ?, ?, ?, ?, ?, ?, ? - parameters:[addon-bla,true,123,456.5,' +
            '\'long parameter that must be truncated\',{"bla":4,"blou":"t"},{}]'
        )
      );
    }
  });

  test('query error parameter length using namedPlaceholders', async () => {
    const conn = await createConnection({ debugLen: 55, namedPlaceholders: true });
    try {
      await conn.query('wrong query :par1, :par2', {
        par1: 'some param',
        par2: 'long parameter that must be truncated'
      });
      throw new Error('must have thrown error !');
    } catch (err) {
      assert.isTrue(err.message.includes('You have an error in your SQL syntax'));
      assert.isTrue(err.text.includes('You have an error in your SQL syntax'));
      assert.equal(err.sqlState, 42000);
      assert.equal(err.errno, 1064);
      assert.equal(err.code, 'ER_PARSE_ERROR');
      assert.isTrue(err.message.includes("sql: wrong query :par1, :par2 - parameters:{'par1':'some par..."));
      assert.equal(err.sql, "wrong query :par1, :par2 - parameters:{'par1':'some par...");

      await conn.end();
    }
  });

  test('query error without trace', async () => {
    const conn = await createConnection({ trace: false });
    try {
      await conn.query('wrong query');
      throw new Error('must have thrown error !');
    } catch (err) {
      assert.isTrue(err != null);
      assert.isTrue(!err.stack.includes('error.test.js'));
      assert.isTrue(err.message.includes('You have an error in your SQL syntax'));
      assert.isTrue(err.message.includes('sql: wrong query - parameters:[]'));
      assert.equal(err.sqlState, 42000);
      assert.equal(err.errno, 1064);
      assert.equal(err.code, 'ER_PARSE_ERROR');
      await conn.end();
    }
  });

  test('query after connection ended', async () => {
    const conn = await createConnection();
    await conn.end();
    try {
      await conn.query('DO 1');
      throw new Error('must have thrown error !');
    } catch (err) {
      assert.isTrue(err != null);
      assert.isTrue(err.message.includes('Cannot execute new commands: connection closed'));
      assert.isTrue(err.message.includes('sql: DO 1 - parameters:[]'));
      assert.equal(err.sql, 'DO 1 - parameters:[]');
      assert.isTrue(err.fatal);
      assert.equal(err.sqlState, '08S01');
      assert.equal(err.code, 'ER_CMD_CONNECTION_CLOSED');
    }
    try {
      await conn.query('DO 1');
      throw new Error('must have thrown error !');
    } catch (err) {
      assert.isTrue(err != null);
      assert.isTrue(err.message.includes('Cannot execute new commands: connection closed'));
      assert.isTrue(err.message.includes('sql: DO 1 - parameters:[]'));
      assert.equal(err.sql, 'DO 1 - parameters:[]');
      assert.isTrue(err.fatal);
      assert.equal(err.sqlState, '08S01');
      assert.equal(err.code, 'ER_CMD_CONNECTION_CLOSED');
    }
    await conn.end();
  });

  test('transaction after connection ended', async () => {
    const conn = await createConnection();
    await conn.end();
    try {
      await conn.beginTransaction();
      throw new Error('must have thrown error !');
    } catch (err) {
      assert.isTrue(err != null);
      assert.isTrue(err.message.includes('Cannot execute new commands: connection closed'));
      assert.isTrue(err.message.includes('sql: START TRANSACTION - parameters:[]'));
      assert.isTrue(err.fatal);
      assert.equal(err.sqlState, '08S01');
      assert.equal(err.code, 'ER_CMD_CONNECTION_CLOSED');
    }
    await conn.end();
  });

  test('server close connection without warning', async ({ skip }) => {
    //removed for maxscale, since wait_timeout will be set to other connections
    if (isMaxscale(shareConn)) return skip();
    let connectionErr = false;
    const conn = await createConnection();
    await conn.query('set @@wait_timeout = 1');
    conn.on('error', (err) => {
      if (!err.message.includes('ECONNRESET')) {
        assert.isTrue(err.message.includes('socket has unexpectedly been closed'));
        assert.equal(err.sqlState, '08S01');
        assert.equal(err.code, 'ER_SOCKET_UNEXPECTED_CLOSE');
      }
      connectionErr = true;
    });
    await new Promise((resolve, reject) => {
      setTimeout(function () {
        conn
          .query('SELECT 2')
          .then(() => {
            reject(new Error('must have thrown error !'));
          })
          .catch((err) => {
            assert.isTrue(err.message.includes('Cannot execute new commands: connection closed'));
            assert.equal(err.sqlState, '08S01');
            assert.equal(err.code, 'ER_CMD_CONNECTION_CLOSED');
            assert.isTrue(connectionErr);
            resolve();
          });
      }, 2000);
    });
  }, 20000);

  test('server close connection - no connection error event', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    if (!process) return skip();
    const conn = await createConnection();
    await new Promise((resolve, reject) => {
      const originalException = process.listeners('uncaughtException').pop();
      process.removeListener('uncaughtException', originalException);

      // Add your own error listener to check for unhandled exceptions
      process.once(
        'uncaughtException',
        function (err) {
          const recordedError = err;

          process.nextTick(function () {
            process.listeners('uncaughtException').push(originalException);
            assert.isTrue(
              recordedError.message.includes('socket has unexpectedly been closed') ||
                recordedError.message.includes('Connection killed by MaxScale') ||
                recordedError.message.includes('ECONNRESET')
            );
            resolve();
          });
        },
        20000
      );

      conn.query('set @@wait_timeout = 1');
      setTimeout(function () {
        conn
          .query('SELECT 2')
          .then(() => {
            reject(new Error('must have thrown error !'));
          })
          .catch((err) => {
            assert.isTrue(err.message.includes('Cannot execute new commands: connection closed'));
            assert.equal(err.sqlState, '08S01');
            assert.equal(err.code, 'ER_CMD_CONNECTION_CLOSED');
          });
      }, 2000);
    });
  });

  test('server close connection during query', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const conn = await createConnection();
    conn.on('error', (err) => {});
    setTimeout(function () {
      shareConn.query('KILL ' + conn.threadId);
    }, 50);
    await new Promise((resolve, reject) => {
      conn
        .query('SELECT SLEEP(5)')
        .then(() => {
          reject(new Error('must have thrown error !'));
        })
        .catch((err) => {
          if (isMaxscale(shareConn)) {
            assert.isTrue(err.message.includes('Lost connection to backend server'), err.message);
            assert.equal(err.sqlState, 'HY000');
          } else {
            assert.isTrue(err.message.includes('socket has unexpectedly been closed'), err.message);
            assert.equal(err.sqlState, '08S01');
            assert.equal(err.code, 'ER_SOCKET_UNEXPECTED_CLOSE');
          }
          resolve();
        });
    });
  }, 20000);

  test('end connection query error', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const conn = await createConnection();
    setTimeout(() => {
      conn.__tests.getSocket().destroy(new Error('close forced'));
    }, 5);
    try {
      await conn.query(
        'select c1.* from information_schema.columns as c1,  information_schema.tables, information_schema.tables as t2'
      );
      throw new Error('must have thrown error !');
    } catch (err) {
      assert.isTrue(
        err.message.includes('close forced') || err.message.includes('socket has unexpectedly been closed')
      );
    }
  });

  test('query parameters logged in error', async () => {
    const handleResult = function (err) {
      assert.equal(err.errno, 1146);
      assert.equal(err.sqlState, '42S02');
      assert.equal(err.code, 'ER_NO_SUCH_TABLE');
      assert.isTrue(!err.fatal);
      assert.isTrue(
        err.message.includes(
          'sql: INSERT INTO falseTable(t1, t2, t3, t4, t5) values (?, ?, ?, ?, ?)  ' +
            "- parameters:[1,0x01ff,'hh','01/01/2001 00:00:00.000',null]"
        )
      );
    };
    await new Promise((resolve, reject) => {
      shareConn
        .query('INSERT INTO falseTable(t1, t2, t3, t4, t5) values (?, ?, ?, ?, ?) ', [
          1,
          Buffer.from([0x01, 0xff]),
          'hh',
          new Date(2001, 0, 1, 0, 0, 0),
          null
        ])
        .then(() => {
          reject(new Error('must have thrown error !'));
        })
        .catch(handleResult);

      shareConn
        .query("SELECT '1'")
        .then((rows) => {
          assert.deepEqual(rows, [{ 1: '1' }]);
          resolve();
        })
        .catch(reject);
    });
  });

  test('query undefined parameter', async function () {
    await shareConn.query('DROP TABLE IF EXISTS undefinedParameter');
    await shareConn.query('CREATE TABLE undefinedParameter (id int, id2 int, id3 int)');
    await shareConn.beginTransaction();
    await shareConn.query('INSERT INTO undefinedParameter values (?, ?, ?)', [1, undefined, 3]);
    const rows = await shareConn.query('SELECT * from undefinedParameter');
    assert.deepEqual(rows, [{ id: 1, id2: null, id3: 3 }]);
    await shareConn.commit();
  });

  test('query missing parameter', async () => {
    const handleResult = function (err) {
      assert.equal(err.errno, 45016);
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.code, 'ER_MISSING_PARAMETER');
      assert.isTrue(!err.fatal);
      assert.ok(
        err.message.includes(
          'Parameter at position 3 is not set\n' +
            'sql: INSERT INTO execute_missing_parameter values (?, ?, ?) - parameters:[1,3]'
        )
      );
    };
    await new Promise((resolve, reject) => {
      shareConn
        .query('DROP TABLE IF EXISTS execute_missing_parameter')
        .then(() => {
          return shareConn.query('CREATE TABLE execute_missing_parameter (id int, id2 int, id3 int)');
        })
        .then(() => {
          return shareConn.query('INSERT INTO execute_missing_parameter values (?, ?, ?)', [1, 3]);
        })
        .then(() => {
          reject(new Error('must have thrown error !'));
        })
        .catch(handleResult);
      shareConn
        .query("SELECT '1'")
        .then((rows) => {
          assert.deepEqual(rows, [{ 1: '1' }]);
          resolve();
        })
        .catch(reject);
    });
  });

  test('query missing parameter with compression', async () => {
    const conn = await createConnection({ compress: true });
    await conn.query('DROP TABLE IF EXISTS execute_missing_parameter2');
    await conn.query('CREATE TABLE execute_missing_parameter2 (id int, id2 int, id3 int)');
    try {
      await conn.query('INSERT INTO execute_missing_parameter2 values (?, ?, ?)', [1, 3]);
      throw new Error('must have thrown error !');
    } catch (err) {
      assert.equal(err.errno, 45016);
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.code, 'ER_MISSING_PARAMETER');
      assert.isTrue(!err.fatal);
      assert.ok(
        err.message.includes(
          'Parameter at position 3 is not set\n' +
            'sql: INSERT INTO execute_missing_parameter2 values (?, ?, ?) - parameters:[1,3]'
        )
      );
      const rows = await conn.query("SELECT '1'");
      assert.deepEqual(rows, [{ 1: '1' }]);
      await conn.end();
    }
  });

  test('query no parameter', async () => {
    await shareConn.query('DROP TABLE IF EXISTS execute_no_parameter');
    await shareConn.query('CREATE TABLE execute_no_parameter (id int, id2 int, id3 int)');
    try {
      await shareConn.query('INSERT INTO execute_no_parameter values (?, ?, ?)', []);
      throw new Error('must have thrown error !');
    } catch (err) {
      assert.equal(err.errno, 45016);
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.code, 'ER_MISSING_PARAMETER');
      assert.isTrue(!err.fatal);
      assert.ok(
        err.message.includes(
          'Parameter at position 1 is not set\n' +
            'sql: INSERT INTO execute_no_parameter values (?, ?, ?) - parameters:[]'
        )
      );
      const rows = await shareConn.query("SELECT '1'");
      assert.deepEqual(rows, [{ 1: '1' }]);
    }
  });

  test('query to much parameter', async () => {
    await shareConn.query('DROP TABLE IF EXISTS to_much_parameters');
    await shareConn.query('CREATE TABLE to_much_parameters (id int, id2 int, id3 int)');
    await shareConn.query('INSERT INTO to_much_parameters values (?, ?, ?) ', [1, 2, 3, 4]);
  });
});
