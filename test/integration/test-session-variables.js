"use strict";

const base = require("../base.js");
const { assert } = require("chai");

describe("session variables", () => {
  it("with empty session variables", function(done) {
    base
      .createConnection({ sessionVariables: {} })
      .then(conn => {
        conn
          .query("SELECT 1")
          .then(rows => {
            assert.deepEqual(rows, [{ "1": 1 }]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it("with one session variables", function(done) {
    base
      .createConnection({ sessionVariables: { wait_timeout: 10000 } })
      .then(conn => {
        conn
          .query("SELECT @wait_timeout")
          .then(rows => {
            assert.deepEqual(rows, [{ "@wait_timeout": 10000 }]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it("with multiple session variables", function(done) {
    base
      .createConnection({
        sessionVariables: { wait_timeout: 10000, interactive_timeout: 2540 },
        debug: true
      })
      .then(conn => {
        conn
          .query("SELECT @wait_timeout, @interactive_timeout")
          .then(rows => {
            assert.deepEqual(rows, [{ "@wait_timeout": 10000, "@interactive_timeout": 2540 }]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it("error handling", function(done) {
    base
      .createConnection({ sessionVariables: { wait_timeout: "String value" }, debug: true })
      .then(conn => {
        conn.on("error", err => {
          assert(err.message.includes("Error setting session variable"));
          assert.equal(err.sqlState, "08S01");
          assert.equal(err.code, "ER_SETTING_SESSION_ERROR");
          done();
        });
      })
      .catch(done);
  });
});
