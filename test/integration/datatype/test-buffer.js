"use strict";

const base = require("../../base");
const assert = require("chai").assert;

describe("buffer", () => {
  it("basic buffer", done => {
    shareConn.query("SELECT x'FF00' val", (err, rows) => {
      if (err) throw err;
      assert.deepEqual(rows[0].val, Buffer.from([255, 0]));
      done();
    });
  });
});
