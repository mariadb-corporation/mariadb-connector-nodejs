"use strict";

const base = require("../base.js");
const assert = require("chai").assert;

describe("ssl", function() {
  it("signed certificate error ", function(done) {
    const conn = base.createConnection({ ssl: true });
    conn.connect(err => {
      if (err) {
        assert.isTrue(err.message.includes("self signed certificate"));
        done();
      } else {
        done(new Error("Must have thrown an exception !"));
      }
    });
  });

  it("signed certificate forcing", function(done) {
    const conn = base.createConnection({ ssl: { rejectUnauthorized: false } });
    conn.connect(err => {
      if (err) {
        done(err);
      } else {
        conn.end();
        done();
      }
    });
  });
});
