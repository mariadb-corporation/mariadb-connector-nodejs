"use strict";

const base = require("../base.js");
const assert = require("chai").assert;

describe("Error", () => {
  it("query error", function(done) {
    shareConn.query("wrong query", err => {
      assert.isTrue(err != null);
      assert.isTrue(err.message.includes("You have an error in your SQL syntax"));
      assert.isTrue(err.message.includes("sql: wrong query - parameters:[]"));
      assert.equal(err.errno, 1064);
      assert.equal(err.sqlState, 42000);
      done();
    });
  });

  it("execute error", function(done) {
    shareConn.execute("wrong query", err => {
      assert.isTrue(err != null);
      assert.isTrue(err.message.includes("You have an error in your SQL syntax"));
      assert.isTrue(err.message.includes("sql: wrong query - parameters:[]"));
      assert.equal(err.errno, 1064);
      assert.equal(err.sqlState, 42000);
      done();
    });
  });

  it("query after connection ended", function(done) {
    const conn = base.createConnection();
    conn.connect(() => {
      conn.end(() => {
        conn.query("DO 1", err => {
          assert.isTrue(err != null);
          assert.isTrue(err.message.includes("Cannot execute new commands: connection closed"));
          assert.isTrue(err.message.includes("sql: DO 1 - parameters:[]"));
          assert.isTrue(err.fatal);
          conn.execute("DO 1", err => {
            assert.isTrue(err != null);
            assert.isTrue(err.message.includes("Cannot execute new commands: connection closed"));
            assert.isTrue(err.message.includes("sql: DO 1 - parameters:[]"));
            assert.isTrue(err.fatal);
            done();
          });
        });
      });
    });
  });

  it("transaction after connection ended", function(done) {
    const conn = base.createConnection();
    conn.connect(() => {
      conn.end(() => {
        conn.beginTransaction(err => {
          assert.isTrue(err != null);
          assert.isTrue(err.message.includes("Cannot execute new commands: connection closed"));
          assert.isTrue(err.message.includes("sql: START TRANSACTION - parameters:[]"));
          assert.isTrue(err.fatal);
          done();
        });
      });
    });
  });

  it("server close connection during query", function(done) {
    this.timeout(10000);
    var conn = base.createConnection();
    conn.connect(function(err) {
      conn.query("set @@wait_timeout = 1");
      setTimeout(function() {
        conn.query("SELECT SLEEP(2)", function(err, rows) {
          assert.isTrue(err.message.includes("This socket has been ended by the other party"));
          done();
        });
      }, 2000);
    });
  });

  // it("end connection query error", function(done) {
  //   const conn = base.createConnection();
  //   conn.connect(() => {
  //
  //     // setTimeout(() => {
  //     //   try {
  //     //     conn._socket.destroy(new Error("close forced"));
  //     //   } catch (gg) {}
  //     // }, 50);
  //     //big select
  //     conn.query(
  //       "select * from information_schema.columns as c1,  information_schema.tables, information_schema.tables as t2",
  //       err => {
  //         if (err) {
  //           assert.ok(err.message.includes("close forced"));
  //           done();
  //         } else {
  //           done(new Error("Must have thrown an exception !"));
  //         }
  //       }
  //     );
  //     conn._socket.destroy(new Error("close forced"));
  //   });
  // });
});
