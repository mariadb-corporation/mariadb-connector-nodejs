"use strict";

const base = require("../base.js");
const assert = require("chai").assert;
const Collations = require("../../src/const/collations.js");

describe("change user", () => {


  afterEach(() => {
    shareConn.query("DROP USER 'changeUser'@'%'", err => {});
  });

  it("basic change user", function(done) {
    const conn = base.createConnection();
    conn.connect(err => {
      if (err) done(err);

      conn.query("SELECT CURRENT_USER", (err, res) => {
        const currUser = res[0]["CURRENT_USER"];
        conn.query("CREATE USER 'changeUser'@'%'");
        conn.query("GRANT ALL PRIVILEGES ON *.* TO 'changeUser'@'%' IDENTIFIED BY 'mypassword'");
        conn.changeUser({user: 'changeUser', password: 'mypassword'}, (err) => {
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
        })
      });
    });
  });

  it("change user with collation", function(done) {
    const conn = base.createConnection();
    conn.connect(err => {
      if (err) done(err);

      conn.query("CREATE USER 'changeUser'@'%'");
      conn.query("GRANT ALL PRIVILEGES ON *.* TO 'changeUser'@'%' IDENTIFIED BY 'mypassword2'");
      conn.changeUser({user: 'changeUser', password: 'mypassword2', charset: 'UTF8_VIETNAMESE_CI'}, (err) => {
        if (err) {
          done(err);
        } else {
          conn.query("SELECT CURRENT_USER", (err, res) => {
            const user = res[0]["CURRENT_USER"];
            assert.equal(user, "changeUser@%");
            assert.equal(conn.opts.collation.name, 'UTF8_VIETNAMESE_CI');
            conn.end();
            done();
          });
        }
      })
    })
  });


});
