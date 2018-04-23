"use strict";

const base = require("../base.js");
const assert = require("chai").assert;
const Collations = require("../../src/const/collations.js");

describe("change user", () => {
  afterEach(() => {
    shareConn.query("DROP USER 'changeUser'@'%'", err => {
      console.log(err);
    });
  });

  it("basic change user", function(done) {
    if (!shareConn.isMariaDB()) this.skip();
    const conn = base.createConnection();
    conn.connect(err => {
      if (err) done(err);

      conn.query("SELECT CURRENT_USER", (err, res) => {
        const currUser = res[0]["CURRENT_USER"];
        conn.query("CREATE USER 'changeUser'@'%'");
        conn.query("GRANT ALL PRIVILEGES ON *.* TO 'changeUser'@'%' IDENTIFIED BY 'mypassword'");
        conn.changeUser({ user: "changeUser", password: "mypassword" }, err => {
          if (err) {
            done(err);
          } else {
            conn.query("SELECT CURRENT_USER", (err, res) => {
              const user = res[0]["CURRENT_USER"];
              assert.equal(user, "changeUser@%");
              assert.isTrue(user !== currUser);
              conn.end();
              done();
            });
          }
        });
      });
    });
  });

  it("change user with collation", function(done) {
    if (!shareConn.isMariaDB()) this.skip();
    const conn = base.createConnection();
    conn.connect(err => {
      if (err) done(err);

      conn.query("CREATE USER 'changeUser'@'%'");
      conn.query("GRANT ALL PRIVILEGES ON *.* TO 'changeUser'@'%' IDENTIFIED BY 'mypassword2'");
      conn.changeUser(
        { user: "changeUser", password: "mypassword2", charset: "UTF8_PERSIAN_CI" },
        err => {
          if (err) {
            done(err);
          } else {
            conn.query("SELECT CURRENT_USER", (err, res) => {
              const user = res[0]["CURRENT_USER"];
              assert.equal(user, "changeUser@%");
              assert.equal(conn.opts.collation.name, "UTF8_PERSIAN_CI");
              conn.end();
              done();
            });
          }
        }
      );
    });
  });

  it("MySQL change user disabled", function(done) {
    if (shareConn.isMariaDB()) this.skip();
    shareConn.changeUser({ user: "changeUser"}, err => {
      assert.isTrue(err.message.includes("method changeUser not available"));
      done();
    });
  })
  });
