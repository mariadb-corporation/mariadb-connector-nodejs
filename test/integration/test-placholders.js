"use strict";

const base = require("../base.js");
const assert = require("chai").assert;

describe("Placeholder", () => {
  it("query placeholder basic test", function(done) {
    base
      .createConnection({ namedPlaceholders: true })
      .then(conn => {
        conn
          .query("select :param1 as val1, :param3 as val3, :param2 as val2", {
            param3: 30,
            param1: 10,
            param2: 20
          })
          .then(rows => {
            assert.deepEqual(rows, [{ val1: 10, val3: 30, val2: 20 }]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it("query placeholder using option", function(done) {
    shareConn
      .query(
        {
          namedPlaceholders: true,
          sql: "select :param1 as val1, :param3 as val3, :param2 as val2"
        },
        { param3: 30, param1: 10, param2: 20 }
      )
      .then(rows => {
        assert.deepEqual(rows, [{ val1: 10, val3: 30, val2: 20 }]);
        done();
      })
      .catch(done);
  });

  it("query ending by placeholder", function(done) {
    shareConn
      .query(
        { namedPlaceholders: true, sql: "select :param-1 as val1, :param-3 as val3, :param-2" },
        { "param-3": 30, "param-1": 10, "param-2": 20 }
      )
      .then(rows => {
        assert.deepEqual(rows, [{ val1: 10, val3: 30, "20": 20 }]);
        done();
      })
      .catch(done);
  });

  it("query named parameters logged in error", function(done) {
    const handleResult = function(err) {
      assert.equal(1146, err.errno);
      assert.equal("42S02", err.sqlState);
      assert.isFalse(err.fatal);
      assert.isTrue(
        err.message.includes(
          "sql: INSERT INTO falseTable(t1, t2, t3, t4, t5) values (:t1, :t2, :t3, :t4, :t5)  - parameters:{'t1':1,'t2':0x01ff,'t3':'hh','t4':'01/01/2001 00:00:00.000','t5':null}"
        )
      );
    };

    base
      .createConnection({ namedPlaceholders: true })
      .then(conn => {
        conn
          .query("INSERT INTO falseTable(t1, t2, t3, t4, t5) values (:t1, :t2, :t3, :t4, :t5) ", {
            t1: 1,
            t2: Buffer.from([0x01, 0xff]),
            t3: "hh",
            t4: new Date(2001, 0, 1, 0, 0, 0),
            t5: null
          })
          .then(() => {
            done(new Error("must have thrown error!"));
          })
          .catch(err => {
            handleResult(err);
            conn.end();
            done();
          });
      })
      .catch(done);
  });

  it("query undefined named parameter", function(done) {
    const handleResult = function(err) {
      assert.equal(err.errno, 45018);
      assert.equal(err.code, "ER_PLACEHOLDER_UNDEFINED");
      assert.equal(err.sqlState, "HY000");
      assert.isFalse(err.fatal);
      assert.ok(
        err.message.includes(
          "Placeholder 'param2' is not defined\n" +
            "sql: INSERT INTO undefinedParameter values (:param3, :param1, :param2) - parameters:{'param1':1,'param3':3,'param4':4}"
        )
      );
    };

    base
      .createConnection({ namedPlaceholders: true })
      .then(conn => {
        conn.query("CREATE TEMPORARY TABLE undefinedParameter (id int, id2 int, id3 int)");
        conn
          .query("INSERT INTO undefinedParameter values (:param3, :param1, :param2)", {
            param1: 1,
            param3: 3,
            param4: 4
          })
          .then(() => {
            done(new Error("must have thrown error!"));
          })
          .catch(err => {
            handleResult(err);
            conn.end();
            done();
          });
      })
      .catch(done);
  });

  it("query missing placeholder parameter", function(done) {
    const handleResult = function(err) {
      assert.equal(err.errno, 45018);
      assert.equal(err.sqlState, "HY000");
      assert.equal(err.code, "ER_PLACEHOLDER_UNDEFINED");
      assert.isFalse(err.fatal);
      assert.ok(
        err.message.includes(
          "Placeholder 't2' is not defined\n" +
            "sql: INSERT INTO execute_missing_parameter values (:t1, :t2, :t3) - parameters:{'t1':1,'t3':3}"
        )
      );
    };
    base
      .createConnection({ namedPlaceholders: true })
      .then(conn => {
        conn.query("CREATE TEMPORARY TABLE execute_missing_parameter (id int, id2 int, id3 int)");
        conn
          .query("INSERT INTO execute_missing_parameter values (:t1, :t2, :t3)", {
            t1: 1,
            t3: 3
          })
          .then(() => {
            done(new Error("must have thrown error!"));
          })
          .catch(err => {
            handleResult(err);
            conn.end();
            done();
          });
      })
      .catch(done);
  });

  it("query no placeholder parameter", function(done) {
    const handleResult = function(err) {
      assert.equal(err.errno, 45018);
      assert.equal(err.sqlState, "HY000");
      assert.isFalse(err.fatal);
      assert.ok(
        err.message.includes(
          "Placeholder 't1' is not defined\n" +
            "sql: INSERT INTO execute_no_parameter values (:t1, :t2, :t3) - parameters:{}"
        )
      );
    };
    base
      .createConnection({ namedPlaceholders: true })
      .then(conn => {
        conn.query("CREATE TEMPORARY TABLE execute_no_parameter (id int, id2 int, id3 int)");
        conn
          .query("INSERT INTO execute_no_parameter values (:t1, :t2, :t3)", [])
          .then(() => {
            done(new Error("must have thrown error!"));
          })
          .catch(err => {
            handleResult(err);
            conn.end();
            done();
          });
      })
      .catch(done);
  });

  it("query to much placeholder parameter", function(done) {
    base
      .createConnection({ namedPlaceholders: true })
      .then(conn => {
        conn.query("CREATE TEMPORARY TABLE to_much_parameters (id int, id2 int, id3 int)");
        conn
          .query("INSERT INTO to_much_parameters values (:t2, :t0, :t1)", {
            t0: 0,
            t1: 1,
            t2: 2,
            t3: 3
          })
          .then(() => {
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });
});
