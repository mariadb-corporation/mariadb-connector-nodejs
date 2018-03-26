"use strict";

const base = require("../base.js");
const assert = require("chai").assert;
const Collations = require("../../src/const/collations.js");

describe("connection", () => {
  it("multiple connect call", function(done) {
    const conn = base.createConnection();
    conn.connect(err => {
      if (err) done(err);
      //ensure double connect execute callback immediately
      conn.connect(err => {
        if (err) done(err);
        conn.end(() => {
          conn.connect(err => {
            //normal error
            assert.isTrue(err.message.includes("Connection closed"));
            done();
          });
        });
      });
    });
  });

  it("connection event subscription", function(done) {
    let eventNumber = 0;
    const conn = base.createConnection();
    conn.on("connect", () => {
      eventNumber++;
    });

    conn.on("error", () => {
      eventNumber++;
    });

    conn.on("end", () => {
      eventNumber++;
      assert.equal(eventNumber, 3);
      done();
    });

    const query = conn.query("KILL CONNECTION_ID()");
    query.on("error", () => {});
  });

  // it("end connection event", function(done) {
  //   //if not streaming, memory will be saturated
  //   const conn = base.createConnection();
  //   conn.on("error", function(err) {
  //     if (err) {
  //       done();
  //     } else {
  //       done(new Error("Must have thrown an exception !"));
  //     }
  //   });
  //   conn._socket.end();
  // });

  it("connection ping", function(done) {
    shareConn.ping();
    shareConn.ping(err => {
      if (err) done(err);
      done();
    });
  });

  it("compatibility", function(done) {
    const threadId = shareConn.info.threadId;
    assert.isDefined(threadId);
    assert.isDefined(shareConn.threadId);
    assert.equal(threadId, shareConn.threadId);
    done();
  });

  it("connection end with callback", function(done) {
    const conn = base.createConnection();
    conn.connect(function(err) {
      if (err) return done(err);
      conn.end(function() {
        done();
      });
    });
  });

  it("connection destroy", function(done) {
    const conn = base.createConnection();
    conn.connect(function(err) {
      if (err) return done(err);
      conn.destroy();
      done();
    });
  });

  it("connection destroy during big query", function(done) {
    const conn = base.createConnection();
    conn.connect(() => {
      //launch very long query
      conn.query(
        "select * from information_schema.columns as c1,  information_schema.tables, information_schema.tables as t2",
        err => {
          assert.isTrue(err != null);
          assert.isTrue(err.message.includes("Connection destroyed, command was killed"));
          assert.isTrue(err.fatal);
          done();
        }
      );
      setTimeout(conn.destroy.bind(conn), 100);
    });
  });

  it("wrong url", done => {
    const initTime = Date.now();
    const conn = base.createConnection({ host: "www.google.fr", connectTimeout: 1000 });
    conn.on("error", err => {
      assert.strictEqual(err.message, "(conn=-1) Connection timeout");
      assert.isTrue(
        Date.now() - initTime >= 999,
        "expected > 999, but was " + (Date.now() - initTime)
      );
      assert.isTrue(
        Date.now() - initTime < 1050,
        "expected < 1050, but was " + (Date.now() - initTime)
      );
      done();
    });
  });

  it("session state change", function(done) {
    if (
      (shareConn.isMariaDB() && !shareConn.hasMinVersion(10, 2, 2)) ||
      (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 4))
    ) {
      //session tracking not implemented
      this.skip();
    }

    if (
      (shareConn.isMariaDB() && !shareConn.hasMinVersion(10, 3, 1)) ||
      (shareConn.isMariaDB() && shareConn.hasMinVersion(10, 2, 2))
    ) {
      //mariadb session tracking default value was empty before 10.3.1
      shareConn.query(
        "SET @@session_track_system_variables = " +
          "'autocommit, character_set_client, character_set_connection, character_set_results, time_zone'"
      );
    }

    assert.equal(shareConn.opts.collation, Collations.fromName("UTF8MB4_UNICODE_CI"));
    shareConn.query("SET time_zone = '+00:00', character_set_client = cp850", (err, rows) => {
      assert.ifError(err);
      assert.equal(shareConn.opts.collation, Collations.fromName("CP850_GENERAL_CI"));
      done();
    });
  });
});
