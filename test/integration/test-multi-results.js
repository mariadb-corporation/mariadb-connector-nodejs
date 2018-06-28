"use strict";

const base = require("../base.js");
const { assert } = require("chai");

describe("multi-results", () => {
  let conn;

  before(function(done) {
    base
      .createConnection({ multipleStatements: true })
      .then(con => {
        conn = con;
        done();
      })
      .catch(done);
  });

  after(function() {
    shareConn.query("DROP PROCEDURE myProc");
    conn.end();
  });

  it("simple do 1", function(done) {
    shareConn
      .query("DO 1")
      .then(rows => {
        assert.deepEqual(rows, { affectedRows: 0, insertId: 0, warningStatus: 0 });
        done();
      })
      .catch(done);
  });

  it("simple do 1 with callback", function(done) {
    const callbackConn = base.createCallbackConnection();
    callbackConn.connect(err => {
      if (err) {
        done(err);
      } else {
        callbackConn.query("DO 1", (err, rows) => {
          if (err) {
            done(err);
          } else {
            assert.deepEqual(rows, { affectedRows: 0, insertId: 0, warningStatus: 0 });
            callbackConn.end();
            done();
          }
        });
      }
    });
  });

  it("simple do 1 with callback no function", function(done) {
    const callbackConn = base.createCallbackConnection();
    callbackConn.connect(err => {
      if (err) {
        done(err);
      } else {
        callbackConn.query("DO 1");
        callbackConn.query("DO ?", [2]);
        callbackConn.end();
        done();
      }
    });
  });

  it("simple select 1", function(done) {
    shareConn
      .query("SELECT 1")
      .then(rows => {
        assert.deepEqual(rows, [{ "1": 1 }]);
        done();
      })
      .catch(done);
  });

  it("query using callback and promise mode", function(done) {
    shareConn
      .query("select 1", (err, rows) => {})
      .then(rows => {
        assert.deepEqual(rows, [{ "1": 1 }]);
        done();
      })
      .catch(done);
  });

  it("simple select 1 with callback", function(done) {
    const callbackConn = base.createCallbackConnection();
    callbackConn.connect(err => {
      if (err) {
        done(err);
      } else {
        callbackConn.query("SELECT 1", (err, rows) => {
          if (err) {
            done(err);
          } else {
            assert.deepEqual(rows, [{ "1": 1 }]);
            callbackConn.end();
            done();
          }
        });
      }
    });
  });

  it("multiple selects", function(done) {
    conn
      .query("SELECT 1 as t; SELECT 2 as t2; SELECT 3 as t3")
      .then(rows => {
        assert.equal(rows.length, 3);
        assert.deepEqual(rows[0], [{ t: 1 }]);
        assert.deepEqual(rows[1], [{ t2: 2 }]);
        assert.deepEqual(rows[2], [{ t3: 3 }]);
        done();
      })
      .catch(done);
  });

  it("multiple selects with callbacks", function(done) {
    const callbackConn = base.createCallbackConnection({ multipleStatements: true });
    callbackConn.connect(err => {
      if (err) {
        done(err);
      } else {
        callbackConn.query("SELECT 1 as t; SELECT 2 as t2; SELECT 3 as t3", (err, rows) => {
          if (err) {
            done(err);
          } else {
            assert.equal(rows.length, 3);
            assert.deepEqual(rows[0], [{ t: 1 }]);
            assert.deepEqual(rows[1], [{ t2: 2 }]);
            assert.deepEqual(rows[2], [{ t3: 3 }]);
            callbackConn.end();
            done();
          }
        });
      }
    });
  });

  it("multiple result type", function(done) {
    conn
      .query("SELECT 1 as t; DO 1")
      .then(rows => {
        assert.equal(rows.length, 2);
        assert.deepEqual(rows[0], [{ t: 1 }]);
        assert.deepEqual(rows[1], { affectedRows: 0, insertId: 0, warningStatus: 0 });
        done();
      })
      .catch(done);
  });

  it("multiple result type with callback", function(done) {
    const callbackConn = base.createCallbackConnection({ multipleStatements: true });
    callbackConn.connect(err => {
      if (err) {
        done(err);
      } else {
        callbackConn.query("SELECT 1 as t; DO 1", (err, rows) => {
          if (err) {
            done(err);
          } else {
            assert.equal(rows.length, 2);
            assert.deepEqual(rows[0], [{ t: 1 }]);
            assert.deepEqual(rows[1], { affectedRows: 0, insertId: 0, warningStatus: 0 });
            callbackConn.end();
            done();
          }
        });
      }
    });
  });

  it("multiple result type with multiple rows", function(done) {
    //using sequence engine
    if (!shareConn.isMariaDB() || !shareConn.hasMinVersion(10, 1)) this.skip();
    conn
      .query("select * from seq_1_to_2; DO 1;select * from seq_2_to_3")
      .then(rows => {
        assert.equal(rows.length, 3);
        assert.deepEqual(rows[0], [{ seq: 1 }, { seq: 2 }]);
        assert.deepEqual(rows[1], { affectedRows: 0, insertId: 0, warningStatus: 0 });
        assert.deepEqual(rows[2], [{ seq: 2 }, { seq: 3 }]);
        done();
      })
      .catch(done);
  });

  it("multiple result from procedure", function(done) {
    shareConn.query("CREATE PROCEDURE myProc () BEGIN  SELECT 1; SELECT 2; END");
    shareConn
      .query("call myProc()")
      .then(rows => {
        assert.equal(rows.length, 3);
        assert.deepEqual(rows[0], [{ "1": 1 }]);
        assert.deepEqual(rows[1], [{ "2": 2 }]);
        assert.deepEqual(rows[2], { affectedRows: 0, insertId: 0, warningStatus: 0 });
        done();
      })
      .catch(done);
  });
});
