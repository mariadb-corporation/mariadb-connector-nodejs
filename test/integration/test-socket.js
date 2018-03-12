"use strict";

const base = require("../base.js");
const assert = require("chai").assert;

describe("test socket", () => {
  it("named pipe", function(done) {
    if (process.platform !== "win32") this.skip();
    if (process.env.MUST_USE_TCPIP) this.skip();
    const conn = base.createConnection({ socketPath: "\\\\.\\pipe\\MySQL" });
    conn.connect(err => {
      if (err) {
        done(err);
      } else {
        //ensure double connect execute callback immediately
        conn.connect(err => {
          conn.query("DO 1", (err, res) => {
            if (err) done(err);
            conn.end(() => {
              conn.connect(err => {
                assert.isTrue(err.message.includes("Connection closed"));
                done();
              });
            });
          });
        });
      }
    });
  });

  it("unix socket", function(done) {
    if (process.env.MUST_USE_TCPIP) this.skip();
    if (process.platform === "win32") this.skip();
    if (shareConn.opts.host !== "localhost") this.skip();

    shareConn.query("select @@version_compile_os,@@socket soc", (err, res) => {
      const conn = base.createConnection({ socketPath: res[0].soc });
      conn.connect(err => {
        if (err) done();
        conn.query("DO 1", (err, res) => {
          if (err) done(err);
          conn.end(() => {
            done();
          });
        });
      });
    });
  });
});
