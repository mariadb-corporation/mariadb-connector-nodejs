"use strict";

const base = require("../../base.js");
const assert = require("chai").assert;

describe("json", function() {
  it("insert json format", function(done) {
    //server permit JSON format
    if (
      (shareConn.isMariaDB() && !shareConn.hasMinVersion(10, 2, 7)) ||
      (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 8))
    ) {
      this.skip();
    }

    shareConn.query("CREATE TEMPORARY TABLE `test-json-insert-type` (val1 JSON)");
    const obj = { id: 2, val: "test" };
    shareConn.query(
      {
        stringifyObjects: true,
        sql: "INSERT INTO `test-json-insert-type` values (?)"
      },
      [obj]
    );
    shareConn.query("INSERT INTO `test-json-insert-type` values (?)", [JSON.stringify(obj)]);
    validateJSON("test-json-insert-type", done);
  });

  it("insert json format binary", function(done) {
    //server permit JSON format
    if (
      (shareConn.isMariaDB() && !shareConn.hasMinVersion(10, 2, 7)) ||
      (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 8))
    ) {
      this.skip();
    }

    shareConn.query("CREATE TEMPORARY TABLE `test-json-insert-type-bin` (val1 JSON)");
    const obj = { id: 2, val: "test" };

    shareConn.execute(
      {
        stringifyObjects: true,
        sql: "INSERT INTO `test-json-insert-type-bin` values (?)"
      },
      [obj]
    );
    shareConn.execute("INSERT INTO `test-json-insert-type-bin` values (?)", [JSON.stringify(obj)]);
    validateJSON("test-json-insert-type-bin", done);
  });

  function validateJSON(tableName, done) {
    shareConn.query("SELECT * FROM `" + tableName + "`", function(err, rows) {
      if (err) {
        done(err);
      } else {
        if (shareConn.isMariaDB()) {
          const val1 = JSON.parse(rows[0].val1);
          const val2 = JSON.parse(rows[1].val1);
          assert.equal(val1.id, 2);
          assert.equal(val1.val, "test");
          assert.equal(val2.id, 2);
          assert.equal(val2.val, "test");
        } else {
          assert.equal(rows[0].val1.id, 2);
          assert.equal(rows[0].val1.val, "test");
          assert.equal(rows[1].val1.id, 2);
          assert.equal(rows[1].val1.val, "test");
        }
        done();
      }
    });
  }

  it("select json format", function(done) {
    //server permit JSON format
    if (
      (shareConn.isMariaDB() && !shareConn.hasMinVersion(10, 2, 7)) ||
      (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 8))
    ) {
      this.skip();
    }

    shareConn.query(
      "CREATE TEMPORARY TABLE `test-json-return-type` (val1 JSON, val2 LONGTEXT, val3 LONGBLOB)"
    );
    const obj = { id: 2, val: "test" };
    const jsonString = JSON.stringify(obj);
    shareConn.query(
      "INSERT INTO `test-json-return-type` values ('" +
        jsonString +
        "','" +
        jsonString +
        "','" +
        jsonString +
        "')"
    );

    shareConn.query("SELECT * FROM `test-json-return-type`", function(err, rows) {
      if (err) {
        done(err);
      } else {
        if (shareConn.isMariaDB()) {
          assert.equal(rows[0].val1, jsonString);
        } else {
          assert.equal(rows[0].val1.id, 2);
          assert.equal(rows[0].val1.val, "test");
        }
        assert.equal(rows[0].val2, jsonString);
        assert.equal(rows[0].val3, jsonString);

        shareConn.execute("SELECT * FROM `test-json-return-type`", function(err, rows) {
          if (err) {
            done(err);
          } else {
            if (shareConn.isMariaDB()) {
              assert.equal(rows[0].val1, jsonString);
            } else {
              assert.equal(rows[0].val1.id, 2);
              assert.equal(rows[0].val1.val, "test");
            }
            assert.equal(rows[0].val2, jsonString);
            assert.equal(rows[0].val3, jsonString);
            done();
          }
        });
      }
    });
  });
});
