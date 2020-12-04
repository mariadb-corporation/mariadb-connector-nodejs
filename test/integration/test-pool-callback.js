'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const Conf = require('../conf');

describe('Pool callback', () => {
  before(function () {
    if (process.env.SKYSQL || process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL_HA)
      this.skip();
  });

  it('pool with wrong authentication', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE) this.skip(); //to avoid host beeing blocked
    this.timeout(10000);
    const pool = base.createPoolCallback({
      acquireTimeout: 4000,
      initializationTimeout: 2000,
      user: 'wrongAuthentication'
    });
    pool.query('SELECT 1', (err) => {
      if (!err) {
        done(new Error('must have thrown error'));
      } else {
        pool.query('SELECT 3', (err) => {
          if (!err) {
            done(new Error('must have thrown error'));
          } else {
            assert.isTrue(
              err.errno === 1524 ||
                err.errno === 1045 ||
                err.errno === 1698 ||
                err.errno === 45028 ||
                err.errno === 45025 ||
                err.errno === 45044,
              err.message
            );
            pool.end();
            done();
          }
        });
      }
    });
    pool.query('SELECT 2', (err) => {
      if (!err) {
        done(new Error('must have thrown error'));
      }
    });
  });

  it('pool with wrong authentication connection', function (done) {
    this.timeout(10000);
    const pool = base.createPoolCallback({
      connectionLimit: 3,
      user: 'wrongAuthentication',
      acquireTimeout: 4000,
      initializationTimeout: 2000
    });
    pool.getConnection((err) => {
      if (!err) {
        done(new Error('must have thrown error'));
      } else {
        pool.getConnection((err) => {
          pool.end();
          if (!err) {
            done(new Error('must have thrown error'));
          } else {
            assert.isTrue(
              err.errno === 1524 ||
                err.errno === 1045 ||
                err.errno === 1698 ||
                err.errno === 45028 ||
                err.errno === 45025 ||
                err.errno === 45044,
              err.errno + ' - ' + err.message
            );
            done();
          }
        });
      }
    });
    pool.getConnection((err) => {
      if (!err) {
        done(new Error('must have thrown error'));
      }
    });
  });

  it('create pool', function (done) {
    if (process.env.SKYSQL || process.env.SKYSQL_HA) this.skip();
    this.timeout(5000);
    const pool = base.createPoolCallback({ connectionLimit: 1 });
    const initTime = Date.now();
    pool.getConnection((err, conn) => {
      conn.query('SELECT SLEEP(1)', () => {
        conn.release();
      });
    });
    pool.getConnection((err, conn) => {
      conn.query('SELECT SLEEP(1)', () => {
        assert(Date.now() - initTime >= 1999, 'expected > 2s, but was ' + (Date.now() - initTime));
        conn.release();
        pool.end((err) => {
          done();
        });
      });
    });
  });

  it('create pool with noControlAfterUse', function (done) {
    if (process.env.SKYSQL || process.env.SKYSQL_HA) this.skip();
    this.timeout(5000);
    const pool = base.createPoolCallback({
      connectionLimit: 1,
      noControlAfterUse: true
    });
    const initTime = Date.now();
    pool.getConnection((err, conn) => {
      conn.query('SELECT SLEEP(1)', () => {
        conn.release();
      });
    });
    pool.getConnection((err, conn) => {
      conn.query('SELECT SLEEP(1)', () => {
        assert(Date.now() - initTime >= 1999, 'expected > 2s, but was ' + (Date.now() - initTime));
        conn.release();
        pool.end((err) => {
          done();
        });
      });
    });
  });

  it('pool wrong query', function (done) {
    this.timeout(5000);
    const pool = base.createPoolCallback({ connectionLimit: 1 });
    pool.query('wrong query', (err) => {
      if (err.errno === 1141) {
        // SKYSQL ERROR
        assert.isTrue(
          err.message.includes(
            'Query could not be tokenized and will hence be rejected. Please ensure that the SQL syntax is correct.'
          )
        );
        assert.equal(err.sqlState, 'HY000');
      } else {
        assert(err.message.includes('You have an error in your SQL syntax'));
        assert.equal(err.sqlState, '42000');
        assert.equal(err.code, 'ER_PARSE_ERROR');
      }
      pool.end((err) => {
        done();
      });
    });
  });

  it('pool getConnection after close', function (done) {
    const pool = base.createPoolCallback({ connectionLimit: 1 });
    pool.end(() => {
      pool.getConnection((err) => {
        assert(err.message.includes('pool is closed'));
        assert.equal(err.sqlState, 'HY000');
        assert.equal(err.errno, 45027);
        assert.equal(err.code, 'ER_POOL_ALREADY_CLOSED');
        done();
      });
    });
  });

  it('pool query after close', function (done) {
    const pool = base.createPoolCallback({ connectionLimit: 1 });
    pool.end(() => {
      pool.query('select ?', 1, (err) => {
        assert(err.message.includes('pool is closed'));
        assert.equal(err.sqlState, 'HY000');
        assert.equal(err.errno, 45027);
        assert.equal(err.code, 'ER_POOL_ALREADY_CLOSED');
        done();
      });
    });
  });

  it('pool getConnection timeout', function (done) {
    if (process.env.SKYSQL || process.env.SKYSQL_HA) this.skip();
    const pool = base.createPoolCallback({
      connectionLimit: 1,
      acquireTimeout: 200
    });
    let errorThrown = false;
    pool.query('SELECT SLEEP(1)', (err) => {
      if (err) {
        done(err);
      } else {
        pool.end((err) => {
          assert.isOk(errorThrown);
          done();
        });
      }
    });
    pool.getConnection((err) => {
      assert(err.message.includes('retrieve connection from pool timeout'));
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.errno, 45028);
      assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
      errorThrown = true;
    });
  });

  it('pool query timeout', function (done) {
    if (process.env.SKYSQL || process.env.SKYSQL_HA) this.skip();
    this.timeout(5000);
    const pool = base.createPoolCallback({
      connectionLimit: 1,
      acquireTimeout: 500
    });
    const initTime = Date.now();
    pool.query('SELECT SLEEP(?)', 2, () => {
      pool.end();
    });
    pool.query('SELECT 1', (err, res) => {
      assert(err.message.includes('retrieve connection from pool timeout'));
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.errno, 45028);
      assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
    });
    pool.query('SELECT 2', (err) => {
      assert(err.message.includes('retrieve connection from pool timeout'));
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.errno, 45028);
      assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
      const elapse = Date.now() - initTime;
      assert.isOk(
        elapse >= 499 && elapse < 550,
        'elapse time was ' + elapse + ' but must be just after 500'
      );
    });
    setTimeout(() => {
      pool.query('SELECT 3', (err) => {
        assert(err.message.includes('retrieve connection from pool timeout'));
        assert.equal(err.sqlState, 'HY000');
        assert.equal(err.errno, 45028);
        assert.equal(err.code, 'ER_GET_CONNECTION_TIMEOUT');
        const elapse = Date.now() - initTime;
        assert.isOk(
          elapse >= 698 && elapse < 750,
          'elapse time was ' + elapse + ' but must be just after 700'
        );
        done();
      });
    }, 200);
  });

  it('pool grow', function (done) {
    this.timeout(20000);
    const pool = base.createPoolCallback({ connectionLimit: 10 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 10);
      assert.equal(pool.idleConnections(), 10);
      assert.equal(pool.taskQueueSize(), 0);
      let closed = false;
      let doneSend = false;
      for (let i = 0; i < 10000; i++) {
        pool.query('SELECT ? as a', [i], (err, rows) => {
          if (err) {
            if (!doneSend) {
              doneSend = true;
              done(err);
            }
          } else {
            assert.deepEqual(rows, [{ a: i }]);
          }
        });
      }
      setImmediate(() => {
        if (pool.activeConnections() < 10) {
          // for very slow env
          setTimeout(() => {
            assert.equal(pool.activeConnections(), 10);
            assert.equal(pool.totalConnections(), 10);
            assert.equal(pool.idleConnections(), 0);
            assert.isOk(pool.taskQueueSize() > 8000);
          }, 200);
        } else {
          assert.equal(pool.activeConnections(), 10);
          assert.equal(pool.totalConnections(), 10);
          assert.equal(pool.idleConnections(), 0);
          assert.isOk(pool.taskQueueSize() > 9950);
        }

        setTimeout(() => {
          closed = true;
          pool.end(() => {
            if (Conf.baseConfig.host === 'localhost') {
              assert.equal(pool.activeConnections(), 0);
              assert.equal(pool.totalConnections(), 0);
              assert.equal(pool.idleConnections(), 0);
              assert.equal(pool.taskQueueSize(), 0);
            }
            if (!doneSend) done();
          });
        }, 5000);
      });
    }, 8000);
  });

  it('connection fail handling', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL || process.env.SKYSQL_HA)
      this.skip();
    const pool = base.createPoolCallback({
      connectionLimit: 2,
      minDelayValidation: 200
    });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);
      assert.equal(pool.taskQueueSize(), 0);

      pool.getConnection((err, conn) => {
        if (err) {
          done(err);
        } else {
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);
          assert.equal(pool.taskQueueSize(), 0);

          conn.query('KILL CONNECTION_ID()', (err) => {
            assert.equal(err.sqlState, 70100);
            assert.equal(pool.activeConnections(), 1);
            assert.equal(pool.totalConnections(), 2);
            assert.equal(pool.idleConnections(), 1);
            assert.equal(pool.taskQueueSize(), 0);
            conn.end(() => {
              assert.equal(pool.activeConnections(), 0);
              assert.equal(pool.taskQueueSize(), 0);
              pool.end(() => {
                done();
              });
            });
          });
        }
      });
    }, 500);
  });

  it('query fail handling', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL || process.env.SKYSQL_HA)
      this.skip();
    const pool = base.createPoolCallback({
      connectionLimit: 2,
      minDelayValidation: 200
    });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);
      assert.equal(pool.taskQueueSize(), 0);

      pool.query('KILL CONNECTION_ID()', (err) => {
        assert.equal(err.sqlState, 70100);
        setImmediate(() => {
          assert.equal(pool.taskQueueSize(), 0);

          setTimeout(() => {
            pool.query('do 1');
            pool.query('do 1', () => {
              setTimeout(() => {
                //connection recreated
                assert.equal(pool.activeConnections(), 0);
                assert.equal(pool.totalConnections(), 2);
                assert.equal(pool.idleConnections(), 2);
                assert.equal(pool.taskQueueSize(), 0);
                pool.end(() => {
                  done();
                });
              }, 250);
            });
          }, 250);
        });
      });
    }, 500);
  });

  it('connection end', function (done) {
    if (process.env.SKYSQL || process.env.SKYSQL_HA) this.skip();
    const pool = base.createPoolCallback({ connectionLimit: 2 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);

      pool.getConnection((err, conn) => {
        if (err) {
          done(err);
        } else {
          //check available connections in pool
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);

          conn.end(() => {
            assert.equal(pool.activeConnections(), 0);
            assert.equal(pool.totalConnections(), 2);
            assert.equal(pool.idleConnections(), 2);
            pool.end(() => {
              done();
            });
          });
        }
      });
    }, 500);
  });

  it('connection release alias', function (done) {
    const pool = base.createPoolCallback({ connectionLimit: 2 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);

      pool.getConnection((err, conn) => {
        if (err) {
          done(err);
        } else {
          //check available connections in pool
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);

          conn.release(() => {
            assert.equal(pool.activeConnections(), 0);
            assert.equal(pool.totalConnections(), 2);
            assert.equal(pool.idleConnections(), 2);
            pool.end(() => {
              done();
            });
          });
        }
      });
    }, 500);
  });

  it('connection destroy', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE) this.skip();
    const pool = base.createPoolCallback({ connectionLimit: 2 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);

      pool.getConnection((err, conn) => {
        if (err) {
          done(err);
        } else {
          //check available connections in pool
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);

          conn.destroy();

          assert.equal(pool.activeConnections(), 0);
          assert.equal(pool.totalConnections(), 1);
          assert.equal(pool.idleConnections(), 1);
          pool.end(() => {
            done();
          });
        }
      });
    }, 500);
  });

  it('pool rollback on connection return', function (done) {
    const pool = base.createPoolCallback({ connectionLimit: 1 });
    pool.getConnection((err, conn) => {
      if (err) {
        done(err);
      } else {
        conn.query('DROP TABLE IF EXISTS rollbackTable', (err, res) => {
          conn.query('CREATE TABLE rollbackTable(col varchar(10))', (err, res) => {
            conn.query('set autocommit = 0', (err, res) => {
              conn.beginTransaction((err, res) => {
                conn.query("INSERT INTO rollbackTable value ('test')", (err, res) => {
                  conn.release((err) => {
                    pool.getConnection((err, conn) => {
                      conn.query('SELECT * FROM rollbackTable', (err, res) => {
                        assert.equal(res.length, 0);
                        conn.end(() => {
                          pool.end(() => {
                            done();
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
      }
    });
  });

  it('pool batch', function (done) {
    const pool = base.createPoolCallback({
      connectionLimit: 1,
      resetAfterUse: false
    });
    pool.query('DROP TABLE IF EXISTS parse', (err, res) => {
      pool.query(
        'CREATE TABLE parse(id int, id2 int, id3 int, t varchar(128), id4 int)',
        (err, res) => {
          pool.batch(
            'INSERT INTO `parse` values (1, ?, 2, ?, 3)',
            [
              [1, 'john'],
              [2, 'jack']
            ],
            (err, res) => {
              if (err) {
                done(err);
              } else {
                assert.equal(res.affectedRows, 2);
                pool.query('select * from `parse`', (err2, res2) => {
                  assert.deepEqual(res2, [
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
                  pool.query('DROP TABLE parse');
                  pool.end(() => {
                    done();
                  });
                });
              }
            }
          );
        }
      );
    });
  });

  it('pool batch without parameters', function (done) {
    const pool = base.createPoolCallback({
      connectionLimit: 1,
      resetAfterUse: false
    });
    pool.batch('INSERT INTO `parse` values (1, ?, 2, ?, 3)', (err, res) => {
      pool.end();
      if (err) {
        assert.isTrue(err.message.includes('Batch must have values set'));
        done();
      } else {
        done(new Error('must have thrown error'));
      }
    });
  });

  it('pool batch single array', function (done) {
    const pool = base.createPoolCallback({
      connectionLimit: 1,
      resetAfterUse: false
    });
    pool.query('DROP TABLE IF EXISTS singleBatchArrayCallback', (err, res) => {
      if (err) {
        pool.end();
        done(err);
      } else {
        pool.query('CREATE TABLE singleBatchArrayCallback(id int)', (err, res) => {
          if (err) {
            pool.end();
            done(err);
          } else {
            pool.batch(
              'INSERT INTO `singleBatchArrayCallback` values (?)',
              [1, 2, 3],
              (err, res) => {
                if (err) {
                  pool.end();
                  done(err);
                } else {
                  pool.query('select * from `singleBatchArrayCallback`', (err, res) => {
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
                    pool.end();
                    done();
                  });
                }
              }
            );
          }
        });
      }
    });
  });

  it('test minimum idle decrease', function (done) {
    if (process.env.SKYSQL || process.env.SKYSQL_HA) this.skip();
    this.timeout(30000);
    const pool = base.createPoolCallback({
      connectionLimit: 10,
      minimumIdle: 4,
      idleTimeout: 2,
      acquireTimeout: 20000
    });
    setTimeout(() => {
      for (let i = 0; i < 5000; i++) {
        pool.query('SELECT ' + i);
      }
      pool.query('SELECT 5000', [], (err) => {
        if (err) {
          pool.end();
          done(err);
        } else {
          setTimeout(() => {
            assert.equal(pool.totalConnections(), 10);
            assert.equal(pool.idleConnections(), 10);
          }, 5);

          setTimeout(() => {
            //minimumIdle-1 is possible after reaching idleTimeout and connection
            // is still not recreated
            assert.isTrue(pool.totalConnections() === 4 || pool.totalConnections() === 3);
            assert.isTrue(pool.idleConnections() === 4 || pool.idleConnections() === 3);
            pool.end();
            done();
          }, 7000);
        }
      });
    }, 4000);
  });

  it('test minimum idle', function (done) {
    this.timeout(10000);
    const pool = base.createPoolCallback({
      connectionLimit: 10,
      minimumIdle: 4,
      idleTimeout: 2,
      acquireTimeout: 20000
    });

    setTimeout(() => {
      //minimumIdle-1 is possible after reaching idleTimeout and connection
      // is still not recreated
      assert.isTrue(pool.totalConnections() === 4 || pool.totalConnections() === 3);
      assert.isTrue(pool.idleConnections() === 4 || pool.idleConnections() === 3);
      pool.end();
      done();
    }, 4000);
  });

  it('pool immediate error', function (done) {
    const pool = base.createPoolCallback({});
    pool.getConnection((err, conn) => {
      if (err) {
        assert(err.message.includes('Cannot create new connection to pool, pool closed'));
        assert.equal(err.sqlState, '08S01');
        assert.equal(err.errno, 45035);
        done();
      } else {
        done(new Error('must have thrown an Exception'));
      }
    });
    pool.end();
  });
});
