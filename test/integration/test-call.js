'use strict';

require('../base.js');
const base = require('../base.js');
const { assert } = require('chai');

describe('stored procedure', () => {
  before(function (done) {
    if (process.env.SKYSQL || process.env.SKYSQL_HA) this.skip();
    shareConn
      .query('CREATE PROCEDURE stmtSimple (IN p1 INT, IN p2 INT) begin SELECT p1 + p2 t; end')
      .then(() => {
        done();
      })
      .catch(done);
  });

  after((done) => {
    shareConn.query('DROP PROCEDURE IF EXISTS stmtOutParam').catch((err) => {});
    shareConn.query('DROP PROCEDURE IF EXISTS stmtSimple').catch((err) => {});
    shareConn
      .query('DROP FUNCTION IF EXISTS stmtSimpleFunct')
      .then(() => {
        done();
      })
      .catch((err) => {});
  });

  it('simple call query', function (done) {
    shareConn
      .query('call stmtSimple(?,?)', [2, 2])
      .then((rows) => testRes(rows, done))
      .catch(done);
  });

  it('simple call query using compression', function (done) {
    base
      .createConnection({ compress: true })
      .then((conn) => {
        const finish = (err) => {
          conn.end();
          done(err);
        };
        conn
          .query('call stmtSimple(?,?)', [2, 2])
          .then((rows) => testRes(rows, finish))
          .catch(finish);
      })
      .catch(done);
  });

  it('simple function', function (done) {
    shareConn.query(
      'CREATE FUNCTION stmtSimpleFunct ' +
        '(p1 INT, p2 INT) RETURNS INT NO SQL\nBEGIN\nRETURN p1 + p2;\n end'
    );
    shareConn
      .query('SELECT stmtSimpleFunct(?,?) t', [2, 2])
      .then((rows) => {
        assert.equal(rows.length, 1);
        assert.equal(rows[0].t, 4);
        done();
      })
      .catch(done);
  });

  it('call with out parameter query', function (done) {
    shareConn.query('CREATE PROCEDURE stmtOutParam (IN p1 INT, INOUT p2 INT) begin SELECT p1; end');
    shareConn
      .query('call stmtOutParam(?,?)', [2, 3])
      .then(() => {
        done(new Error('must not be possible since output parameter is not a variable'));
      })
      .catch((err) => {
        assert.ok(
          err.message.includes('is not a variable or NEW pseudo-variable in BEFORE trigger')
        );
        done();
      });
  });

  function testRes(res, done) {
    assert.equal(res.length, 2);
    //results
    assert.equal(res[0][0].t, 4);
    //execution result
    assert.equal(res[1].affectedRows, 0);
    assert.equal(res[1].insertId, 0);
    assert.equal(res[1].warningStatus, 0);
    shareConn
      .query('SELECT 9 t')
      .then((rows) => {
        assert.equal(rows[0].t, 9);
        done();
      })
      .catch(done);
  }
});
