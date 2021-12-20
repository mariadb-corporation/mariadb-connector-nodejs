'use strict';

require('../base.js');
const base = require('../base.js');
const { assert } = require('chai');

describe('stored procedure', () => {
  before(async function () {
    if (process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    await shareConn.query(
      'CREATE PROCEDURE stmtSimple (IN p1 INT, IN p2 INT) begin SELECT p1 + p2 t; end'
    );
  });

  after(async () => {
    await shareConn.query('DROP PROCEDURE IF EXISTS stmtOutParam');
    await shareConn.query('DROP PROCEDURE IF EXISTS stmtSimple');
    await shareConn.query('DROP FUNCTION IF EXISTS stmtSimpleFunct');
  });

  it('simple call query', async () => {
    const rows = await shareConn.query('call stmtSimple(?,?)', [2, 2]);
    await testRes(rows);
  });

  it('simple call query using compression', async () => {
    const conn = await base.createConnection({ compress: true });
    try {
      const rows = await conn.query('call stmtSimple(?,?)', [2, 2]);
      await testRes(rows);
    } finally {
      conn.end();
    }
  });

  it('simple function', async function () {
    await shareConn.query(
      'CREATE FUNCTION stmtSimpleFunct ' +
        '(p1 INT, p2 INT) RETURNS INT NO SQL\nBEGIN\nRETURN p1 + p2;\n end'
    );
    const rows = await shareConn.query('SELECT stmtSimpleFunct(?,?) t', [2, 2]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].t, 4);
  });

  it('call with out parameter query', async () => {
    await shareConn.query(
      'CREATE PROCEDURE stmtOutParam (IN p1 INT, INOUT p2 INT) begin SELECT p1; end'
    );
    try {
      await shareConn.query('call stmtOutParam(?,?)', [2, 3]);
      throw new Error('must not be possible since output parameter is not a variable');
    } catch (err) {
      assert.ok(err.message.includes('is not a variable or NEW pseudo-variable in BEFORE trigger'));
    }
  });
});

const testRes = async function (res) {
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
