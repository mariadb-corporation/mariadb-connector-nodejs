"use strict";

const base = require("../base.js");
const { assert } = require("chai");

describe("connection option", () => {
  it("with undefined collation", function(done) {
    base
      .createConnection({ charset: "unknown" })
      .then(() => {
        done(new Error("must have thrown error!"));
      })
      .catch(err => {
        assert(err.message.includes("Unknown charset"));
        done();
      });
  });

  it("timezone Z", function(done) {
    base
      .createConnection({ timezone: "Z" })
      .then(conn => {
        conn.query("SET SESSION time_zone = '+01:00'");
        conn
          .query("SELECT UNIX_TIMESTAMP(?) tt", [new Date("2000-01-01T00:00:00Z")])
          .then(res => {
            assert.deepEqual(res[0].tt, 946681200);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it("timezone +2h", function(done) {
    base
      .createConnection({ timezone: "+02" })
      .then(conn => {
        conn.query("SET SESSION time_zone = '+01:00'");
        conn
          .query("SELECT UNIX_TIMESTAMP(?) tt", [new Date("2000-01-01T00:00:00Z")])
          .then(res => {
            assert.deepEqual(res[0].tt, 946688400);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it("timezone +2h00", function(done) {
    base
      .createConnection({ timezone: "+02:00" })
      .then(conn => {
        conn.query("SET SESSION time_zone = '+01:00'");
        conn
          .query("SELECT UNIX_TIMESTAMP(?) tt", [new Date("2000-01-01T00:00:00Z")])
          .then(res => {
            assert.deepEqual(res[0].tt, 946688400);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it("timezone +1h", function(done) {
    base
      .createConnection({ timezone: "+01:00" })
      .then(conn => {
        conn.query("SET SESSION time_zone = '+01:00'");
        conn
          .query("SELECT UNIX_TIMESTAMP(?) tt", [new Date("2000-01-01T00:00:00+0100")])
          .then(res => {
            assert.deepEqual(res[0].tt, 946681200);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it("wrong timezone format", function(done) {
    base
      .createConnection({ timezone: "+e:00" })
      .then(conn => {
        done(new Error("Must have thrown exception"));
      })
      .catch(err => {
        assert(err.message.includes("timezone format error"));
        done();
      });
  });

  it("nestTables results", function(done) {
    base
      .createConnection({ nestTables: true })
      .then(conn => {
        conn.query("CREATE TEMPORARY TABLE t1 (a varchar(20))");
        conn.query("CREATE TEMPORARY TABLE t2 (b varchar(20))");
        conn.query("INSERT INTO t1 VALUES ('bla'), ('bla2')");
        conn.query("INSERT INTO t2 VALUES ('bou')");
        conn
          .query("SELECT * FROM t1, t2")
          .then(rows => {
            assert.deepEqual(rows, [
              { t1: { a: "bla" }, t2: { b: "bou" } },
              { t1: { a: "bla2" }, t2: { b: "bou" } }
            ]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it("nestTables results", function(done) {
    base
      .createConnection({ nestTables: "_" })
      .then(conn => {
        conn.query("CREATE TEMPORARY TABLE t1 (a varchar(20))");
        conn.query("CREATE TEMPORARY TABLE t2 (b varchar(20))");
        conn.query("INSERT INTO t1 VALUES ('bla'), ('bla2')");
        conn.query("INSERT INTO t2 VALUES ('bou')");
        conn
          .query("SELECT * FROM t1, t2")
          .then(rows => {
            assert.deepEqual(rows, [{ t1_a: "bla", t2_b: "bou" }, { t1_a: "bla2", t2_b: "bou" }]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it("rows as array", function(done) {
    base
      .createConnection({ rowsAsArray: true })
      .then(conn => {
        conn.query("CREATE TEMPORARY TABLE t1 (a varchar(20))");
        conn.query("CREATE TEMPORARY TABLE t2 (b varchar(20))");
        conn.query("INSERT INTO t1 VALUES ('bla'), ('bla2')");
        conn.query("INSERT INTO t2 VALUES ('bou')");
        conn
          .query("SELECT * FROM t1, t2")
          .then(rows => {
            assert.deepEqual(rows, [["bla", "bou"], ["bla2", "bou"]]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it("query option rows as array", function(done) {
    base
      .createConnection()
      .then(conn => {
        conn.query("CREATE TEMPORARY TABLE t1 (a varchar(20))");
        conn.query("CREATE TEMPORARY TABLE t2 (b varchar(20))");
        conn.query("INSERT INTO t1 VALUES ('bla'), ('bla2')");
        conn.query("INSERT INTO t2 VALUES ('bou')");
        conn
          .query({ rowsAsArray: true, sql: "SELECT * FROM t1, t2" })
          .then(rows => {
            assert.deepEqual(rows, [["bla", "bou"], ["bla2", "bou"]]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it("nestTables results", function(done) {
    base
      .createConnection()
      .then(conn => {
        conn.query("CREATE TEMPORARY TABLE t1 (a varchar(20))");
        conn.query("CREATE TEMPORARY TABLE t2 (b varchar(20))");
        conn.query("INSERT INTO t1 VALUES ('bla'), ('bla2')");
        conn.query("INSERT INTO t2 VALUES ('bou')");
        conn
          .query({ nestTables: true, sql: "SELECT * FROM t1, t2" })
          .then(rows => {
            assert.deepEqual(rows, [
              { t1: { a: "bla" }, t2: { b: "bou" } },
              { t1: { a: "bla2" }, t2: { b: "bou" } }
            ]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it("nestTables results", function(done) {
    base
      .createConnection()
      .then(conn => {
        conn.query("CREATE TEMPORARY TABLE t1 (a varchar(20))");
        conn.query("CREATE TEMPORARY TABLE t2 (b varchar(20))");
        conn.query("INSERT INTO t1 VALUES ('bla'), ('bla2')");
        conn.query("INSERT INTO t2 VALUES ('bou')");
        conn
          .query({ nestTables: "_", sql: "SELECT * FROM t1, t2" })
          .then(rows => {
            assert.deepEqual(rows, [{ t1_a: "bla", t2_b: "bou" }, { t1_a: "bla2", t2_b: "bou" }]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });
});
