"use strict";

const base = require("../base.js");
const ServerStatus = require("../../src/const/server-status");
const assert = require("chai").assert;

describe("transaction", () => {
  before(done => {
    shareConn.query("CREATE TEMPORARY TABLE testTransaction (v varchar(10))", err => {
      if (err) return done(err);
      done();
    });
  });

  it("transaction rollback", done => {
    shareConn.rollback();
    shareConn.query("SET autocommit=0", () => {
      assert.equal(shareConn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
      assert.equal(shareConn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 0);
      shareConn.beginTransaction(err => {
        if (err) done(err);
        assert.equal(shareConn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
        shareConn.query("INSERT INTO testTransaction values ('test')", err => {
          if (err) done(err);
          assert.equal(shareConn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
          shareConn.rollback(err => {
            if (err) done(err);
            assert.equal(shareConn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
            shareConn.query("SELECT count(*) as nb FROM testTransaction", (err, rows) => {
              if (err) done(err);
              assert.equal(shareConn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
              assert.equal(rows[0].nb, 0);
              done();
            });
          });
        });
      });
    });
  });

  it("transaction commit", done => {
    shareConn.commit();
    shareConn.query("SET autocommit=0", () => {
      assert.equal(shareConn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
      assert.equal(shareConn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 0);
      shareConn.beginTransaction(err => {
        if (err) done(err);
        assert.equal(shareConn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
        shareConn.query("INSERT INTO testTransaction values ('test')", err => {
          if (err) done(err);
          assert.equal(shareConn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
          shareConn.commit(err => {
            if (err) done(err);
            assert.equal(shareConn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
            shareConn.query("SELECT count(*) as nb FROM testTransaction", (err, rows) => {
              if (err) done(err);
              assert.equal(shareConn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
              assert.equal(rows[0].nb, 1);
              done();
            });
          });
        });
      });
    });
  });
});
