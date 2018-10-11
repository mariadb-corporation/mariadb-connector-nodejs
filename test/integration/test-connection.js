"use strict";

const base = require("../base.js");
const { assert } = require("chai");
const Collations = require("../../lib/const/collations.js");
const Conf = require("../conf");
const Connection = require("../../lib/connection");
const ConnOptions = require("../../lib/config/connection-options");

describe("connection", () => {
  it("with no connection attributes", function(done) {
    connectWithAttributes(false, done);
  });

  it("with basic connection attributes", function(done) {
    connectWithAttributes(false, done);
  });

  it("with small connection attributes", function(done) {
    connectWithAttributes({ par1: "bouh", par2: "bla" }, done);
  });

  it("with medium connection attributes", function(done) {
    const mediumAttribute = Buffer.alloc(20000, "a").toString();
    connectWithAttributes({ par1: "bouh", par2: mediumAttribute }, done);
  });

  function connectWithAttributes(attr, done) {
    base
      .createConnection({ connectAttributes: attr })
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
  }

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
            assert(err.message.includes("Connection closed"));
            assert.equal(err.sqlState, "08S01");
            assert.equal(err.code, "ER_CONNECTION_ALREADY_CLOSED");
            done();
          });
        });
      });
    });
  });

  it("callback without connect", function(done) {
    const conn = base.createCallbackConnection();
    conn.query("select 1", (err, rows) => {
      if (err) {
        done(err);
      } else {
        assert.deepEqual(rows, [{ "1": 1 }]);
        conn.end();
        done();
      }
    });
  });

  it("callback with connection error", function(done) {
    const conn = base.createCallbackConnection({ connectTimeout: 200, socketTimeout: 200 });
    conn.connect(err => {
      if (!err) done(new Error("must have throw an error!"));
      assert(err.message.includes("close forced"));
      done();
    });
    process.nextTick(
      conn.__tests.getSocket().destroy.bind(conn.__tests.getSocket(), new Error("close forced"))
    );
  });

  it("callback with socket failing without error", function(done) {
    const conn = base.createCallbackConnection({ connectTimeout: 100 });
    conn.connect(err => {
      if (!err) done(new Error("must have throw an error!"));
      assert(err.message.includes("Connection timeout"));
      done();
    });
    process.nextTick(conn.__tests.getSocket().destroy.bind(conn.__tests.getSocket()));
  });

  it("socket timeout", function(done) {
    let conn;
    base
      .createConnection({ socketTimeout: 100, connectTimeout: null })
      .then(con => {
        conn = con;
        return conn.query("SELECT SLEEP(1)");
      })
      .then(() => {
        done(new Error("must have thrown error !"));
      })
      .catch(err => {
        assert(err.message.includes("socket timeout"));
        assert.equal(err.sqlState, "08S01");
        assert.equal(err.errno, 45026);
        assert.equal(err.code, "ER_SOCKET_TIMEOUT");
        done();
      });
  });

  it("connection.connect() callback mode without callback", function(done) {
    const conn = base.createCallbackConnection();
    try {
      conn.connect();
    } catch (err) {
      assert(err.message.includes("missing callback parameter"));
      assert.equal(err.sqlState, "HY000");
      assert.equal(err.errno, 45016);
      assert.equal(err.code, "ER_MISSING_PARAMETER");
    }
    setTimeout(() => {
      conn.end();
      done();
    }, 500);
  });

  it("multiple connection.connect() with callback no function", function(done) {
    const conn = base.createCallbackConnection();
    conn.connect(err => {});
    conn.connect(err => {});
    conn.end(() => {
      conn.connect(err => {});
      done();
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

  it("connection error event", function(done) {
    base
      .createConnection()
      .then(conn => {
        conn.on("error", err => {
          done();
        });
        conn.query("KILL " + conn.threadId).catch(err => {
          assert(err.message.includes("Connection was killed"));
          assert.equal(err.sqlState, "70100");
          assert.equal(err.errno, 1927);
        });
      })
      .catch(done);
  });

  it("connection error event socket failed", function(done) {
    base
      .createConnection({ socketTimeout: 100 })
      .then(conn => {
        conn.on("error", err => {
          assert(err.message.includes("socket timeout"));
          assert.equal(err.fatal, true);
          assert.equal(err.sqlState, "08S01");
          assert.equal(err.errno, 45026);
          assert.equal(err.code, "ER_SOCKET_TIMEOUT");
          done();
        });
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
            assert(err.message.includes("Connection closed"));
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
    assert(shareConn.threadId !== -1);
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
          assert(err != null);
          assert(err.message.includes("Connection destroyed, command was killed"));
          assert(err.fatal);
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
      assert(Date.now() - initTime >= 999, "expected > 999, but was " + (Date.now() - initTime));
      assert(Date.now() - initTime < 2000, "expected < 2000, but was " + (Date.now() - initTime));
      done();
    });
  });

  it("connection error", function(done) {
    base
      .createConnection({
        host: "www.facebook.com",
        port: 443,
        connectTimeout: 200,
        socketTimeout: 200
      })
      .then(conn => {
        done(new Error("must have thrown error!"));
        conn.end();
      })
      .catch(err => {
        assert(err.message.includes("socket timeout"), err.message);
        assert.equal(err.sqlState, "08S01");
        assert.equal(err.errno, 45026);
        assert.equal(err.code, "ER_SOCKET_TIMEOUT");
        done();
      });
  });

  it("connection timeout", function(done) {
    base
      .createConnection({
        host: "www.facebook.com",
        port: 443,
        connectTimeout: 1
      })
      .then(conn => {
        done(new Error("must have thrown error!"));
        conn.end();
      })
      .catch(err => {
        assert(err.message.includes("Connection timeout"));
        assert.equal(err.sqlState, "08S01");
        assert.equal(err.errno, 45012);
        assert.equal(err.code, "ER_CONNECTION_TIMEOUT");
        done();
      });
  });

  it("connection timeout connect (wrong url) with callback no function", done => {
    const conn = base.createCallbackConnection({
      host: "www.google.fr",
      connectTimeout: 500
    });
    conn.connect(err => {});
    conn.end();
    done();
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
        assert(Date.now() - initTime >= 999, "expected > 999, but was " + (Date.now() - initTime));
        assert(Date.now() - initTime < 2000, "expected < 2000, but was " + (Date.now() - initTime));
        done();
      });
  });

  it("connection timeout error (wrong url)", function(done) {
    const initTime = Date.now();
    base.createConnection({ host: "www.google.fr", connectTimeout: 1000 }).catch(err => {
      assert.strictEqual(err.message, "(conn=-1, no: 45012, SQLState: 08S01) Connection timeout");
      assert(Date.now() - initTime >= 999, "expected > 999, but was " + (Date.now() - initTime));
      assert(Date.now() - initTime < 2000, "expected < 2000, but was " + (Date.now() - initTime));
      done();
    });
  });

  it("changing session state", function(done) {
    if (
      (shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(10, 2, 2)) ||
      (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 7, 4)) ||
      process.env.MAXSCALE_VERSION
    ) {
      //session tracking not implemented
      this.skip();
    }

    base
      .createConnection()
      .then(conn => {
        if (
          (shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(10, 3, 1)) ||
          (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 2, 2))
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
            //encoding supported by iconv.js, but not by node.js
            assert.equal(conn.__tests.getCollation(), Collations.fromName("CP850_GENERAL_CI"));
            return conn.query("SET character_set_client = latin1, time_zone = '+01:00'");
          })
          .then(() => {
            //encoding supported by node.js
            assert.equal(conn.__tests.getCollation(), Collations.fromName("LATIN1_SWEDISH_CI"));
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
    const conn = base.createCallbackConnection({ user: "fooUser", password: "myPwd" });
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

        case 1698:
          assert.equal(err.sqlState, "28000");
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
      .createConnection({ user: "fooUser", password: "myPwd" })
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

          case 1698:
            assert.equal(err.sqlState, "28000");
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

    assert(!conn.isValid());
    conn
      .connect()
      .then(() => {
        assert(conn.isValid());
        return conn.end();
      })
      .then(() => {
        assert(!conn.isValid());
        done();
      });
  });

  it("changing database", function(done) {
    let currDb = Conf.baseConfig.database;
    assert.equal(currDb, shareConn.info.database);
    shareConn
      .query("CREATE DATABASE changedb")
      .then(() => {
        return shareConn.query("USE changedb");
      })
      .then(() => {
        if (
          ((shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 2)) ||
            (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(5, 7))) &&
          !process.env.MAXSCALE_VERSION
        ) {
          //ok packet contain meta change
          assert.equal(shareConn.info.database, "changedb");
        }
        shareConn.query("use " + currDb);
        shareConn.query("DROP DATABASE changedb");
        done();
      })
      .catch(done);
  });

  it("pause socket", function(done) {
    shareConn.pause();
    const startTime = process.hrtime();
    setTimeout(() => {
      shareConn.resume();
    }, 500);

    shareConn
      .query("SELECT 1")
      .then(rows => {
        assert.deepEqual(rows, [{ "1": 1 }]);
        const diff = process.hrtime(startTime);
        //query has take more than 500ms
        assert(diff[1] > 499000000, " diff[1]:" + diff[1] + " expected to be more than 500000000");
        done();
      })
      .catch(done);
  });

  it("API escape error", function(done) {
    try {
      shareConn.escape("fff");
      done(new Error("should have thrown error!"));
    } catch (err) {
      assert.equal(err.sqlState, "0A000");
      assert.equal(err.code, "ER_NOT_IMPLEMENTED_ESCAPE");
      done();
    }
  });

  it("API escapeId error", function(done) {
    try {
      shareConn.escapeId("fff");
      done(new Error("should have thrown error!"));
    } catch (err) {
      assert.equal(err.sqlState, "0A000");
      assert.equal(err.code, "ER_NOT_IMPLEMENTED_ESCAPEID");
      done();
    }
  });

  it("API format error", function(done) {
    try {
      shareConn.format("fff");
      done(new Error("should have thrown error!"));
    } catch (err) {
      assert.equal(err.sqlState, "0A000");
      assert.equal(err.code, "ER_NOT_IMPLEMENTED_FORMAT");
      done();
    }
  });
});
