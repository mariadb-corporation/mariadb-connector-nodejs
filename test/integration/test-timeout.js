"use strict";

const base = require("../base.js");
const assert = require("chai").assert;

describe("connection timeout", function() {
  it("wrong url", function(done) {
    const initTime = Date.now();
    const conn = base.createConnection({ host: "www.google.fr", connectTimeout: 1000 });
    conn.on("error", err => {
      assert.strictEqual(err.message, "(conn=-1) Connection timeout");
      console.log(Date.now() - initTime);
      assert.isTrue(Date.now() - initTime > 1000);
      assert.isTrue(Date.now() - initTime < 1010);
      done();
    });
  });
});
