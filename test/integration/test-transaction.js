"use strict";

const base = require("../base.js");
const ServerStatus = require("../../lib/const/server-status");
const assert = require("chai").assert;

describe("transaction", () => {
  before(done => {
    shareConn
      .query("CREATE TEMPORARY TABLE testTransaction (v varchar(10))")
      .then(() => {
        done();
      })
      .catch(done);
  });

  it("transaction rollback", done => {
    shareConn
      .rollback()
      .then(() => {
        return shareConn.query("SET autocommit=0");
      })
      .then(() => {
        assert.equal(shareConn.__tests.getInfo().status & ServerStatus.STATUS_IN_TRANS, 0);
        assert.equal(shareConn.__tests.getInfo().status & ServerStatus.STATUS_AUTOCOMMIT, 0);
        return shareConn.beginTransaction();
      })
      .then(() => {
        assert.equal(shareConn.__tests.getInfo().status & ServerStatus.STATUS_IN_TRANS, 1);
        return shareConn.query("INSERT INTO testTransaction values ('test')");
      })
      .then(() => {
        assert.equal(shareConn.__tests.getInfo().status & ServerStatus.STATUS_IN_TRANS, 1);
        return shareConn.rollback();
      })
      .then(() => {
        assert.equal(shareConn.__tests.getInfo().status & ServerStatus.STATUS_IN_TRANS, 0);
        return shareConn.query("SELECT count(*) as nb FROM testTransaction");
      })
      .then(rows => {
        assert.equal(shareConn.__tests.getInfo().status & ServerStatus.STATUS_IN_TRANS, 1);
        assert.equal(rows[0].nb, 0);
        done();
      })
      .catch(done);
  });

  it("transaction commit", done => {
    shareConn
      .commit()
      .then(() => {
        return shareConn.query("SET autocommit=0");
      })
      .then(() => {
        assert.equal(shareConn.__tests.getInfo().status & ServerStatus.STATUS_IN_TRANS, 0);
        assert.equal(shareConn.__tests.getInfo().status & ServerStatus.STATUS_AUTOCOMMIT, 0);

        return shareConn.beginTransaction();
      })
      .then(() => {
        assert.equal(shareConn.__tests.getInfo().status & ServerStatus.STATUS_IN_TRANS, 1);
        return shareConn.query("INSERT INTO testTransaction values ('test')");
      })
      .then(() => {
        assert.equal(shareConn.__tests.getInfo().status & ServerStatus.STATUS_IN_TRANS, 1);
        return shareConn.commit();
      })
      .then(() => {
        assert.equal(shareConn.__tests.getInfo().status & ServerStatus.STATUS_IN_TRANS, 0);
        return shareConn.query("SELECT count(*) as nb FROM testTransaction");
      })
      .then(rows => {
        assert.equal(shareConn.__tests.getInfo().status & ServerStatus.STATUS_IN_TRANS, 1);
        assert.equal(rows[0].nb, 1);
        done();
      })
      .catch(done);
  });
});
