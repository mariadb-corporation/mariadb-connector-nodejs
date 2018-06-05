"use strict";

const base = require("../base.js");
const assert = require("chai").assert;
const Conf = require("../conf");

describe("test socket", () => {
  it("named pipe", function(done) {
    if (process.platform !== "win32") this.skip();
    if (process.env.MUST_USE_TCPIP) this.skip();
    if (Conf.baseConfig.host !== "localhost" && Conf.baseConfig.host !== "mariadb.example.com")
      this.skip();
    shareConn.query("select @@version_compile_os,@@socket soc", (err, res) => {
      const conn = base.createConnection({ socketPath: "\\\\.\\pipe\\" + res[0].soc });
      conn
        .connect()
        .then(() => {
          //ensure double connect execute callback immediately
          return conn.connect();
        })
        .then(() => {
          conn.query("DO 1", (err, res) => {
            if (err) done(err);
            conn.end().then(() => {
              conn.connect().catch(err => {
                assert.isTrue(err.message.includes("Connection closed"));
                done();
              });
            });
          });
        })
        .catch(done);
    });
  });

  it("unix socket", function(done) {
    if (process.env.MUST_USE_TCPIP) this.skip();
    if (process.platform === "win32") this.skip();
    if (Conf.baseConfig.host !== "localhost" && Conf.baseConfig.host !== "mariadb.example.com")
      this.skip();

    shareConn.query("select @@version_compile_os,@@socket soc", (err, res) => {
      const conn = base.createConnection({ socketPath: res[0].soc });
      conn
        .connect()
        .then(() => {
          conn.query("DO 1", (err, res) => {
            if (err) done(err);
            conn.end(() => {
              done();
            });
          });
        })
        .catch(done);
    });
  });
});
