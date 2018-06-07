"use strict";

const base = require("../base.js");
const assert = require("chai").assert;
const Collations = require("../../lib/const/collations.js");
const Conf = require("../conf");
const Connection = require("../../lib/connection");
const ConnOptions = require("../../lib/config/connection-options");

describe("connection", () => {
  it("multiple connection.connect() with callback", function(done) {
    const conn = base.createCallbackConnection();
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

  it("connection.connect() promise success parameter", function(done) {
    base
      .createConnection()
      .then(conn => {
        return conn.end();
      })
      .then(() => {
        done();
      })
      .catch(done);
  });

  it("multiple connection.connect() with promise", function(done) {
    let conn;
    base
      .createConnection()
      .then(newConn => {
        conn = newConn;
        return newConn.connect();
      })
      .then(newConn => {
        return newConn.end();
      })
      .then(() => {
        return conn.end();
      })
      .then(() => {
        conn
          .connect()
          .then(() => {
            done(new Error("must have thrown error"));
          })
          .catch(err => {
            assert.isTrue(err.message.includes("Connection closed"));
            done();
          });
      })
      .catch(done);
  });

  it("connection.connect() and query no waiting", function(done) {
    base
      .createConnection()
      .then(conn => {
        conn
          .query("SELECT 1")
          .then(rows => {
            assert.deepEqual(rows, [{ "1": 1 }]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it("multiple simultaneous connection.connect()", function(done) {
    let connOptionTemp = Conf.baseConfig;
    const conn = new Connection(new ConnOptions(connOptionTemp));
    conn
      .connect()
      .then(() => {
        return conn.end();
      })
      .catch(() => {});

    conn
      .connect()
      .then(() => {
        done(new Error("must have thrown error"));
      })
      .catch(err => {
        assert.equal(
          err.message,
          "(conn=-1, no: 45002, SQLState: 08S01) Connection is already connecting"
        );
        done();
      })
      .catch(done);
  });

  it("connection.ping()", function(done) {
    shareConn.ping();
    shareConn
      .ping()
      .then(done)
      .catch(done);
  });

  it("connection.ping() with callback", function(done) {
    const conn = base.createCallbackConnection();
    conn.connect(err => {
      conn.ping();
      conn.ping(err => {
        conn.end();
        if (err) done(err);
        done();
      });
    });
  });

  it("threadId access compatibility", function(done) {
    assert.isDefined(shareConn.threadId);
    assert.isTrue(shareConn.threadId !== -1);
    done();
  });

  it("connection.end() callback", function(done) {
    const conn = base.createCallbackConnection();
    conn.connect(function(err) {
      if (err) return done(err);
      conn.end(function() {
        done();
      });
    });
  });

  it("connection.end() promise", function(done) {
    base
      .createConnection()
      .then(conn => {
        conn
          .end()
          .then(() => {
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it("connection.destroy()", function(done) {
    this.timeout(10000);
    base
      .createConnection()
      .then(conn => {
        conn.destroy();
        done();
      })
      .catch(done);
  });

  it("connection.destroy() during query execution", function(done) {
    this.timeout(10000);
    base.createConnection().then(conn => {
      //launch very long query
      conn
        .query(
          "select * from information_schema.columns as c1,  information_schema.tables, information_schema.tables as t2"
        )
        .then(() => done(new Error("expected error !")))
        .catch(err => {
          assert.isTrue(err != null);
          assert.isTrue(err.message.includes("Connection destroyed, command was killed"));
          assert.isTrue(err.fatal);
          done();
        });
      setTimeout(() => {
        conn.destroy();
      }, 10);
    });
  });

  it("connection timeout connect (wrong url) with callback", done => {
    const initTime = Date.now();
    const conn = base.createCallbackConnection({
      host: "www.google.fr",
      connectTimeout: 1000
    });
    conn.connect(err => {
      assert.strictEqual(err.message, "(conn=-1, no: 45012, SQLState: 08S01) Connection timeout");
      assert.isTrue(
        Date.now() - initTime >= 999,
        "expected > 999, but was " + (Date.now() - initTime)
      );
      assert.isTrue(
        Date.now() - initTime < 2000,
        "expected < 2000, but was " + (Date.now() - initTime)
      );
      done();
    });
  });

  it("connection timeout connect (wrong url) with promise", done => {
    const initTime = Date.now();
    base
      .createConnection({ host: "www.google.fr", connectTimeout: 1000 })
      .then(() => {
        done(new Error("must have thrown error"));
      })
      .catch(err => {
        assert.strictEqual(err.message, "(conn=-1, no: 45012, SQLState: 08S01) Connection timeout");
        assert.isTrue(
          Date.now() - initTime >= 999,
          "expected > 999, but was " + (Date.now() - initTime)
        );
        assert.isTrue(
          Date.now() - initTime < 2000,
          "expected < 2000, but was " + (Date.now() - initTime)
        );
        done();
      });
  });

  it("connection timeout error (wrong url)", done => {
    const initTime = Date.now();
    base.createConnection({ host: "www.google.fr", connectTimeout: 1000 }).catch(err => {
      assert.strictEqual(err.message, "(conn=-1, no: 45012, SQLState: 08S01) Connection timeout");
      assert.isTrue(
        Date.now() - initTime >= 999,
        "expected > 999, but was " + (Date.now() - initTime)
      );
      assert.isTrue(
        Date.now() - initTime < 2000,
        "expected < 2000, but was " + (Date.now() - initTime)
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

    base
      .createConnection()
      .then(conn => {
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
        assert.equal(conn.__tests.getCollation(), Collations.fromName("UTF8MB4_UNICODE_CI"));
        conn
          .query("SET time_zone = '+00:00', character_set_client = cp850")
          .then(() => {
            assert.equal(conn.__tests.getCollation(), Collations.fromName("CP850_GENERAL_CI"));
            return conn.end();
          })
          .then(() => done())
          .catch(done);
      })
      .catch(done);
  });

  function padStartZero(val, length) {
    val = "" + val;
    const stringLength = val.length;
    let add = "";
    while (add.length + stringLength < length) add += "0";
    return add + val;
  }

  it("connection.connect() error code validation callback", function(done) {
    const conn = base.createCallbackConnection({ user: "fooUser" });
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

  it("connection.connect() error code validation promise", function(done) {
    base
      .createConnection({ user: "fooUser" })
      .then(() => {
        done(new Error("must have thrown error"));
      })
      .catch(err => {
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
    const conn = base.createCallbackConnection({ user: "fooUser" });
    conn.connect(err => {
      if (!err) {
        done(new Error("must have thrown error"));
      } else done();
    });
  });

  it("connection on error promise", function(done) {
    base.createConnection({ user: "fooUser" }).catch(err => {
      if (!err) {
        done(new Error("must have thrown error"));
      } else done();
    });
  });

  it("connection validity", function(done) {
    let connOptionTemp = Conf.baseConfig;
    const conn = new Connection(new ConnOptions(connOptionTemp));

    assert.isFalse(conn.isValid());
    conn
      .connect()
      .then(() => {
        assert.isTrue(conn.isValid());
        return conn.end();
      })
      .then(() => {
        assert.isFalse(conn.isValid());
        done();
      });
  });
});
