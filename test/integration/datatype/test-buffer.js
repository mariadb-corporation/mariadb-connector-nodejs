"use strict";

const base = require("../../base");
const assert = require("chai").assert;

describe("buffer", () => {
  it("query a basic buffer", done => {
    shareConn.query("SELECT x'FF00' val", (err, rows) => {
      if (err) throw err;
      assert.deepEqual(rows[0].val, Buffer.from([255, 0]));
      done();
    });
  });

  const buf = Buffer.from("let's rocks 🤘");
  const hex = buf.toString("hex").toUpperCase();

  it("execute hex() function result", function(done) {
    shareConn.execute("SELECT HEX(?) t", [buf], function(err, rows) {
      if (err) done(err);
      assert.deepEqual(rows, [{ t: hex }]);
      done();
    });
  });

  it("query hex() function result", function(done) {
    shareConn.query("SELECT HEX(?) t", [buf], function(err, rows) {
      if (err) done(err);
      assert.deepEqual(rows, [{ t: hex }]);
      done();
    });
  });
});
