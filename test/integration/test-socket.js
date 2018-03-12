"use strict";

const base = require("../base.js");
const ServerStatus = require("../../src/const/server-status");
const assert = require("chai").assert;

describe("test socket", () => {

  it("named pipe", function(done) {
    if (process.platform !== 'win32') this.skip();
    const conn = base.createConnection({socketPath: '\\\\.\\pipe\\MySQL'});
    conn.query("DO 1", (err, res) => {
      if (err) done(err);
      conn.end(() => {
        done();
      });
    })
  });

});
