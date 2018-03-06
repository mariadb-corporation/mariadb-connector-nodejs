"use strict";

const base = require("../base.js");
const assert = require("chai").assert;

describe("transaction", function() {
  before(function(done) {
    shareConn.query("CREATE TEMPORARY TABLE testTransaction (v varchar(10))", err => {
      if (err) return done(err);
      done();
    });
  });

  it("transaction rollback", function(done) {
    shareConn.rollback();
    shareConn.query("SET autocommit=0", () => {
      assert.equal(shareConn.info.status, 0);
      shareConn.beginTransaction(err => {
        if (err) done(err);
        assert.equal(shareConn.info.status, 1);
        shareConn.query("INSERT INTO testTransaction values ('test')", err => {
          if (err) done(err);
          assert.equal(shareConn.info.status, 1);
          shareConn.rollback(err => {
            if (err) done(err);
            assert.equal(shareConn.info.status, 0);
            shareConn.query("SELECT count(*) as nb FROM testTransaction", (err, rows) => {
              if (err) done(err);
              assert.equal(shareConn.info.status, 33);
              assert.equal(rows[0].nb, 0);
              done();
            });
          });
        });
      });
    });
  });

  it("transaction commit", function(done) {
    shareConn.commit();
    shareConn.query("SET autocommit=0", () => {
      assert.equal(shareConn.info.status, 0);
      shareConn.beginTransaction(err => {
        if (err) done(err);
        assert.equal(shareConn.info.status, 1);
        shareConn.query("INSERT INTO testTransaction values ('test')", err => {
          if (err) done(err);
          assert.equal(shareConn.info.status, 1);
          shareConn.commit(err => {
            if (err) done(err);
            assert.equal(shareConn.info.status, 0);
            shareConn.query("SELECT count(*) as nb FROM testTransaction", (err, rows) => {
              if (err) done(err);
              assert.equal(shareConn.info.status, 33);
              assert.equal(rows[0].nb, 1);
              done();
            });
          });
        });
      });
    });
  });
});
