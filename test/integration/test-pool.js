"use strict";

const base = require("../base.js");
const { assert } = require("chai");
const Conf = require("../conf");

describe("Pool", () => {
  it("create pool", function(done) {
    this.timeout(5000);
    const pool = base.createPool({ connectionLimit: 1 });
    const initTime = Date.now();
    pool.getConnection().then(conn => {
      conn.query("SELECT SLEEP(1)").then(() => {
        conn.release();
      });
    });
    pool.getConnection().then(conn => {
      conn.query("SELECT SLEEP(1)").then(() => {
        assert(Date.now() - initTime >= 1999, "expected > 2s, but was " + (Date.now() - initTime));
        conn.release();
        pool.end();
        done();
      });
    });
  });

  it("ensure commit", function(done) {
    shareConn.query("DROP TABLE IF EXISTS ensureCommit");
    shareConn.query("CREATE TABLE ensureCommit(firstName varchar(32))");
    shareConn.query("INSERT INTO ensureCommit values ('john')");
    const pool = base.createPool({ connectionLimit: 1 });
    pool.getConnection()
    .then(conn =>{
      conn.beginTransaction()
      .then(() =>{
        return conn.query("UPDATE ensureCommit SET firstName='Tom'")
      })
      .then(()=>{
        return conn.commit();
      })
      .then(()=>{
        conn.end();
        return shareConn.query("SELECT * FROM ensureCommit");
      })
      .then((res)=>{
        assert.deepEqual(res, [{firstName:'Tom'}]);
        done();
      })
      .catch(err=>{
        conn.rollback();
        done(err);
      })
    });
  });


  it("pool wrong query", function(done) {
    this.timeout(5000);
    const pool = base.createPool({ connectionLimit: 1 });
    pool
      .query("wrong query")
      .then(() => {
        done(new Error("must have thrown error !"));
      })
      .catch(err => {
        assert(err.message.includes(" You have an error in your SQL syntax"));
        assert.equal(err.sqlState, "42000");
        assert.equal(err.code, "ER_PARSE_ERROR");
        pool.end();
        done();
      });
  });

  it("pool getConnection after close", function(done) {
    const pool = base.createPool({ connectionLimit: 1 });
    pool.end().then(() => {
      pool.getConnection().catch(err => {
        assert(err.message.includes("pool is closed"));
        assert.equal(err.sqlState, "HY000");
        assert.equal(err.errno, 45027);
        assert.equal(err.code, "ER_POOL_ALREADY_CLOSED");
        done();
      });
    });
  });

  it("pool query after close", function(done) {
    const pool = base.createPool({ connectionLimit: 1 });
    pool.end().then(() => {
      pool.query("select ?", 1).catch(err => {
        assert(err.message.includes("pool is closed"));
        assert.equal(err.sqlState, "HY000");
        assert.equal(err.errno, 45027);
        assert.equal(err.code, "ER_POOL_ALREADY_CLOSED");
        done();
      });
    });
  });

  it("pool getConnection timeout", function(done) {
    const pool = base.createPool({ connectionLimit: 1, acquireTimeout: 200 });
    let errorThrown = false;
    pool
      .query("SELECT SLEEP(1)")
      .then(() => {
        pool.end();
        assert.isOk(errorThrown);
        done();
      })
      .catch(done);
    pool.getConnection().catch(err => {
      assert(err.message.includes("retrieve connection from pool timeout"));
      assert.equal(err.sqlState, "HY000");
      assert.equal(err.errno, 45028);
      assert.equal(err.code, "ER_GET_CONNECTION_TIMEOUT");
      errorThrown = true;
    });
  });

  it("pool query timeout", function(done) {
    this.timeout(5000);
    const pool = base.createPool({ connectionLimit: 1, acquireTimeout: 500 });
    const initTime = Date.now();
    pool
      .query("SELECT SLEEP(2)")
      .then(() => {
        pool.end();
      })
      .catch(() => {
        pool.end();
      });

    pool
      .query("SELECT 1")
      .then(() => {
        done(new Error("must have thrown error 1 !"));
      })
      .catch(err => {
        assert(err.message.includes("retrieve connection from pool timeout"));
        assert.equal(err.sqlState, "HY000");
        assert.equal(err.errno, 45028);
        assert.equal(err.code, "ER_GET_CONNECTION_TIMEOUT");
      });
    pool
      .query("SELECT 2")
      .then(() => {
        done(new Error("must have thrown error 2 !"));
      })
      .catch(err => {
        assert(err.message.includes("retrieve connection from pool timeout"));
        assert.equal(err.sqlState, "HY000");
        assert.equal(err.errno, 45028);
        assert.equal(err.code, "ER_GET_CONNECTION_TIMEOUT");
        const elapse = Date.now() - initTime;
        assert.isOk(
          elapse >= 498 && elapse < 550,
          "elapse time was " + elapse + " but must be just after 500"
        );
      });
    setTimeout(() => {
      pool
        .query("SELECT 3")
        .then(() => {
          done(new Error("must have thrown error 3 !"));
        })
        .catch(err => {
          assert(err.message.includes("retrieve connection from pool timeout"));
          assert.equal(err.sqlState, "HY000");
          assert.equal(err.errno, 45028);
          assert.equal(err.code, "ER_GET_CONNECTION_TIMEOUT");
          const elapse = Date.now() - initTime;
          assert.isOk(
            elapse >= 698 && elapse < 750,
            "elapse time was " + elapse + " but must be just after 700"
          );
          done();
        });
    }, 200);
  });

  it("pool grow", function(done) {
    this.timeout(20000);
    const pool = base.createPool({ connectionLimit: 10 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 10);
      assert.equal(pool.idleConnections(), 10);
      assert.equal(pool.taskQueueSize(), 0);
      let closed = false;
      for (let i = 0; i < 10000; i++) {
        pool
          .query("SELECT ? as a", [i])
          .then(rows => {
            assert.deepEqual(rows, [{ a: i }]);
          })
          .catch(err => {
            if (!closed) done(err);
          });
      }
      setImmediate(() => {
        assert.equal(pool.activeConnections(), 10);
        assert.equal(pool.totalConnections(), 10);
        assert.equal(pool.idleConnections(), 0);
        assert.equal(pool.taskQueueSize(), 9990);

        setTimeout(() => {
          closed = true;
          pool
            .end()
            .then(() => {
              if (Conf.baseConfig.host === "localhost") {
                assert.equal(pool.activeConnections(), 0);
                assert.equal(pool.totalConnections(), 0);
                assert.equal(pool.idleConnections(), 0);
                assert.equal(pool.taskQueueSize(), 0);
              }
              done();
            })
            .catch(done);
        }, 5000);
      });
    }, 8000);
  });

  it("connection fail handling", function(done) {
    if (process.env.MAXSCALE_VERSION) this.skip();
    const pool = base.createPool({ connectionLimit: 2, minDelayValidation: 200 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);
      assert.equal(pool.taskQueueSize(), 0);

      pool
        .getConnection()
        .then(conn => {
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);
          assert.equal(pool.taskQueueSize(), 0);

          conn.query("KILL CONNECTION_ID()").catch(err => {
            assert.equal(err.sqlState, 70100);
            assert.equal(pool.activeConnections(), 1);
            assert.equal(pool.totalConnections(), 2);
            assert.equal(pool.idleConnections(), 1);
            assert.equal(pool.taskQueueSize(), 0);
            conn.end().then(() => {
              assert.equal(pool.activeConnections(), 0);
              assert.equal(pool.taskQueueSize(), 0);
              pool.end();
              done();
            });
          });
        })
        .catch(done);
    }, 500);
  });

  it("query fail handling", function(done) {
    if (process.env.MAXSCALE_VERSION) this.skip();
    const pool = base.createPool({ connectionLimit: 2, minDelayValidation: 200 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);
      assert.equal(pool.taskQueueSize(), 0);

      pool.query("KILL CONNECTION_ID()").catch(err => {
        assert.equal(err.sqlState, 70100);
        setImmediate(() => {
          //waiting for rollback to end
          assert.equal(pool.taskQueueSize(), 0);

          setTimeout(() => {
            pool.query("do 1");
            pool.query("do 1").then(() => {
              setTimeout(() => {
                //connection recreated
                assert.equal(pool.activeConnections(), 0);
                assert.equal(pool.totalConnections(), 2);
                assert.equal(pool.idleConnections(), 2);
                assert.equal(pool.taskQueueSize(), 0);
                pool.end();
                done();
              }, 250);
            });
          }, 250);
        });
      });
    }, 500);
  });

  it("connection end", function(done) {
    const pool = base.createPool({ connectionLimit: 2 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);

      pool
        .getConnection()
        .then(conn => {
          //check available connections in pool
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);

          conn.end().then(() => {
            assert.equal(pool.activeConnections(), 0);
            assert.equal(pool.totalConnections(), 2);
            assert.equal(pool.idleConnections(), 2);
            pool.end();
            done();
          });
        })
        .catch(done);
    }, 500);
  });

  it("connection release alias", function(done) {
    const pool = base.createPool({ connectionLimit: 2 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);

      pool
        .getConnection()
        .then(conn => {
          //check available connections in pool
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);

          conn.release().then(() => {
            assert.equal(pool.activeConnections(), 0);
            assert.equal(pool.totalConnections(), 2);
            assert.equal(pool.idleConnections(), 2);
            pool.end();
            done();
          });
        })
        .catch(done);
    }, 500);
  });

  it("connection destroy", function(done) {
    const pool = base.createPool({ connectionLimit: 2 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);

      pool
        .getConnection()
        .then(conn => {
          //check available connections in pool
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);

          conn.destroy();

          assert.equal(pool.activeConnections(), 0);
          assert.equal(pool.totalConnections(), 1);
          assert.equal(pool.idleConnections(), 1);
          pool.end();
          done();
        })
        .catch(done);
    }, 500);
  });

  it("pool rollback on connection return", function(done) {
    const pool = base.createPool({ connectionLimit: 1 });
    pool.getConnection().then(conn => {
      conn
        .query("DROP TABLE IF EXISTS rollbackTable")
        .then(() => {
          return conn.query("CREATE TABLE rollbackTable(col varchar(10))");
        })
        .then(() => {
          return conn.query("set autocommit = 0");
        })
        .then(() => {
          return conn.beginTransaction();
        })
        .then(() => {
          return conn.query("INSERT INTO rollbackTable value ('test')");
        })
        .then(() => {
          return conn.release();
        })
        .then(() => {
          pool
            .getConnection()
            .then(conn => {
              return conn.query("SELECT * FROM rollbackTable");
            })
            .then(res => {
              assert.equal(res.length, 0);
              conn.end();
              pool.end();
              done();
            });
        })
        .catch(done);
    });
  });

  it("pool batch", function(done) {
    const pool = base.createPool({ connectionLimit: 1, resetAfterUse: false });
    pool.query("CREATE TEMPORARY TABLE parse(id int, id2 int, id3 int, t varchar(128), id4 int)");
    pool
      .batch("INSERT INTO `parse` values (1, ?, 2, ?, 3)", [[1, "john"], [2, "jack"]])
      .then(res => {
        assert.equal(res.affectedRows, 2);
        return pool.query("select * from `parse`");
      })
      .then(res => {
        assert.deepEqual(res, [
          {
            id: 1,
            id2: 1,
            id3: 2,
            t: "john",
            id4: 3
          },
          {
            id: 1,
            id2: 2,
            id3: 2,
            t: "jack",
            id4: 3
          }
        ]);
        pool.end();
        done();
      })
      .catch(done);
  });
});
