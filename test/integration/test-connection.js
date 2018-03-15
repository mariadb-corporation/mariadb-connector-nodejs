"use strict";

const base = require("../base.js");
const assert = require("chai").assert;

describe("connection", () => {
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

  it("connection event subscription", function(done) {
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
      assert.equal(eventNumber, 3);
      done();
    });

    const query = conn.query("KILL CONNECTION_ID()");
    query.on("error", () => {});
  });

  it("connection ping", function(done) {
    shareConn.ping();
    shareConn.ping(err => {
      if (err) done(err);
      done();
    });
  });
});
