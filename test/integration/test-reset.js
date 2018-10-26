"use strict";

const base = require("../base.js");
const { assert } = require("chai");

describe("reset connection", () => {
  it("reset user variable", function(done) {
    base
      .createConnection()
      .then(conn => {
        conn
          .query("set @youhou='test'")
          .then(() => {
            return conn.query("select @youhou");
          })
          .then(rows => {
            assert.deepEqual(rows, [{"@youhou": 'test'}]);
            return conn.reset();
          })
          .then(() => {
            return conn.query("select @youhou");
          })
          .then(rows => {
            assert.deepEqual(rows, [{"@youhou": null}]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });


  it("reset temporary tables", function(done) {
    base
    .createConnection()
    .then(conn => {
      conn
      .query("CREATE TEMPORARY TABLE ttt(t varchar(128))")
      .then(() => {
        return conn.query("select * from ttt");
      })
      .then(rows => {
        assert.deepEqual(rows, []);
        return conn.reset();
      })
      .then(() => {
        return conn.query("select * from ttt");
      })
      .then(rows => {
        done(new Error("temporary table must not exist !"));
      })
      .catch(err => {
        assert.equal(err.errno, 1146);
        conn.end();
        done();
      });
    })
    .catch(done);
  });
});
