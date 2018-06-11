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

  it("transaction rollback with callback", done => {
    const conn = base.createCallbackConnection();
    conn.connect(function(err) {
      if (err) return done(err);
      conn.query("CREATE TEMPORARY TABLE testTransaction2 (v varchar(10))", err => {
        if (err) return done(err);
        conn.rollback(err => {
          if (err) return done(err);
          conn.query("SET autocommit=0", err => {
            if (err) return done(err);
            assert.equal(conn.__tests.getInfo().status & ServerStatus.STATUS_IN_TRANS, 0);
            assert.equal(conn.__tests.getInfo().status & ServerStatus.STATUS_AUTOCOMMIT, 0);
            conn.beginTransaction(err => {
              if (err) return done(err);
              assert.equal(conn.__tests.getInfo().status & ServerStatus.STATUS_IN_TRANS, 1);
              conn.query("INSERT INTO testTransaction2 values ('test')");
              assert.equal(conn.__tests.getInfo().status & ServerStatus.STATUS_IN_TRANS, 1);
              conn.rollback(err => {
                if (err) return done(err);
                assert.equal(conn.__tests.getInfo().status & ServerStatus.STATUS_IN_TRANS, 0);
                conn.query("SELECT count(*) as nb FROM testTransaction2", (err, rows) => {
                  if (err) return done(err);
                  assert.equal(conn.__tests.getInfo().status & ServerStatus.STATUS_IN_TRANS, 1);
                  assert.equal(rows[0].nb, 0);
                  conn.end();
                  done();
                });
              });
            });
          });
        });
      });
    });
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

  it("transaction commit with callback", done => {
    const conn = base.createCallbackConnection();
    conn.connect(err => {
      if (err) return done(err);
      conn.query("CREATE TEMPORARY TABLE testTransaction (v varchar(10))", err => {
        if (err) return done(err);
        conn.commit(err => {
          if (err) return done(err);
          conn.query("SET autocommit=0", err => {
            if (err) return done(err);
            assert.equal(conn.__tests.getInfo().status & ServerStatus.STATUS_IN_TRANS, 0);
            assert.equal(conn.__tests.getInfo().status & ServerStatus.STATUS_AUTOCOMMIT, 0);
            conn.beginTransaction(err => {
              if (err) return done(err);
              assert.equal(conn.__tests.getInfo().status & ServerStatus.STATUS_IN_TRANS, 1);
              conn.query("INSERT INTO testTransaction values ('test')", err => {
                if (err) return done(err);
                assert.equal(conn.__tests.getInfo().status & ServerStatus.STATUS_IN_TRANS, 1);
                conn.commit(err => {
                  if (err) return done(err);
                  assert.equal(conn.__tests.getInfo().status & ServerStatus.STATUS_IN_TRANS, 0);
                  conn.query("SELECT count(*) as nb FROM testTransaction", (err, rows) => {
                    if (err) return done(err);
                    assert.equal(conn.__tests.getInfo().status & ServerStatus.STATUS_IN_TRANS, 1);
                    assert.equal(rows[0].nb, 1);
                    conn.end(done);
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});
