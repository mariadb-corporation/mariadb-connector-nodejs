"use strict";

const base = require("../base.js");
const assert = require("chai").assert;

describe("change user", () => {
  before(done => {
    shareConn.query("CREATE USER ChangeUser@'%' IDENTIFIED BY 'mypassword'");
    shareConn.query("GRANT ALL PRIVILEGES ON *.* TO ChangeUser@'%' with grant option");
    shareConn.query("FLUSH PRIVILEGES", err => {
      done();
    });
  });

  after(done => {
    shareConn.query("DROP USER ChangeUser@'%'");
    shareConn.query("FLUSH PRIVILEGES", err => {
      done();
    });
  });

  it("basic change user", function(done) {
    if (!shareConn.isMariaDB()) this.skip();
    const conn = base.createConnection();
    conn.connect(err => {
      if (err) done(err);

      conn.query("SELECT CURRENT_USER", (err, res) => {
        const currUser = res[0]["CURRENT_USER"];
        conn.changeUser({ user: "ChangeUser", password: "mypassword" }, err => {
          if (err) {
            done(err);
          } else {
            conn.query("SELECT CURRENT_USER", (err, res) => {
              const user = res[0]["CURRENT_USER"];
              assert.equal(user, "ChangeUser@%");
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

      conn.changeUser(
        { user: "ChangeUser", password: "mypassword", charset: "UTF8_PERSIAN_CI" },
        err => {
          if (err) {
            done(err);
          } else {
            conn.query("SELECT CURRENT_USER", (err, res) => {
              const user = res[0]["CURRENT_USER"];
              assert.equal(user, "ChangeUser@%");
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
    shareConn.changeUser({ user: "ChangeUser" }, err => {
      assert.isTrue(err.message.includes("method changeUser not available"));
      done();
    });
  });
});
