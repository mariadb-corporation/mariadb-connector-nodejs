"use strict";

const base = require("../base.js");
const assert = require("chai").assert;

describe("connection event", () => {
  it("multiple connect call", function(done) {
    const conn = base.createConnection();
    conn.connect(err => {
      if (err) done(err);
      //ensure double connect execute callback immediately
      conn.connect(err => {
        if (err) done(err);
        conn.end(() => {
          conn.connect(err => {
            //normal error
            assert.isTrue(err.message.includes("Connection closed"));
            done();
          });
        });
      });
    });
  });

  it("event", function(done) {
    let eventNumber = 0;
    const conn = base.createConnection();
    conn.on("connect", () => {
      eventNumber++;
    });
    conn.on("error", () => {
      eventNumber++;
    });
    conn.on("end", () => {
      eventNumber++;
    });

    conn.query("KILL CONNECTION_ID()", err => {
      assert.equal(eventNumber, 2);
      conn.end(err => {
        assert.equal(eventNumber, 2);
        done();
      });
    });
  });
});
