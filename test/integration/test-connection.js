"use strict";

const base = require("../base.js");
const assert = require("chai").assert;
const Collations = require("../../src/const/collations.js");

describe("connection", () => {
  it("multiple connection.connect() call", function(done) {
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

  it("connection.ping()", function(done) {
    shareConn.ping();
    shareConn.ping(err => {
      if (err) done(err);
      done();
    });
  });

  it("threadId access compatibility", function(done) {
    const threadId = shareConn.info.threadId;
    assert.isDefined(threadId);
    assert.isDefined(shareConn.threadId);
    assert.equal(threadId, shareConn.threadId);
    done();
  });

  it("connection.end() callback testing", function(done) {
    const conn = base.createConnection();
    conn.connect(function(err) {
      if (err) return done(err);
      conn.end(function() {
        done();
      });
    });
  });

  it("connection.destroy()", function(done) {
    this.timeout(10000);
    const conn = base.createConnection();
    conn.connect(function(err) {
      if (err) return done(err);
      conn.destroy();
      done();
    });
  });

  it("connection.destroy() during query execution", function(done) {
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
      setTimeout(() => {
        conn.destroy();
      }, 10);
    });
  });

  it("connection timeout connect (wrong url)", done => {
    const initTime = Date.now();
    const conn = base.createConnection({ host: "www.google.fr", connectTimeout: 1000 });
    conn.connect(err => {
      assert.strictEqual(err.message, "(conn=-1, no: 45012, SQLState: 08S01) Connection timeout");
      assert.isTrue(
        Date.now() - initTime >= 999,
        "expected > 999, but was " + (Date.now() - initTime)
      );
      assert.isTrue(
        Date.now() - initTime < 1100,
        "expected < 1100, but was " + (Date.now() - initTime)
      );
      done();
    });
  });

  it("connection timeout error (wrong url)", done => {
    const initTime = Date.now();
    const conn = base.createConnection({ host: "www.google.fr", connectTimeout: 1000 });
    conn.on("error", err => {
      assert.strictEqual(err.message, "(conn=-1, no: 45012, SQLState: 08S01) Connection timeout");
      assert.isTrue(
        Date.now() - initTime >= 999,
        "expected > 999, but was " + (Date.now() - initTime)
      );
      assert.isTrue(
        Date.now() - initTime < 1100,
        "expected < 1100, but was " + (Date.now() - initTime)
      );
      done();
    });
  });

  it("changing session state", function(done) {
    if (
      (shareConn.isMariaDB() && !shareConn.hasMinVersion(10, 2, 2)) ||
      (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 4))
    ) {
      //session tracking not implemented
      this.skip();
    }

    const conn = base.createConnection();
    conn.connect(() => {
      if (
        (shareConn.isMariaDB() && !shareConn.hasMinVersion(10, 3, 1)) ||
        (shareConn.isMariaDB() && shareConn.hasMinVersion(10, 2, 2))
      ) {
        //mariadb session tracking default value was empty before 10.3.1
        conn.query(
          "SET @@session_track_system_variables = " +
            "'autocommit, character_set_client, character_set_connection, character_set_results, time_zone'"
        );
      }

      assert.equal(conn.opts.collation, Collations.fromName("UTF8MB4_UNICODE_CI"));
      conn.query("SET time_zone = '+00:00', character_set_client = cp850", (err, rows) => {
        if (err) done(err);
        assert.equal(conn.opts.collation, Collations.fromName("CP850_GENERAL_CI"));
        conn.end(() => done());
      });
    });
  });

  it("connection row event", function(done) {
    this.timeout(10000); //can take some time
    const conn = base.createConnection();
    conn.connect(() => {
      conn.query("CREATE TEMPORARY TABLE row_event (val varchar(1024))");
      const array1 = [];
      array1[996] = "a";
      const str = array1.fill("a").join("");
      let numberFetched = 0;
      let fieldEvent = false;
      for (let i = 0; i < 999; i++) {
        conn.query("INSERT INTO row_event VALUE (?)", padStartZero(i, 3) + str);
      }
      conn.query("INSERT INTO row_event VALUE (?)", "999" + str, err => {
        conn
          .query("select * FROM row_event")
          .on("error", function(err) {
            conn.end();
            done(err);
          })
          .on("fields", function(fields) {
            // the field packets for the rows to follow
            assert.equal(fields.length, 1);
            assert.equal(fields[0].name, "val");
            fieldEvent = true;
          })
          .on("result", function(row) {
            const expected = padStartZero(numberFetched, 3) + str;
            if (row.val !== expected) conn.end();
            assert.equal(row.val, expected);
            numberFetched++;
          })
          .on("end", function() {
            // all rows have been received
            assert.equal(numberFetched, 1000);
            assert.ok(fieldEvent);
            conn.end();
            done();
          });
      });
    });
  });

  function padStartZero(val, length) {
    val = "" + val;
    const stringLength = val.length;
    let add = "";
    while (add.length + stringLength < length) add += "0";
    return add + val;
  }

  it("connection.connect() error code validation", function(done) {
    const conn = base.createConnection({ user: "fooUser" });
    conn.connect(err => {
      if (!err) done(new Error("must have thrown error"));
      switch (err.errno) {
        case 1251:
          //authentication method unavailable
          assert.equal(err.sqlState, "08004");
          break;

        case 1524:
          //GSSAPI plugin not loaded
          assert.equal(err.sqlState, "HY000");
          break;

        case 1045:
          assert.equal(err.sqlState, "28000");
          break;

        case 1044:
          //mysql
          assert.equal(err.sqlState, "42000");
          break;

        default:
          done(err);
          return;
      }
      done();
    });
  });

  it("connection error connect event", function(done) {
    const conn = base.createConnection({ user: "fooUser" });
    conn.connect(err => {
      if (!err) {
        done(new Error("must have thrown error"));
      } else done();
    });
  });

  it("connection on error event", function(done) {
    const conn = base.createConnection({ user: "fooUser" });
    conn.on("error", err => {
      if (!err) {
        done(new Error("must have thrown error"));
      } else done();
    });
  });
});
