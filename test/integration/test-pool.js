'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const Conf = require('../conf');
const stream = require('stream');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Proxy = require('../tools/proxy');

describe('Pool', () => {
  const fileName = path.join(os.tmpdir(), Math.random() + 'tempStream.txt');

  before(function () {
    if (process.env.SKYSQL || process.env.SKYSQL_HA) this.skip();
  });

  after(function () {
    fs.unlink(fileName, (err) => {
      //eat
    });
  });

  it('pool metaAsArray', function (done) {
    if (process.env.SKYSQL || process.env.SKYSQL_HA) this.skip();
    const pool = base.createPool({
      metaAsArray: true,
      multipleStatements: true,
      connectionLimit: 1
    });
    pool
      .query(
        'DROP TABLE IF EXISTS t; ' +
          'CREATE TABLE t (i int);\n' +
          'INSERT INTO t(i) VALUES (1);\n' +
          'SELECT i FROM t; '
      )
      .then((res) => {
        assert.equal(2, res.length);
        assert.equal(4, res[0].length);
        assert.equal(4, res[1].length);
        assert.equal('i', res[1][3][0].name());
        pool.end();
        done();
      })
      .catch((err) => {
        pool.end();
        done(err);
      });
  });

  it('pool escape', function (done) {
    if (!base.utf8Collation()) this.skip();
    const pool = base.createPool({ connectionLimit: 1 });
    const pool2 = base.createPool({ connectionLimit: 1, arrayParenthesis: true });

    pool.on('connection', (conn) => {
      assert.equal(pool.escape(new Date('1999-01-31 12:13:14.000')), "'1999-01-31 12:13:14.000'");
      assert.equal(
        pool.escape(Buffer.from("let's rocks\n😊 🤘")),
        "_binary'let\\'s rocks\\n😊 🤘'"
      );
      assert.equal(pool.escape(19925.1), '19925.1');
      let prefix =
        (conn.info.isMariaDB() && conn.info.hasMinVersion(10, 1, 4)) ||
        (!conn.info.isMariaDB() && conn.info.hasMinVersion(5, 7, 6))
          ? 'ST_'
          : '';
      assert.equal(
        pool.escape({ type: 'Point', coordinates: [20, 10] }),
        prefix + "PointFromText('POINT(20 10)')"
      );
      assert.equal(
        pool.escape({ id: 2, val: "t'est" }),
        '\'{\\"id\\":2,\\"val\\":\\"t\\\'est\\"}\''
      );
      const fctStr = new Object();
      fctStr.toSqlString = () => {
        return "bla'bla";
      };
      assert.equal(pool.escape(fctStr), "'bla\\'bla'");
      assert.equal(pool.escape(null), 'NULL');
      assert.equal(pool.escape("let'g'o😊"), "'let\\'g\\'o😊'");
      assert.equal(pool.escape("a'\nb\tc\rd\\e%_\u001a"), "'a\\'\\nb\\tc\\rd\\\\e%_\\Z'");
      const arr = ["let'g'o😊", false, null, fctStr];
      assert.equal(pool.escape(arr), "'let\\'g\\'o😊',false,NULL,'bla\\'bla'");
      assert.equal(pool2.escape(arr), "('let\\'g\\'o😊',false,NULL,'bla\\'bla')");

      assert.equal(pool.escapeId('good_$one'), '`good_$one`');
      assert.equal(pool.escape(''), "''");
      assert.equal(pool.escapeId('f:a'), '`f:a`');
      assert.equal(pool.escapeId('`f:a`'), '`f:a`');
      assert.equal(pool.escapeId('good_`è`one'), '`good_``è``one`');
      pool.end();
      pool2.end();
      done();
    });
  });

  it('pool escape on init', function () {
    const pool = base.createPool({ connectionLimit: 1 });
    assert.equal(pool.escape(new Date('1999-01-31 12:13:14.000')), "'1999-01-31 12:13:14.000'");
    assert.equal(pool.escapeId('good_$one'), '`good_$one`');
    assert.equal(pool.escapeId('f:a'), '`f:a`');
    assert.equal(pool.escapeId('good_`è`one'), '`good_``è``one`');

    pool.end();
  });

  it('pool with wrong authentication', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE) this.skip(); //to avoid host beeing blocked
    this.timeout(10000);
    const pool = base.createPool({
      acquireTimeout: 4000,
      initializationTimeout: 2000,
      user: 'wrongAuthentication'
    });
    pool
      .query('SELECT 1')
      .then(() => {
        pool.end();
        done(new Error('must have thrown error'));
      })
      .catch((err) => {
        assert.isTrue(
          err.errno === 1524 ||
            err.errno === 1045 ||
            err.errno === 1698 ||
            err.errno === 45025 ||
            err.errno === 45028 ||
            err.errno === 45044,
          err.message
        );
        pool
          .query('SELECT 3')
          .then(() => {
            pool.end();
            done(new Error('must have thrown error'));
          })
          .catch((err) => {
            pool.end();
            assert.isTrue(
              err.errno === 1524 ||
                err.errno === 1045 ||
                err.errno === 1698 ||
                err.errno === 45028 ||
                err.errno === 45025 ||
                err.errno === 45044,
              err.message
            );
            done();
          });
      });
    pool
      .query('SELECT 2')
      .then(() => {
        pool.end();
        done(new Error('must have thrown error'));
      })
      .catch((err) => {
        assert.isTrue(
          err.errno === 1524 ||
            err.errno === 1045 ||
            err.errno === 1698 ||
            err.errno === 45025 ||
            err.errno === 45028 ||
            err.errno === 45044,
          err.message
        );
      });
  });

  it('pool with wrong authentication connection', function (done) {
    if (process.env.SKYSQL || process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL_HA)
      this.skip();
    this.timeout(10000);
    const pool = base.createPool({
      acquireTimeout: 4000,
      initializationTimeout: 2000,
      user: 'wrongAuthentication'
    });
    pool
      .getConnection()
      .then(() => {
        pool.end();
        done(new Error('must have thrown error'));
      })
      .catch((err) => {
        assert.isTrue(
          err.errno === 1524 ||
            err.errno === 1045 ||
            err.errno === 1698 ||
            err.errno === 45028 ||
            err.errno === 45025 ||
            err.errno === 45044,
          err.message
        );
        pool
          .getConnection()
          .then(() => {
            pool.end();
            done(new Error('must have thrown error'));
          })
          .catch((err) => {
            pool.end();
            assert.isTrue(
              err.errno === 1524 ||
                err.errno === 1045 ||
                err.errno === 1698 ||
                err.errno === 45028 ||
                err.errno === 45025 ||
                err.errno === 45044,
              err.message
            );
            done();
          });
      });
    pool
      .getConnection()
      .then(() => {
        pool.end();
        done(new Error('must have thrown error'));
      })
      .catch((err) => {
        assert.isTrue(
          err.errno === 1524 ||
            err.errno === 1045 ||
            err.errno === 1698 ||
            err.errno === 45028 ||
            err.errno === 45025 ||
            err.errno === 45044,
          err.message
        );
      });
  });

  it('create pool', function (done) {
    if (process.env.SKYSQL || process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL_HA)
      this.skip();
    this.timeout(5000);
    const pool = base.createPool({ connectionLimit: 1 });
    const initTime = Date.now();
    pool.getConnection().then((conn) => {
      conn.query('SELECT SLEEP(1)').then(() => {
        conn.release();
      });
    });
    pool.getConnection().then((conn) => {
      conn
        .query('SELECT SLEEP(1)')
        .then(() => {
          assert(
            Date.now() - initTime >= 1999,
            'expected > 2s, but was ' + (Date.now() - initTime)
          );
          conn.release();
          return pool.end();
        })
        .then(() => {
          done();
        });
    });
  });

  it('create pool with multipleStatement', function (done) {
    if (process.env.SKYSQL || process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL_HA)
      this.skip();
    this.timeout(5000);
    const pool = base.createPool({
      connectionLimit: 5,
      multipleStatements: true
    });
    pool
      .query('select 1; select 2')
      .then((results) => {
        //select 1 results
        assert.deepEqual(results, [[{ 1: 1 }], [{ 2: 2 }]]);
        pool.end();
        done();
      })
      .catch((err) => {
        pool.end();
        done(err);
      });
  });

  it('ensure commit', function (done) {
    shareConn
      .query('DROP TABLE IF EXISTS ensureCommit')
      .then(() => {
        return shareConn.query('CREATE TABLE ensureCommit(firstName varchar(32))');
      })
      .then(() => {
        return shareConn.query("INSERT INTO ensureCommit values ('john')");
      })
      .then((res) => {
        const pool = base.createPool({ connectionLimit: 1 });
        pool.getConnection().then((conn) => {
          conn
            .beginTransaction()
            .then(() => {
              return conn.query("UPDATE ensureCommit SET firstName='Tom'");
            })
            .then(() => {
              return conn.commit();
            })
            .then(() => {
              conn.end();
              return shareConn.query('SELECT * FROM ensureCommit');
            })
            .then((res) => {
              assert.deepEqual(res, [{ firstName: 'Tom' }]);
              return pool.end();
            })
            .then(() => {
              done();
            })
            .catch((err) => {
              conn.rollback();
              done(err);
            });
        });
      })
      .catch(done);
  });

  it('pool without control after use', function (done) {
    shareConn
      .query('DROP TABLE IF EXISTS ensureCommit')
      .then(() => {
        return shareConn.query('CREATE TABLE ensureCommit(firstName varchar(32))');
      })
      .then(() => {
        return shareConn.query("INSERT INTO ensureCommit values ('john')");
      })
      .then((res) => {
        const pool = base.createPool({
          connectionLimit: 1,
          noControlAfterUse: true
        });
        pool.getConnection().then((conn) => {
          conn
            .beginTransaction()
            .then(() => {
              return conn.query("UPDATE ensureCommit SET firstName='Tom'");
            })
            .then(() => {
              return conn.commit();
            })
            .then(() => {
              conn.end();
              return shareConn.query('SELECT * FROM ensureCommit');
            })
            .then((res) => {
              assert.deepEqual(res, [{ firstName: 'Tom' }]);
              return pool.end();
            })
            .then(() => {
              done();
            })
            .catch((err) => {
              conn.rollback();
              done(err);
            });
        });
      })
      .catch(done);
  });

  it('double end', function (done) {
    const pool = base.createPool({ connectionLimit: 1 });
    pool.getConnection().then((conn) => {
      conn.end();
      pool.end().then(() => {
        pool
          .end()
          .then(() => {
            done(new Error('must have thrown an error !'));
          })
          .catch((err) => {
            assert.isTrue(err.message.includes('pool is already closed'));
            done();
          });
      });
    });
  });

  it('pool ending during requests', function (done) {
    if (process.env.SKYSQL || process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL_HA)
      this.skip();
    this.timeout(20000);
    const initial = new Date();
    const pool = base.createPool({ connectionLimit: 1 });
    pool.getConnection().then((conn) => {
      conn.end().then(() => {
        const reflect = (p) =>
          p.then(
            (v) => ({ v, status: 'resolved' }),
            (e) => ({ e, status: 'rejected' })
          );

        const requests = [];
        for (let i = 0; i < 10000; i++) {
          requests.push(pool.query('SELECT ' + i));
        }

        setTimeout(pool.end, 200);
        const handle = setTimeout(() => {
          Promise.all(requests.map(reflect)).then((results) => {
            let success = 0,
              error = 0;
            results.forEach((x) => {
              if (x.status === 'resolved') {
                success++;
              } else {
                error++;
              }
            });
            console.log('error: ' + error + ' success:' + success);
          });
        }, 9500);

        Promise.all(requests.map(reflect)).then((results) => {
          let success = 0,
            error = 0;
          results.forEach((x) => {
            if (x.status === 'resolved') {
              success++;
            } else {
              error++;
            }
          });
          console.log('error:' + error + ' success:' + success);
          assert.isTrue(error > 0, 'error: ' + error + ' success:' + success);
          assert.isTrue(success > 0, 'error: ' + error + ' success:' + success);
          clearTimeout(handle);
          done();
        });
      });
    });
  });

  it('pool wrong query', function (done) {
    this.timeout(5000);
    const pool = base.createPool({ connectionLimit: 1 });
    pool
      .query('wrong query')
      .then(() => {
        done(new Error('must have thrown error !'));
      })
      .catch((err) => {
        if (err.errno === 1141) {
          // SKYSQL ERROR
          assert.isTrue(
            err.message.includes(
              'Query could not be tokenized and will hence be rejected. Please ensure that the SQL syntax is correct.'
            )
          );
          assert.equal(err.sqlState, 'HY000');
        } else {
          assert(err.message.includes(' You have an error in your SQL syntax'));
          assert.equal(err.sqlState, '42000');
          assert.equal(err.code, 'ER_PARSE_ERROR');
        }
        return pool.end();
      })
      .then(() => {
        done();
      });
  });

  it('pool getConnection after close', function (done) {
    const pool = base.createPool({ connectionLimit: 1 });
    pool.end().then(() => {
      pool.getConnection().catch((err) => {
        assert(err.message.includes('pool is closed'));
        assert.equal(err.sqlState, 'HY000');
        assert.equal(err.errno, 45027);
        assert.equal(err.code, 'ER_POOL_ALREADY_CLOSED');
        done();
      });
    });
  });

  it('pool query after close', function (done) {
    const pool = base.createPool({ connectionLimit: 1 });
    pool.end().then(() => {
      pool.query('select ?', 1).catch((err) => {
        assert(err.message.includes('pool is closed'));
        assert.equal(err.sqlState, 'HY000');
        assert.equal(err.errno, 45027);
        assert.equal(err.code, 'ER_POOL_ALREADY_CLOSED');
        done();
      });
    });
  });

  it('pool getConnection timeout', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL || process.env.SKYSQL_HA)
      this.skip();
    const pool = base.createPool({ connectionLimit: 1, acquireTimeout: 200 });
    let errorThrown = false;
    pool
      .query('SELECT SLEEP(1)')
      .then(() => {
        return pool.end();
      })
      .then(() => {
        assert.isOk(errorThrown);
        done();
      })
      .catch(done);

    pool.getConnection().catch((err) => {
      assert(err.message.includes('retrieve connection from pool timeout'));
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.errno, 45028);
      assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
      errorThrown = true;
    });
  });

  it('pool leakDetectionTimeout timeout', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL || process.env.SKYSQL_HA)
      this.skip();
    const pool = base.createPool({
      connectionLimit: 1,
      acquireTimeout: 200,
      leakDetectionTimeout: 300
    });
    pool
      .getConnection()
      .then((conn) => {
        conn
          .query('SELECT SLEEP(1)')
          .then(() => {
            //must have log 2 message to console.
            conn.release();
            pool.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('pool getConnection timeout recovery', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL || process.env.SKYSQL_HA)
      this.skip();
    this.timeout(5000);
    const pool = base.createPool({
      connectionLimit: 10,
      acquireTimeout: 800,
      leakDetectionTimeout: 1250
    });
    let errorThrown = false;
    setTimeout(() => {
      for (let i = 0; i < 10; i++) {
        pool.query('SELECT SLEEP(1)').catch((err) => {
          console.log('SLEEP ERROR');
          done(err);
        });
      }

      for (let i = 0; i < 10; i++) {
        pool.getConnection().catch((err) => {
          assert(err.message.includes('retrieve connection from pool timeout'));
          assert.equal(err.sqlState, 'HY000');
          assert.equal(err.errno, 45028);
          assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
          errorThrown = true;
        });
      }
      for (let i = 0; i < 100; i++) {
        setTimeout(() => {
          pool
            .getConnection()
            .then((conn) => {
              conn.release();
            })
            .catch((err) => {
              done(err);
            });
        }, 1100);
      }
      setTimeout(() => {
        pool
          .getConnection()
          .then((conn) => {
            assert.isOk(errorThrown);
            conn.release();
            pool.end();
            done();
          })
          .catch(done);
      }, 1200);
    }, 1000);
  });

  it('pool query timeout', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL || process.env.SKYSQL_HA)
      this.skip();
    this.timeout(5000);
    const pool = base.createPool({ connectionLimit: 1, acquireTimeout: 500 });
    const initTime = Date.now();
    pool
      .query('SELECT SLEEP(2)')
      .then(() => {
        pool.end();
      })
      .catch(() => {
        pool.end();
      });

    pool
      .query('SELECT 1')
      .then(() => {
        done(new Error('must have thrown error 1 !'));
      })
      .catch((err) => {
        assert(err.message.includes('retrieve connection from pool timeout'));
        assert.equal(err.sqlState, 'HY000');
        assert.equal(err.errno, 45028);
        assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
      });
    pool
      .query('SELECT 2')
      .then(() => {
        done(new Error('must have thrown error 2 !'));
      })
      .catch((err) => {
        assert(err.message.includes('retrieve connection from pool timeout'));
        assert.equal(err.sqlState, 'HY000');
        assert.equal(err.errno, 45028);
        assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
        const elapse = Date.now() - initTime;
        assert.isOk(
          elapse >= 498 && elapse < 600,
          'elapse time was ' + elapse + ' but must be just after 500'
        );
      });
    setTimeout(() => {
      pool
        .query('SELECT 3')
        .then(() => {
          done(new Error('must have thrown error 3 !'));
        })
        .catch((err) => {
          assert(err.message.includes('retrieve connection from pool timeout'));
          assert.equal(err.sqlState, 'HY000');
          assert.equal(err.errno, 45028);
          assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
          const elapse = Date.now() - initTime;
          assert.isOk(
            elapse >= 698 && elapse < 800,
            'elapse time was ' + elapse + ' but must be just after 700'
          );
          done();
        });
    }, 200);
  });

  it('pool grow', function (done) {
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
          .query('SELECT ? as a', [i])
          .then((rows) => {
            assert.deepEqual(rows, [{ a: i }]);
          })
          .catch((err) => {
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
              if (Conf.baseConfig.host === 'localhost') {
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

  it('connection fail handling', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL || process.env.SKYSQL_HA)
      this.skip();
    const pool = base.createPool({
      connectionLimit: 2,
      minDelayValidation: 200
    });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);
      assert.equal(pool.taskQueueSize(), 0);

      pool
        .getConnection()
        .then((conn) => {
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);
          assert.equal(pool.taskQueueSize(), 0);

          conn.query('KILL CONNECTION_ID()').catch((err) => {
            assert.equal(err.sqlState, 70100);
            assert.equal(pool.activeConnections(), 1);
            assert.equal(pool.totalConnections(), 2);
            assert.equal(pool.idleConnections(), 1);
            assert.equal(pool.taskQueueSize(), 0);
            conn
              .end()
              .then(() => {
                assert.equal(pool.activeConnections(), 0);
                assert.equal(pool.taskQueueSize(), 0);
                return pool.end();
              })
              .then(() => {
                done();
              })
              .catch(done);
          });
        })
        .catch(done);
    }, 500);
  });

  it('query fail handling', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL || process.env.SKYSQL_HA)
      this.skip();
    const pool = base.createPool({
      connectionLimit: 2,
      minDelayValidation: 200
    });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);
      assert.equal(pool.taskQueueSize(), 0);

      pool.query('KILL CONNECTION_ID()').catch((err) => {
        assert.equal(err.sqlState, 70100);
        setImmediate(() => {
          //waiting for rollback to end
          assert.equal(pool.taskQueueSize(), 0);

          setTimeout(() => {
            pool.query('do 1');
            pool.query('do 1').then(() => {
              setTimeout(() => {
                //connection recreated
                assert.equal(pool.activeConnections(), 0);
                assert.equal(pool.totalConnections(), 2);
                assert.equal(pool.idleConnections(), 2);
                assert.equal(pool.taskQueueSize(), 0);
                pool
                  .end()
                  .then(() => {
                    done();
                  })
                  .catch(done);
              }, 250);
            });
          }, 250);
        });
      });
    }, 500);
  });

  it('connection end', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL || process.env.SKYSQL_HA)
      this.skip();
    const pool = base.createPool({ connectionLimit: 2 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);

      pool
        .getConnection()
        .then((conn) => {
          //check available connections in pool
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);

          conn
            .end()
            .then(() => {
              assert.equal(pool.activeConnections(), 0);
              assert.equal(pool.totalConnections(), 2);
              assert.equal(pool.idleConnections(), 2);
              return pool.end();
            })
            .then(() => {
              done();
            })
            .catch(done);
        })
        .catch(done);
    }, 500);
  });

  it('connection release alias', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL || process.env.SKYSQL_HA)
      this.skip();
    const pool = base.createPool({ connectionLimit: 2 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);

      pool
        .getConnection()
        .then((conn) => {
          //check available connections in pool
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);

          conn
            .release()
            .then(() => {
              assert.equal(pool.activeConnections(), 0);
              assert.equal(pool.totalConnections(), 2);
              assert.equal(pool.idleConnections(), 2);
              return pool.end();
            })
            .then(() => {
              done();
            })
            .catch(done);
        })
        .catch(done);
    }, 500);
  });

  it('connection destroy', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL || process.env.SKYSQL_HA)
      this.skip();
    const pool = base.createPool({ connectionLimit: 2 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);

      pool
        .getConnection()
        .then((conn) => {
          //check available connections in pool
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);

          conn.destroy();

          assert.equal(pool.activeConnections(), 0);
          assert.equal(pool.totalConnections(), 1);
          assert.equal(pool.idleConnections(), 1);
          return pool.end();
        })
        .then(() => {
          done();
        })
        .catch(done);
    }, 500);
  });

  it('pool rollback on connection return', function (done) {
    const pool = base.createPool({ connectionLimit: 1 });
    pool.getConnection().then((conn) => {
      conn
        .query('DROP TABLE IF EXISTS rollbackTable')
        .then(() => {
          return conn.query('CREATE TABLE rollbackTable(col varchar(10))');
        })
        .then(() => {
          return conn.query('set autocommit = 0');
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
            .then((conn) => {
              return conn.query('SELECT * FROM rollbackTable');
            })
            .then((res) => {
              assert.equal(res.length, 0);
              return conn.end();
            })
            .then(() => {
              return pool.end();
            })
            .then(() => {
              done();
            });
        })
        .catch(done);
    });
  });

  it('pool batch', function (done) {
    const pool = base.createPool({ connectionLimit: 1, resetAfterUse: false });
    pool
      .query('DROP TABLE IF EXISTS parse')
      .then(() => {
        return pool.query('CREATE TABLE parse(id int, id2 int, id3 int, t varchar(128), id4 int)');
      })
      .then(() => {
        return pool.batch('INSERT INTO `parse` values (1, ?, 2, ?, 3)', [
          [1, 'john'],
          [2, 'jack']
        ]);
      })
      .then((res) => {
        assert.equal(res.affectedRows, 2);
        return pool.query('select * from `parse`');
      })
      .then((res) => {
        assert.deepEqual(res, [
          {
            id: 1,
            id2: 1,
            id3: 2,
            t: 'john',
            id4: 3
          },
          {
            id: 1,
            id2: 2,
            id3: 2,
            t: 'jack',
            id4: 3
          }
        ]);
        return pool.end();
      })
      .then(() => {
        done();
      })
      .catch(done);
  });

  it('pool batch single array', function (done) {
    const pool = base.createPool({ connectionLimit: 1, resetAfterUse: false });

    pool
      .query('DROP TABLE IF EXISTS singleBatchArray')
      .then(() => {
        return pool.query('CREATE TABLE singleBatchArray(id int)');
      })
      .then(() => {
        return pool.batch('INSERT INTO `singleBatchArray` values (?)', [1, 2, 3]);
      })
      .then((res) => {
        assert.equal(res.affectedRows, 3);
        return pool.query('select * from `singleBatchArray`');
      })
      .then((res) => {
        assert.deepEqual(res, [
          {
            id: 1
          },
          {
            id: 2
          },
          {
            id: 3
          }
        ]);
        return pool.end();
      })
      .then(() => {
        done();
      })
      .catch(done);
  });

  it("ensure pipe ending doesn't stall connection", function (done) {
    if (process.env.SKYSQL || process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL_HA)
      this.skip();
    //sequence engine only exist in MariaDB
    if (!shareConn.info.isMariaDB()) this.skip();
    const ver = process.version.substring(1).split('.');
    //stream.pipeline doesn't exist before node.js 8
    if (parseInt(ver[0]) < 10) this.skip();

    this.timeout(10000);
    const pool = base.createPool({ connectionLimit: 1 });

    pool
      .getConnection()
      .then((conn) => {
        const someWriterStream = fs.createWriteStream(fileName);

        let received = 0;
        const transformStream = new stream.Transform({
          objectMode: true,
          transform: function transformer(chunk, encoding, callback) {
            callback(null, JSON.stringify(chunk));
            received++;
          }
        });

        const queryStream = conn.queryStream(
          "SELECT seq ,REPEAT('a', 100) as val FROM seq_1_to_10000"
        );

        stream.pipeline(queryStream, transformStream, someWriterStream, () => {
          assert.isTrue(received >= 0 && received < 10000, 'received ' + received + ' results');
          conn.query('SELECT 1').then((res) => {
            conn.end();
            pool.end();
            done();
          });
        });

        setTimeout(someWriterStream.destroy.bind(someWriterStream), 2);
      })
      .catch(done);
  });

  it('test minimum idle decrease', function (done) {
    if (process.env.SKYSQL || process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL_HA)
      this.skip();
    this.timeout(30000);
    const pool = base.createPool({
      connectionLimit: 10,
      minimumIdle: 8,
      idleTimeout: 1,
      acquireTimeout: 20000
    });

    const requests = [];
    for (let i = 0; i < 5000; i++) {
      requests.push(pool.query('SELECT ' + i));
    }

    var test = () => {
      Promise.all(requests)
        .then(() => {
          setTimeout(() => {
            assert.isTrue(
              pool.totalConnections() === 8 ||
                pool.totalConnections() === 9 ||
                pool.totalConnections() === 10
            );
            assert.isTrue(
              pool.idleConnections() === 8 ||
                pool.idleConnections() === 9 ||
                pool.idleConnections() === 10
            );
          }, 5);

          setTimeout(() => {
            //wait for 2 second > idleTimeout
            assert.equal(pool.totalConnections(), 8);
            assert.equal(pool.idleConnections(), 8);
          }, 2000);

          setTimeout(() => {
            //minimumIdle-1 is possible after reaching idleTimeout and connection
            // is still not recreated
            assert.isTrue(pool.totalConnections() === 8 || pool.totalConnections() === 7);
            assert.isTrue(pool.idleConnections() === 8 || pool.idleConnections() === 7);
            pool.end();
            done();
          }, 3000);
        })
        .catch((err) => {
          pool.end();
          done(err);
        });
    };

    const waitServerConnections = (max) => {
      if (max > 0) {
        setTimeout(() => {
          console.log(pool.totalConnections());
          if (pool.totalConnections() < 8) {
            waitServerConnections(max - 1);
          } else test();
        }, 1000);
      } else {
        done(new Error("pool doesn't have at least 8 connections after 10s"));
      }
    };
    waitServerConnections(10);
  });

  it('test minimum idle', function (done) {
    if (process.env.SKYSQL || process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL_HA)
      this.skip();
    this.timeout(5000);
    const pool = base.createPool({
      connectionLimit: 10,
      minimumIdle: 4,
      idleTimeout: 2
    });

    setTimeout(() => {
      //minimumIdle-1 is possible after reaching idleTimeout and connection
      // is still not recreated
      assert.isTrue(pool.totalConnections() === 4 || pool.totalConnections() === 3);
      assert.isTrue(pool.idleConnections() === 4 || pool.idleConnections() === 3);
      pool
        .end()
        .then(() => done())
        .catch(done);
    }, 4000);
  });

  it('pool immediate error', function (done) {
    if (process.env.SKYSQL || process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL_HA)
      this.skip();
    const pool = base.createPool({});
    pool
      .getConnection()
      .then(() => {
        done(new Error('must have thrown an Exception'));
      })
      .catch((err) => {
        assert(err.message.includes('Cannot create new connection to pool, pool closed'));
        assert.equal(err.sqlState, '08S01');
        assert.equal(err.errno, 45035);
        done();
      });
    pool.end();
  });

  it('pool server defect timeout', function (done) {
    if (process.env.SKYSQL || process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL_HA)
      this.skip();
    this.timeout(5000);
    const proxy = new Proxy({
      port: Conf.baseConfig.port,
      proxyPort: 4000,
      host: Conf.baseConfig.host
    });

    const initTime = Date.now();
    const pool = base.createPool({
      port: 4000,
      acquireTimeout: 1000,
      minDelayValidation: 0,
      connectionLimit: 1,
      noControlAfterUse: true
    });

    // test use proxy that stop answer for 1.5s,
    // with pool.getConnection with 1s timeout.
    // (minDelayValidation is set to 0, to ensure ping is done each time for existing connection)
    pool
      .getConnection()
      .then((conn) => {
        proxy.suspendRemote();
        setTimeout(() => {
          proxy.resumeRemote();
        }, 1500);
        conn.release();

        pool
          .getConnection()
          .then(() => {
            done(new Error('must have thrown error !' + (Date.now() - initTime)));
          })
          .catch((err) => {
            assert.isTrue(
              Date.now() - initTime > 995,
              'expected > 1000, but was ' + (Date.now() - initTime)
            );
            pool
              .getConnection()
              .then((conn2) => {
                conn2.release();
                pool.end();
                proxy.close();
                done();
              })
              .catch(done);
          });
      })
      .catch(done);
  });
});
