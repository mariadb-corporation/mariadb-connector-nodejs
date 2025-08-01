//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import * as base from '../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import { createConnection } from '../base.js';
import Conf from '../conf.js';

describe('stored procedure', () => {
  let shareConn;
  beforeAll(async ({ skip }) => {
    shareConn = await createConnection(Conf.baseConfig);
    if (shareConn.serverVersion().includes('maxScale-6.2.0')) return skip();
    await shareConn.query('DROP PROCEDURE IF EXISTS stmtOutParam');
    await shareConn.query('DROP PROCEDURE IF EXISTS stmtSimple');
    await shareConn.query('DROP PROCEDURE IF EXISTS someProc');
    await shareConn.query('DROP FUNCTION IF EXISTS stmtSimpleFunct');

    await shareConn.query('CREATE PROCEDURE stmtSimple (IN p1 INT, IN p2 INT) begin SELECT p1 + p2 t; end');
    await shareConn.query('CREATE PROCEDURE someProc (IN p1 INT, OUT p2 INT) begin set p2 = p1 * 2; end');
    await shareConn.query(
      'CREATE FUNCTION stmtSimpleFunct (p1 INT, p2 INT) RETURNS INT NO SQL\nBEGIN\nRETURN p1 + p2;\n end'
    );
    await shareConn.query('CREATE PROCEDURE stmtOutParam (IN p1 INT, INOUT p2 INT) begin SELECT p1; end');
  });
  afterAll(async () => {
    await shareConn.query('DROP PROCEDURE IF EXISTS stmtOutParam');
    await shareConn.query('DROP PROCEDURE IF EXISTS stmtSimple');
    await shareConn.query('DROP PROCEDURE IF EXISTS someProc');
    await shareConn.query('DROP FUNCTION IF EXISTS stmtSimpleFunct');
    await shareConn.end();
    shareConn = null;
  });

  test('simple call query', async () => {
    const rows = await shareConn.query('call stmtSimple(?,?)', [2, 2]);
    await testRes(shareConn, rows);
  });

  test('simple call query using compression', async () => {
    const conn = await base.createConnection({ compress: true });
    try {
      const rows = await conn.query('call stmtSimple(?,?)', [2, 2]);
      await testRes(shareConn, rows);
    } finally {
      await conn.end();
    }
  });

  test('output call query', async function () {
    await shareConn.query('call someProc(?,@myOutputValue)', [2]);
    const res = await shareConn.query('SELECT @myOutputValue');
    assert.equal(res[0]['@myOutputValue'], 4);
    const res2 = await shareConn.execute('call someProc(?, ?)', [2, null]);
    assert.equal(res2[0][0]['p2'], 4);
  });

  test('simple function', async function () {
    const rows = await shareConn.query('SELECT stmtSimpleFunct(?,?) t', [2, 2]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].t, 4);
  });

  test('call with out parameter query', async function () {
    try {
      await shareConn.query('call stmtOutParam(?,?)', [2, 3]);
      throw new Error('must not be possible since output parameter is not a variable');
    } catch (err) {
      assert.ok(err.message.includes('is not a variable or NEW pseudo-variable in BEFORE trigger'));
    }
  });
});

const testRes = async function (shareConn, res) {
  assert.equal(res.length, 2);
  //results
  assert.equal(res[0][0].t, 4);
  //execution result
  assert.equal(res[1].affectedRows, 0);
  assert.equal(res[1].insertId, 0);
  assert.equal(res[1].warningStatus, 0);
  const rows = await shareConn.query('SELECT 9 t');
  assert.equal(rows[0].t, 9);
};
