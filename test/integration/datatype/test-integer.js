"use strict";

const base = require("../../base.js");
const assert = require("chai").assert;
const Long = require("long");

describe("integer with big value", () => {
  before(done => {
    shareConn.query(
      "CREATE TEMPORARY TABLE testBigint (v BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY)",
      err => {
        if (err) return done(err);
        done();
      }
    );
  });

  it("bigint format", done => {
    shareConn.query("INSERT INTO testBigint values (127), (128)", (err, rows) => {
      assert.strictEqual(rows.insertId, 128);
    });
    shareConn.query("INSERT INTO testBigint values (9007199254740991)", (err, rows) => {
      assert.strictEqual(rows.insertId, 9007199254740991);
    });
    shareConn.query("INSERT INTO testBigint values ()", (err, rows) => {
      assert.strictEqual(rows.insertId.toNumber(), 9007199254740992);
    });
    shareConn.query("SELECT * FROM testBigint", (err, rows) => {
      assert.strictEqual(rows.length, 4);
      assert.strictEqual(rows[0].v, 127);
      assert.strictEqual(rows[1].v, 128);
      assert.strictEqual(rows[2].v, 9007199254740991);
      assert.strictEqual(rows[3].v, 9007199254740992);
      assert.strictEqual(typeof rows[3].v, "number");
    });

    shareConn.query({ supportBigNumbers: true, sql: "SELECT * FROM testBigint" }, (err, rows) => {
      assert.strictEqual(rows.length, 4);
      assert.strictEqual(rows[0].v, 127);
      assert.strictEqual(rows[1].v, 128);
      assert.strictEqual(rows[2].v, 9007199254740991);
      assert.strictEqual(typeof rows[3].v, "object");
      assert.strictEqual(rows[3].v.toString(), "9007199254740992");
    });

    shareConn.query({ bigNumberStrings: true, sql: "SELECT * FROM testBigint" }, (err, rows) => {
      assert.strictEqual(rows.length, 4);
      assert.strictEqual(rows[0].v, "127");
      assert.strictEqual(rows[1].v, "128");
      assert.strictEqual(rows[2].v, "9007199254740991");
      assert.strictEqual(rows[3].v, "9007199254740992");
      assert.strictEqual(typeof rows[3].v, "string");

      done();
    });
  });
});
