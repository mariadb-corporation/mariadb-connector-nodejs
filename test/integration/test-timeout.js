"use strict";

const base = require("../base.js");
const assert = require("chai").assert;

describe("connection timeout", () => {
  it("wrong url", done => {
    const initTime = Date.now();
    const conn = base.createConnection({ host: "www.google.fr", connectTimeout: 1000 });
    conn.on("error", err => {
      assert.strictEqual(err.message, "(conn=-1) Connection timeout");
      assert.isTrue(Date.now() - initTime >= 1000);
      assert.isTrue(Date.now() - initTime < 1050);
      done();
    });
  });
});
