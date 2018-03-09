"use strict";

const base = require("../base.js");
const assert = require("chai").assert;
const Collations = require("../../src/const/collations");

describe("connection state change", () => {
  it("session state change", done => {
    if (
      (shareConn.isMariaDB() && !shareConn.hasMinVersion(10, 2, 2)) ||
      (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 4))
    ) {
      //session tracking not implemented
      this.skip();
    }

    if (
      (shareConn.isMariaDB() && !shareConn.hasMinVersion(10, 3, 1)) ||
      (shareConn.isMariaDB() && shareConn.hasMinVersion(10, 2, 2))
    ) {
      //mariadb session tracking default value was empty before 10.3.1
      shareConn.query(
        "SET @@session_track_system_variables = " +
          "'autocommit, character_set_client, character_set_connection, character_set_results, time_zone'"
      );
    }

    assert.equal(shareConn.opts.collation, Collations.fromName("UTF8MB4_UNICODE_CI"));
    shareConn.query("SET time_zone = '+00:00', character_set_client = cp850", (err, rows) => {
      assert.ifError(err);
      assert.equal(shareConn.opts.collation, Collations.fromName("CP850_GENERAL_CI"));
      done();
    });
  });
});
