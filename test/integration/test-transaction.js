'use strict';

const base = require('../base.js');
const ServerStatus = require('../../lib/const/server-status');
const { assert } = require('chai');

describe('transaction', () => {
  before((done) => {
    shareConn
      .query('DROP TABLE IF EXISTS testTransaction')
      .then(() => {
        return shareConn.query('CREATE TABLE testTransaction (v varchar(10))');
      })
      .then(() => {
        done();
      })
      .catch(done);
  });

  it('transaction rollback', (done) => {
    shareConn
      .rollback()
      .then(() => {
        return shareConn.query('SET autocommit=0');
      })
      .then(() => {
        assert.equal(shareConn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
        assert.equal(shareConn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 0);
        return shareConn.beginTransaction();
      })
      .then(() => {
        assert.equal(shareConn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
        return shareConn.query("INSERT INTO testTransaction values ('test')");
      })
      .then(() => {
        assert.equal(shareConn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
        return shareConn.rollback();
      })
      .then(() => {
        assert.equal(shareConn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
        return shareConn.query('SELECT count(*) as nb FROM testTransaction');
      })
      .then((rows) => {
        assert.equal(shareConn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
        assert.equal(rows[0].nb, 0);
        done();
      })
      .catch(done);
  });

  it('transaction rollback with callback', (done) => {
    const conn = base.createCallbackConnection();
    conn.connect(function (err) {
      if (err) {
        return done(err);
      } else {
        conn.query('DROP TABLE IF EXISTS testTransaction2', (err) => {
          if (err) {
            return done(err);
          } else {
            conn.query('CREATE TABLE testTransaction2 (v varchar(10))', (err) => {
              if (err) return done(err);
              conn.rollback((err) => {
                if (err) return done(err);
                conn.query('SET autocommit=0', (err) => {
                  if (err) return done(err);
                  assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
                  assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 0);
                  conn.beginTransaction((err) => {
                    if (err) return done(err);
                    assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
                    conn.query("INSERT INTO testTransaction2 values ('test')");
                    assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
                    conn.rollback((err) => {
                      if (err) return done(err);
                      assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
                      conn.query('SELECT count(*) as nb FROM testTransaction2', (err, rows) => {
                        if (err) return done(err);
                        assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
                        assert.equal(rows[0].nb, 0);
                        conn.end();
                        done();
                      });
                    });
                  });
                });
              });
            });
          }
        });
      }
    });
  });

  it('transaction rollback with callback no function', (done) => {
    const conn = base.createCallbackConnection();
    conn.connect(function (err) {
      if (err) return done(err);
      conn.query('DROP TABLE IF EXISTS testTransaction2', (err) => {
        if (err) {
          return done(err);
        } else {
          conn.query('CREATE TABLE testTransaction2 (v varchar(10))', (err) => {
            if (err) return done(err);
            conn.rollback();
            conn.query('SET autocommit=0', (err) => {
              if (err) return done(err);
              assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
              assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 0);
              conn.beginTransaction();
              conn.query("INSERT INTO testTransaction2 values ('test')");
              conn.rollback();
              conn.query('SELECT count(*) as nb FROM testTransaction2', (err, rows) => {
                if (err) return done(err);
                assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
                assert.equal(rows[0].nb, 0);
                conn.end();
                done();
              });
            });
          });
        }
      });
    });
  });

  it('transaction commit', (done) => {
    shareConn
      .commit()
      .then(() => {
        return shareConn.query('SET autocommit=0');
      })
      .then(() => {
        assert.equal(shareConn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
        assert.equal(shareConn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 0);

        return shareConn.beginTransaction();
      })
      .then(() => {
        assert.equal(shareConn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
        return shareConn.query("INSERT INTO testTransaction values ('test')");
      })
      .then(() => {
        assert.equal(shareConn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
        return shareConn.commit();
      })
      .then(() => {
        assert.equal(shareConn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
        return shareConn.query('SELECT count(*) as nb FROM testTransaction');
      })
      .then((rows) => {
        assert.equal(shareConn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
        assert.equal(rows[0].nb, 1);
        done();
      })
      .catch(done);
  });

  it('transaction commit error handling', function (done) {
    let conn;
    base.createConnection().then((con) => {
      conn = con;
      return conn
        .query('SET autocommit=0')
        .then(() => {
          return conn.query('DROP TABLE IF EXISTS testTransaction1');
        })
        .then(() => {
          return conn.query('CREATE TABLE testTransaction1 (v varchar(10))');
        })
        .then(() => {
          return conn.query("INSERT INTO testTransaction1 values ('test')");
        })
        .then(() => {
          process.nextTick(
            conn.__tests
              .getSocket()
              .destroy.bind(conn.__tests.getSocket(), new Error('close forced'))
          );
          conn
            .commit()
            .then(() => {
              done('must have thrown error !');
              conn.end();
            })
            .catch((err) => {
              conn.end();
              done();
            });
        })
        .catch(done);
    });
  });

  it('transaction commit no callback with error', function (done) {
    const conn = base.createCallbackConnection();
    conn.connect((err) => {
      conn.query('SET autocommit=0', (err) => {
        if (err) {
          done(err);
        } else {
          conn.query('DROP TABLE IF EXISTS testTransaction2', (err) => {
            if (err) {
              done(err);
            } else {
              conn.query('CREATE TABLE testTransaction2 (v varchar(10))', (err) => {
                if (err) {
                  done(err);
                } else {
                  conn.query("INSERT INTO testTransaction2 values ('test')", (err) => {
                    process.nextTick(
                      conn.__tests
                        .getSocket()
                        .destroy.bind(conn.__tests.getSocket(), new Error('close forced'))
                    );
                    conn.commit();
                    done();
                  });
                }
              });
            }
          });
        }
      });
    });
  });

  it('transaction commit no callback success', function (done) {
    const conn = base.createCallbackConnection();
    conn.connect((err) => {
      conn.query('SET autocommit=0', (err) => {
        if (err) {
          done(err);
        } else {
          conn.query('DROP TABLE IF EXISTS testTransaction3', (err) => {
            if (err) {
              done(err);
            } else {
              conn.query('CREATE TABLE testTransaction3 (v varchar(10))', (err) => {
                if (err) {
                  done(err);
                } else {
                  conn.query("INSERT INTO testTransaction3 values ('test')", (err) => {
                    conn.commit();
                    setTimeout(() => {
                      conn.end();
                      done();
                    }, 100);
                  });
                }
              });
            }
          });
        }
      });
    });
  });

  it('transaction commit after end', function (done) {
    base
      .createConnection()
      .then((conn) => {
        conn
          .end()
          .then(() => {
            return conn.commit();
          })
          .then(() => {
            done(new Error('must have thrown error !'));
          })
          .catch((err) => {
            assert(err.message.includes('Cannot execute new commands: connection closed'));
            assert.equal(err.sqlState, '08S01');
            assert.equal(err.errno, 45013);
            assert.equal(err.code, 'ER_CMD_CONNECTION_CLOSED');
            done();
          });
      })
      .catch((err) => {
        done(err);
      });
  });

  it('transaction commit with callback', (done) => {
    const conn = base.createCallbackConnection();
    conn.connect((err) => {
      if (err) return done(err);
      conn.query('DROP TABLE IF EXISTS testTransaction4', (err) => {
        if (err) {
          return done(err);
        } else {
          conn.query('CREATE TABLE testTransaction4 (v varchar(10))', (err) => {
            if (err) return done(err);
            conn.commit((err) => {
              if (err) return done(err);
              conn.query('SET autocommit=0', (err) => {
                if (err) return done(err);
                assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
                assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 0);
                conn.beginTransaction((err) => {
                  if (err) return done(err);
                  assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
                  conn.query("INSERT INTO testTransaction4 values ('test')", (err) => {
                    if (err) return done(err);
                    assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
                    conn.commit((err) => {
                      if (err) return done(err);
                      assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 0);
                      conn.query('SELECT count(*) as nb FROM testTransaction4', (err, rows) => {
                        if (err) return done(err);
                        assert.equal(conn.info.status & ServerStatus.STATUS_IN_TRANS, 1);
                        assert.equal(rows[0].nb, 1);
                        conn.end(done);
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
  });
});
