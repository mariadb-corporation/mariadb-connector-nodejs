"use strict";

const base = require("../../base.js");
const { assert } = require("chai");
const Long = require("long");

describe("integer with big value", () => {
  before(done => {
    shareConn
      .query("CREATE TEMPORARY TABLE testBigint (v BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY)")
      .then(() => {
        done();
      })
      .catch(done);
  });

  it("bigint format", done => {
    shareConn
      .query("INSERT INTO testBigint values (127), (128)")
      .then(rows => {
        assert.strictEqual(rows.insertId, 128);
        return shareConn.query("INSERT INTO testBigint values (9007199254740991)");
      })
      .then(rows => {
        assert.strictEqual(rows.insertId, 9007199254740991);
        return shareConn.query("INSERT INTO testBigint values ()");
      })
      .then(rows => {
        assert.strictEqual(rows.insertId.toNumber(), 9007199254740992);
        return shareConn.query("SELECT * FROM testBigint");
      })
      .then(rows => {
        assert.strictEqual(rows.length, 4);
        assert.strictEqual(rows[0].v, 127);
        assert.strictEqual(rows[1].v, 128);
        assert.strictEqual(rows[2].v, 9007199254740991);
        assert.strictEqual(rows[3].v, 9007199254740992);
        assert.strictEqual(typeof rows[3].v, "number");
        return shareConn.query({ supportBigNumbers: true, sql: "SELECT * FROM testBigint" });
      })
      .then(rows => {
        assert.strictEqual(rows.length, 4);
        assert.strictEqual(rows[0].v, 127);
        assert.strictEqual(rows[1].v, 128);
        assert.strictEqual(rows[2].v, 9007199254740991);
        assert.strictEqual(typeof rows[3].v, "object");
        assert.strictEqual(rows[3].v.toString(), "9007199254740992");
        return shareConn.query({ bigNumberStrings: true, sql: "SELECT * FROM testBigint" });
      })
      .then(rows => {
        assert.strictEqual(rows.length, 4);
        assert.strictEqual(rows[0].v, 127);
        assert.strictEqual(rows[1].v, 128);
        assert.strictEqual(rows[2].v, 9007199254740991);
        assert.strictEqual(rows[3].v, "9007199254740992");
        assert.strictEqual(typeof rows[3].v, "string");
        done();
      })
      .catch(done);
  });

  it("bigint format null ", done => {
    shareConn.query("CREATE TEMPORARY TABLE testBigintNull (v BIGINT)");
    shareConn.query("INSERT INTO testBigintNull values (127), (null)");

    const checkResult = rows => {
      assert.strictEqual(rows.length, 2);
      assert.strictEqual(rows[0].v, 127);
      assert.strictEqual(rows[1].v, null);
    };

    shareConn.query("SELECT * FROM testBigintNull").then(checkResult);
    shareConn
      .query({ supportBigNumbers: true, sql: "SELECT * FROM testBigintNull" })
      .then(checkResult);
    shareConn.query({ bigNumberStrings: true, sql: "SELECT * FROM testBigintNull" }).then(rows => {
      checkResult(rows);
      done();
    });
  });

  it("numeric fields conversion to int", done => {
    shareConn.query(
      "CREATE TEMPORARY TABLE intAllField (" +
        "t1 TINYINT(1), t2 SMALLINT(1), t3 MEDIUMINT(1), t4 INT(1), t5 BIGINT(1), t6 DECIMAL(1), t7 FLOAT, t8 DOUBLE)"
    );
    shareConn.query(
      "INSERT INTO intAllField VALUES (null, null, null, null, null, null, null, null)"
    );
    shareConn.query("INSERT INTO intAllField VALUES (0, 0, 0, 0, 0, 0, 0, 0)");
    shareConn.query("INSERT INTO intAllField VALUES (1, 1, 1, 1, 1, 1, 1, 1)");
    shareConn.query("INSERT INTO intAllField VALUES (2, 2, 2, 2, 2, 2, 2, 2)");

    shareConn
      .query("SELECT * FROM intAllField")
      .then(res => {
        assert.deepEqual(res, [
          { t1: null, t2: null, t3: null, t4: null, t5: null, t6: null, t7: null, t8: null },
          { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0, t8: 0 },
          { t1: 1, t2: 1, t3: 1, t4: 1, t5: 1, t6: 1, t7: 1, t8: 1 },
          { t1: 2, t2: 2, t3: 2, t4: 2, t5: 2, t6: 2, t7: 2, t8: 2 }
        ]);
        done();
      })
      .catch(done);
  });
});
