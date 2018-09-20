"use strict";

const base = require("../base.js");
const { assert } = require("chai");

describe("basic query", () => {
  it("query with value without placeholder", function(done) {
    base
      .createConnection()
      .then(conn => {
        conn
          .query("select 1", [2])
          .then(rows => {
            assert.deepEqual(rows, [{ "1": 1 }]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it("parameter last", done => {
    const value = "'`\\";
    base
      .createConnection()
      .then(conn => {
        conn.query("CREATE TEMPORARY TABLE parse(t varchar(128))");
        conn.query("INSERT INTO `parse` value (?)", value);
        conn
          .query("select * from `parse` where t = ?", value)
          .then(res => {
            assert.strictEqual(res[0].t, value);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it("permitSetMultiParamEntries set", done => {
    const jsonValue = { id: 1, val: "test" };
    base
      .createConnection({ permitSetMultiParamEntries: true })
      .then(conn => {
        conn.query("CREATE TEMPORARY TABLE setTable(id int, val varchar(128))");
        conn.query("INSERT INTO setTable SET ?", jsonValue);
        conn
          .query("select * from setTable")
          .then(res => {
            assert.deepEqual(res[0], jsonValue);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it("query with escape values", function(done) {
    base
      .createConnection()
      .then(conn => {
        conn
          .query(
            "select /* \\ ? ` # */ '\\\\\"\\'?' as a, ' ' as b, ? as c, \"\\\\'\\\"?\" as d, \" \" as e\n" +
              ", ? -- comment \n" +
              "  as f # another comment",
            ["val", "val2"]
          )
          .then(rows => {
            assert.deepEqual(rows, [
              {
                a: "\\\"'?",
                b: " ",
                c: "val",
                d: "\\'\"?",
                e: " ",
                f: "val2"
              }
            ]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it("query with end of line comment", function(done) {
    base
      .createConnection()
      .then(conn => {
        conn
          .query("select /* blabla */ 1 -- test comment\n , ?", ["val"])
          .then(rows => {
            assert.deepEqual(rows, [
              {
                1: 1,
                val: "val"
              }
            ]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it("query with # end of line comment", function(done) {
    base
      .createConnection()
      .then(conn => {
        conn
          .query("select /* blabla */ 1 # test comment\n , ?", ["val"])
          .then(rows => {
            assert.deepEqual(rows, [
              {
                1: 1,
                val: "val"
              }
            ]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });
});
