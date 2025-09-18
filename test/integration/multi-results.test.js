//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import { createConnection, createCallbackConnection } from '../base.js';
import Conf from '../conf.js';

describe.concurrent('multi-results', () => {
  let multiStmtConn;
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
    multiStmtConn = await createConnection({ multipleStatements: true });
  });
  afterAll(async () => {
    shareConn.query('DROP PROCEDURE IF EXISTS myProc').catch((err) => {});
    if (multiStmtConn) multiStmtConn.end();
    await shareConn.end();
    shareConn = null;
  });

  test('simple do 1', async () => {
    const rows = await shareConn.query('DO 1');
    assert.deepEqual(rows, {
      affectedRows: 0,
      insertId: 0n,
      warningStatus: 0
    });
  });

  test('duplicate column', async function () {
    const conn = await createConnection();
    await conn.query('DROP TABLE IF EXISTS dupp_col');
    await conn.query('CREATE TABLE dupp_col (i int)');
    await conn.beginTransaction();
    await conn.query('INSERT INTO dupp_col(i) VALUES (1)');
    await conn.query({ rowsAsArray: true, sql: 'SELECT i, i FROM dupp_col' });
    try {
      await conn.query('SELECT i, i FROM dupp_col');
      throw new Error('must have thrown an error');
    } catch (err) {
      assert.isTrue(err.message.includes('Error in results, duplicate field name `i`'));
      assert.equal(err.errno, 45040);
      assert.equal(err.sqlState, 42000);
      assert.equal(err.code, 'ER_DUPLICATE_FIELD');
      conn.rollback();
      await conn.end();
    }
  });

  test('duplicate column disabled', async function () {
    const conn = await createConnection({ checkDuplicate: false });
    await conn.query('DROP TABLE IF EXISTS dupp_col_dis');
    await conn.query('CREATE TABLE dupp_col_dis (i int)');
    await conn.beginTransaction();
    await conn.query('INSERT INTO dupp_col_dis(i) VALUES (1)');
    await conn.query({ rowsAsArray: true, sql: 'SELECT i, i FROM dupp_col_dis' });
    const res = await conn.query('SELECT i, i FROM dupp_col_dis');
    assert.deepEqual(res, [
      {
        i: 1
      }
    ]);
    await conn.end();
  });

  test('duplicate column nestTables', async function () {
    const conn = await createConnection({ nestTables: true });
    await conn.query('DROP TABLE IF EXISTS dupp_col_nested');
    await conn.query('CREATE TABLE dupp_col_nested (i int)');
    await conn.beginTransaction();

    await conn.query('INSERT INTO dupp_col_nested(i) VALUES (1)');
    await conn.query({ rowsAsArray: true, sql: 'SELECT i, i FROM dupp_col_nested' });
    try {
      await conn.query('SELECT i, i FROM dupp_col_nested');
      throw new Error('must have thrown an error');
    } catch (err) {
      assert.isTrue(err.message.includes('Error in results, duplicate field name `dupp_col_nested`.`i`'));
      assert.equal(err.errno, 45040);
      assert.equal(err.sqlState, 42000);
      assert.equal(err.code, 'ER_DUPLICATE_FIELD');
      await conn.end();
    }
  });

  test('nestTables private prop', async function () {
    const conn = await createConnection({ nestTables: true });
    try {
      await conn.query("SELECT * FROM (SELECT 'key_val' as key_pp FROM dual) as __proto__");
      throw new Error('must have thrown an error');
    } catch (err) {
      assert.isTrue(err.message.includes('Use of `__proto__` is not permitted with option `nestTables`'));
      assert.equal(err.errno, 45058);
      assert.equal(err.sqlState, 42000);
      assert.equal(err.code, 'ER_PRIVATE_FIELDS_USE');
    } finally {
      await conn.end();
    }
  });

  test('duplicate column disabled nestTables', async function () {
    const conn = await createConnection({ checkDuplicate: false, nestTables: true });
    await conn.query('DROP TABLE IF EXISTS dupp_col_dis_nested');
    await conn.query('CREATE TABLE dupp_col_dis_nested (i int)');
    await conn.beginTransaction();

    await conn.query('INSERT INTO dupp_col_dis_nested(i) VALUES (1)');
    await conn.query({ rowsAsArray: true, sql: 'SELECT i, i FROM dupp_col_dis_nested' });
    const res = await conn.query('SELECT i, i FROM dupp_col_dis_nested');
    assert.deepEqual(res, [
      {
        dupp_col_dis_nested: {
          i: 1
        }
      }
    ]);
    await conn.end();
  });

  test('simple do 1 with callback', async () => {
    const callbackConn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      callbackConn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          callbackConn.query('DO 1', (err, rows) => {
            if (err) {
              reject(err);
            } else {
              assert.deepEqual(rows, {
                affectedRows: 0,
                insertId: BigInt(0),
                warningStatus: 0
              });
              callbackConn.end();
              resolve();
            }
          });
        }
      });
    });
  });

  test('simple query with sql option and callback', async () => {
    const callbackConn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      callbackConn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          callbackConn.query({ sql: "SELECT '1', '2'", rowsAsArray: true }, (err, rows) => {
            if (err) {
              reject(err);
            } else {
              assert.deepEqual(rows, [['1', '2']]);
              callbackConn.end();
              resolve();
            }
          });
        }
      });
    });
  });

  test('simple do 1 with callback no function', async () => {
    const callbackConn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      callbackConn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          callbackConn.query('DO 1');
          callbackConn.query('DO ?', [2]);
          callbackConn.end();
          resolve();
        }
      });
    });
  });

  test('simple select 1', async () => {
    const rows = await shareConn.query("SELECT '1'");
    assert.deepEqual(rows, [{ 1: '1' }]);
  });

  test('query using callback and promise mode', async () => {
    const rows = await shareConn.query("select '1'", (err, rows) => {});
    assert.deepEqual(rows, [{ 1: '1' }]);
  });

  test('query result with option metaPromiseAsArray', async () => {
    const conn = await createConnection({ metaAsArray: true });
    const obj = await conn.query("select '1'");
    assert.equal(obj.length, 2);
    assert.deepEqual(obj[0], [{ 1: '1' }]);
    await conn.end();
  });

  test('query result with option metaPromiseAsArray multiple', async () => {
    const conn = await createConnection({ metaAsArray: true, multipleStatements: true });
    const obj = await conn.query("select '1'; select '2'");
    assert.equal(obj[0].length, 2);
    assert.equal(obj[1].length, 2);
    assert.deepEqual(obj[0], [[{ 1: '1' }], [{ 2: '2' }]]);
    await conn.end();
  });

  test('simple select 1 with callback', async () => {
    const callbackConn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      callbackConn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          callbackConn.query("SELECT '1'", (err, rows) => {
            if (err) {
              reject(err);
            } else {
              assert.deepEqual(rows, [{ 1: '1' }]);
              callbackConn.end();
              resolve();
            }
          });
        }
      });
    });
  });

  test('multiple selects', async () => {
    const rows = await multiStmtConn.query("SELECT '1' as t; SELECT '2' as t2; SELECT '3' as t3");
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], [{ t: '1' }]);
    assert.deepEqual(rows[1], [{ t2: '2' }]);
    assert.deepEqual(rows[2], [{ t3: '3' }]);
  });

  test('multiple selects with callbacks', async () => {
    const callbackConn = createCallbackConnection({
      multipleStatements: true
    });
    await new Promise((resolve, reject) => {
      callbackConn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          callbackConn.query("SELECT '1' as t; SELECT '2' as t2; SELECT '3' as t3", (err, rows) => {
            if (err) {
              reject(err);
            } else {
              assert.equal(rows.length, 3);
              assert.deepEqual(rows[0], [{ t: '1' }]);
              assert.deepEqual(rows[1], [{ t2: '2' }]);
              assert.deepEqual(rows[2], [{ t3: '3' }]);
              callbackConn.end();
              resolve();
            }
          });
        }
      });
    });
  });

  test('multiple result type', async () => {
    const rows = await multiStmtConn.query("SELECT '1' as t; DO 1");
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], [{ t: '1' }]);
    assert.deepEqual(rows[1], {
      affectedRows: 0,
      insertId: 0n,
      warningStatus: 0
    });
  });

  test('multiple result type with callback', async () => {
    const callbackConn = createCallbackConnection({
      multipleStatements: true
    });
    await new Promise((resolve, reject) => {
      callbackConn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          callbackConn.query("SELECT '1' as t; DO 1", (err, rows) => {
            if (err) {
              reject(err);
            } else {
              assert.equal(rows.length, 2);
              assert.deepEqual(rows[0], [{ t: '1' }]);
              assert.deepEqual(rows[1], {
                affectedRows: 0,
                insertId: 0n,
                warningStatus: 0
              });
              callbackConn.end();
              resolve();
            }
          });
        }
      });
    });
  });

  test('multiple result type with multiple rows', async ({ skip }) => {
    if (shareConn.serverVersion().includes('maxScale-6.2.0')) return skip();
    //using sequence engine
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 1)) return skip();
    const rows = await multiStmtConn.query('select * from seq_1_to_2; DO 1;select * from seq_2_to_3');
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], [{ seq: 1n }, { seq: 2n }]);
    assert.deepEqual(rows[1], {
      affectedRows: 0,
      insertId: 0n,
      warningStatus: 0
    });
    assert.deepEqual(rows[2], [{ seq: 2n }, { seq: 3n }]);
  });

  test('multiple result from procedure', async () => {
    shareConn.query("CREATE PROCEDURE myProc () BEGIN  SELECT '1'; SELECT '2'; END");
    const rows = await shareConn.query('call myProc()');
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], [{ 1: '1' }]);
    assert.deepEqual(rows[1], [{ 2: '2' }]);
    assert.deepEqual(rows[2], {
      affectedRows: 0,
      insertId: 0n,
      warningStatus: 0
    });
  });
});
