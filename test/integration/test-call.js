"use strict";

require("../base.js");
const assert = require("chai").assert;

describe("stored procedure", () => {
  before(done => {
    shareConn.query(
      "CREATE PROCEDURE stmtSimple (IN p1 INT, IN p2 INT) begin SELECT p1 + p2 t; end",
      err => done()
    );
  });

  after(done => {
    shareConn.query("DROP PROCEDURE IF EXISTS stmtOutParam", err => {});
    shareConn.query("DROP PROCEDURE IF EXISTS stmtSimple", err => {});
    shareConn.query("DROP FUNCTION IF EXISTS stmtSimpleFunct", err => {
      done();
    });
  });

  it("simple call query", function(done) {
    shareConn.query("call stmtSimple(?,?)", [2, 2], function(err, res, fields) {
      testRes(err, res, done);
    });
  });

  it("simple call execute", function(done) {
    shareConn.execute("call stmtSimple(?,?)", [2, 2], function(err, res, fields) {
      testRes(err, res, done);
    });
  });

  it("simple function", function(done) {
    shareConn.query(
      "CREATE FUNCTION stmtSimpleFunct " +
        "(p1 INT, p2 INT) RETURNS INT NO SQL\nBEGIN\nRETURN p1 + p2;\n end"
    );
    shareConn.query("SELECT stmtSimpleFunct(?,?) t", [2, 2], function(err, res, fields) {
      if (err) {
        done(err);
      } else {
        assert.equal(res.length, 1);
        assert.equal(res[0].t, 4);
      }
    });

    shareConn.execute("SELECT stmtSimpleFunct(?,?) t", [2, 2], function(err, res, fields) {
      if (err) {
        done(err);
      } else {
        assert.equal(res.length, 1);
        assert.equal(res[0].t, 4);
        done();
      }
    });
  });

  it("call with out parameter query", function(done) {
    shareConn.query("CREATE PROCEDURE stmtOutParam (IN p1 INT, INOUT p2 INT) begin SELECT p1; end");
    shareConn.query("call stmtOutParam(?,?)", [2, 3], function(err, res, fields) {
      if (err) {
        assert.ok(
          err.message.includes("is not a variable or NEW pseudo-variable in BEFORE trigger")
        );
        done();
      } else done(new Error("must not be possible since output parameter is not a variable"));
    });
    //TODO remove comment when having proper execute implementation, since out variables must works for execute stmt
    /*
    shareConn.execute('call stmtOutParam(?,?)', [2, 3], function(err, res, fields) {
      if (err) {
        done(err);
      } else {
        assert.equal(res.length, 3);

        //results
        assert.equal(res[0][0].p1, 2);

        //output parameter
        assert.equal(res[1][0].p2, 3);

        //execution result
        assert.equal(res[2].affectedRows, 0);
        assert.equal(res[2].insertId, 0);
        assert.equal(res[2].warningStatus, 0);
        testNextQuery(done);
      }
    });
    */
  });

  function testRes(err, res, done) {
    if (err) {
      done(err);
    } else {
      assert.equal(res.length, 2);
      //results
      assert.equal(res[0][0].t, 4);
      //execution result
      assert.equal(res[1].affectedRows, 0);
      assert.equal(res[1].insertId, 0);
      assert.equal(res[1].warningStatus, 0);
      testNextQuery(done);
    }
  }

  function testNextQuery(done) {
    shareConn.query("SELECT 9 t", function(err, rows) {
      if (err) {
        done(err);
      } else {
        assert.equal(rows[0].t, 9);
        done();
      }
    });
  }
});
