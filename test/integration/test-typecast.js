"use strict";

const base = require("../base.js");
const assert = require("chai").assert;

describe("TypeCast", () => {
  const changeCaseCast = (field, next) => {
    if (field.type == "VAR_STRING") {
      const val = field.string();
      if (field.name.startsWith("upp")) return val.toUpperCase();
      if (field.name.startsWith("low")) return val.toLowerCase();
      return val;
    }
    return next();
  };

  it("query level typecast function", function(done) {
    shareConn.query(
      {
        sql: "SELECT 'blaBLA' as upper, 'blaBLA' as lower, 'blaBLA' as std, 1 as r",
        typeCast: changeCaseCast
      },
      (err, rows) => {
        assert.deepEqual(rows, [{ upper: "BLABLA", lower: "blabla", std: "blaBLA", r: 1 }]);
        done();
      }
    );
  });

  it("connection level typecast function", function(done) {
    const conn = base.createConnection({ typeCast: changeCaseCast });
    conn.connect(() => {
      conn.query(
        "SELECT 'blaBLA' as upper, 'blaBLA' as lower, 'blaBLA' as std, 1 as r",
        (err, rows) => {
          assert.deepEqual(rows, [{ upper: "BLABLA", lower: "blabla", std: "blaBLA", r: 1 }]);
          conn.end();
          done();
        }
      );
    });
  });

  it("query level no typecast", function(done) {
    shareConn.query({ sql: "SELECT 'blaBLA' as upper", typeCast: false }, (err, rows) => {
      assert.deepEqual(rows, [{ upper: Buffer.from("blaBLA") }]);
      done();
    });
  });

  it("connection level typecast function", function(done) {
    const conn = base.createConnection({ typeCast: false });
    conn.connect(() => {
      conn.query("SELECT 'blaBLA' as upper", (err, rows) => {
        assert.deepEqual(rows, [{ upper: Buffer.from("blaBLA") }]);
        conn.end();
        done();
      });
    });
  });


  it("cast fields", function(done) {
    const checkCaseType = (field, next) => {
      assert.equal(field.type, "VAR_STRING");
      assert.equal(field.length, 24);
      return next();
    };
    shareConn.query(
      {
        sql: "SELECT 'blaBLA' as upper",
        typeCast: checkCaseType
      },
      (err, rows) => {
        assert.deepEqual(rows, [{ upper: "BLABLA" }]);
        done();
      }
    );
  });
});
