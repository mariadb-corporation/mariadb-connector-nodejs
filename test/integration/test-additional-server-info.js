"use strict";

const base = require("../base.js");
const { assert } = require("chai");

describe("server additional information API", () => {
  it("server version", function(done) {
    shareConn
      .query("SELECT VERSION() a")
      .then(res => {
        assert.deepEqual(res, [{ a: shareConn.serverVersion() }]);
        done();
      })
      .catch(done);
  });

  it("server type", function() {
    if (!process.env.DB) this.skip();
    if (process.env.DB.indexOf(":") != -1) {
      const serverInfo = process.env.DB.split(":");
      assert.equal(serverInfo[0] === "mariadb", shareConn.isMariaDB());
    } else {
      //appveyor use mariadb only
      assert(shareConn.isMariaDB());
    }
  });
});
