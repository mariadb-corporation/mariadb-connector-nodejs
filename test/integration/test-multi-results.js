'use strict';

const base = require('../base.js');
const { assert } = require('chai');

describe('multi-results', () => {
  let multiStmtConn;

  before(function (done) {
    base
      .createConnection({ multipleStatements: true })
      .then((con) => {
        multiStmtConn = con;
        done();
      })
      .catch((err) => {
        console.log(err);
        done();
      });
  });

  after(function () {
    shareConn.query('DROP PROCEDURE IF EXISTS myProc').catch((err) => {});
    if (multiStmtConn) multiStmtConn.end();
  });

  it('simple do 1', function (done) {
    shareConn
      .query('DO 1')
      .then((rows) => {
        assert.deepEqual(rows, {
          affectedRows: 0,
          insertId: 0,
          warningStatus: 0
        });
        done();
      })
      .catch(done);
  });

  it('duplicate column', function (done) {
    base
      .createConnection()
      .then((conn) => {
        shareConn
          .query('DROP TABLE IF EXISTS t')
          .then(() => {
            return conn.query('CREATE TABLE t (i int)');
          })
          .then(() => {
            return conn.query('INSERT INTO t(i) VALUES (1)');
          })
          .then(() => {
            return conn.query({ rowsAsArray: true, sql: 'SELECT i, i FROM t' });
          })
          .then((res) => {
            conn
              .query('SELECT i, i FROM t')
              .then((res) => {
                conn.end();
                done(new Error('must have thrown an error'));
              })
              .catch((err) => {
                assert.isTrue(err.message.includes('Error in results, duplicate field name `i`'));
                assert.equal(err.errno, 45040);
                assert.equal(err.sqlState, 42000);
                assert.equal(err.code, 'ER_DUPLICATE_FIELD');
                conn
                  .rollback()
                  .then(() => {
                    conn.end();
                    done();
                  })
                  .catch((err) => {
                    conn.end();
                    done(err);
                  });
              });
          })
          .catch((err) => {
            conn.end();
            done(err);
          });
      })
      .catch(done);
  });

  it('duplicate column disabled', function (done) {
    base
      .createConnection({ checkDuplicate: false })
      .then((conn) => {
        shareConn
          .query('DROP TABLE IF EXISTS t')
          .then(() => {
            return conn.query('CREATE TABLE t (i int)');
          })
          .then(() => {
            return conn.query('INSERT INTO t(i) VALUES (1)');
          })
          .then(() => {
            return conn.query({ rowsAsArray: true, sql: 'SELECT i, i FROM t' });
          })
          .then((res) => {
            conn
              .query('SELECT i, i FROM t')
              .then((res) => {
                assert.deepEqual(res, [
                  {
                    i: 1
                  }
                ]);
                conn.end();
                done();
              })
              .catch(done);
          })
          .catch((err) => {
            conn.end();
            done(err);
          });
      })
      .catch(done);
  });

  it('duplicate column nestTables', function (done) {
    base
      .createConnection({ nestTables: true })
      .then((conn) => {
        shareConn
          .query('DROP TABLE IF EXISTS t')
          .then(() => {
            return conn.query('CREATE TABLE t (i int)');
          })
          .then(() => {
            return conn.query('INSERT INTO t(i) VALUES (1)');
          })
          .then(() => {
            return conn.query({ rowsAsArray: true, sql: 'SELECT i, i FROM t' });
          })
          .then((res) => {
            conn
              .query('SELECT i, i FROM t')
              .then((res) => {
                conn.end();
                done(new Error('must have thrown an error'));
              })
              .catch((err) => {
                assert.isTrue(
                  err.message.includes('Error in results, duplicate field name `t`.`i`')
                );
                assert.equal(err.errno, 45040);
                assert.equal(err.sqlState, 42000);
                assert.equal(err.code, 'ER_DUPLICATE_FIELD');
                conn.end();
                done();
              });
          })
          .catch((err) => {
            conn.end();
            done(err);
          });
      })
      .catch(done);
  });

  it('duplicate column disabled nestTables', function (done) {
    base
      .createConnection({ checkDuplicate: false, nestTables: true })
      .then((conn) => {
        shareConn
          .query('DROP TABLE IF EXISTS t')
          .then(() => {
            return conn.query('CREATE TABLE t (i int)');
          })
          .then(() => {
            return conn.query('INSERT INTO t(i) VALUES (1)');
          })
          .then(() => {
            return conn.query({ rowsAsArray: true, sql: 'SELECT i, i FROM t' });
          })

          .then((res) => {
            conn
              .query('SELECT i, i FROM t')
              .then((res) => {
                assert.deepEqual(res, [
                  {
                    t: {
                      i: 1
                    }
                  }
                ]);
                conn.end();
                done();
              })
              .catch(done);
          })
          .catch((err) => {
            conn.end();
            done(err);
          });
      })
      .catch(done);
  });

  it('simple do 1 with callback', function (done) {
    const callbackConn = base.createCallbackConnection();
    callbackConn.connect((err) => {
      if (err) {
        done(err);
      } else {
        callbackConn.query('DO 1', (err, rows) => {
          if (err) {
            done(err);
          } else {
            assert.deepEqual(rows, {
              affectedRows: 0,
              insertId: 0,
              warningStatus: 0
            });
            callbackConn.end();
            done();
          }
        });
      }
    });
  });

  it('simple query with sql option and callback', function (done) {
    const callbackConn = base.createCallbackConnection();
    callbackConn.connect((err) => {
      if (err) {
        done(err);
      } else {
        callbackConn.query({ sql: 'SELECT 1, 2', rowsAsArray: true }, (err, rows) => {
          if (err) {
            done(err);
          } else {
            assert.deepEqual(rows, [[1, 2]]);
            callbackConn.end();
            done();
          }
        });
      }
    });
  });

  it('simple do 1 with callback no function', function (done) {
    const callbackConn = base.createCallbackConnection();
    callbackConn.connect((err) => {
      if (err) {
        done(err);
      } else {
        callbackConn.query('DO 1');
        callbackConn.query('DO ?', [2]);
        callbackConn.end();
        done();
      }
    });
  });

  it('simple select 1', function (done) {
    shareConn
      .query('SELECT 1')
      .then((rows) => {
        assert.deepEqual(rows, [{ 1: 1 }]);
        done();
      })
      .catch(done);
  });

  it('query using callback and promise mode', function (done) {
    shareConn
      .query('select 1', (err, rows) => {})
      .then((rows) => {
        assert.deepEqual(rows, [{ 1: 1 }]);
        done();
      })
      .catch(done);
  });

  it('query result with option metaPromiseAsArray', function (done) {
    base.createConnection({ metaAsArray: true }).then((conn) => {
      conn
        .query('select 1')
        .then((obj) => {
          assert.equal(obj.length, 2);
          assert.deepEqual(obj[0], [{ 1: 1 }]);
          conn.end();
          done();
        })
        .catch(done);
    });
  });

  it('query result with option metaPromiseAsArray multiple', function (done) {
    if (process.env.SKYSQL) this.skip();
    base.createConnection({ metaAsArray: true, multipleStatements: true }).then((conn) => {
      conn
        .query('select 1; select 2')
        .then((obj) => {
          assert.equal(obj[0].length, 2);
          assert.equal(obj[1].length, 2);
          assert.deepEqual(obj[0], [[{ 1: 1 }], [{ 2: 2 }]]);
          conn.end();
          done();
        })
        .catch(done);
    });
  });

  it('simple select 1 with callback', function (done) {
    const callbackConn = base.createCallbackConnection();
    callbackConn.connect((err) => {
      if (err) {
        done(err);
      } else {
        callbackConn.query('SELECT 1', (err, rows) => {
          if (err) {
            done(err);
          } else {
            assert.deepEqual(rows, [{ 1: 1 }]);
            callbackConn.end();
            done();
          }
        });
      }
    });
  });

  it('multiple selects', function (done) {
    if (process.env.SKYSQL) this.skip();
    multiStmtConn
      .query('SELECT 1 as t; SELECT 2 as t2; SELECT 3 as t3')
      .then((rows) => {
        assert.equal(rows.length, 3);
        assert.deepEqual(rows[0], [{ t: 1 }]);
        assert.deepEqual(rows[1], [{ t2: 2 }]);
        assert.deepEqual(rows[2], [{ t3: 3 }]);
        done();
      })
      .catch(done);
  });

  it('multiple selects with callbacks', function (done) {
    if (process.env.SKYSQL) this.skip();
    const callbackConn = base.createCallbackConnection({
      multipleStatements: true
    });
    callbackConn.connect((err) => {
      if (err) {
        done(err);
      } else {
        callbackConn.query('SELECT 1 as t; SELECT 2 as t2; SELECT 3 as t3', (err, rows) => {
          if (err) {
            done(err);
          } else {
            assert.equal(rows.length, 3);
            assert.deepEqual(rows[0], [{ t: 1 }]);
            assert.deepEqual(rows[1], [{ t2: 2 }]);
            assert.deepEqual(rows[2], [{ t3: 3 }]);
            callbackConn.end();
            done();
          }
        });
      }
    });
  });

  it('multiple result type', function (done) {
    if (process.env.SKYSQL) this.skip();
    multiStmtConn
      .query('SELECT 1 as t; DO 1')
      .then((rows) => {
        assert.equal(rows.length, 2);
        assert.deepEqual(rows[0], [{ t: 1 }]);
        assert.deepEqual(rows[1], {
          affectedRows: 0,
          insertId: 0,
          warningStatus: 0
        });
        done();
      })
      .catch(done);
  });

  it('multiple result type with callback', function (done) {
    if (process.env.SKYSQL) this.skip();
    const callbackConn = base.createCallbackConnection({
      multipleStatements: true
    });
    callbackConn.connect((err) => {
      if (err) {
        done(err);
      } else {
        callbackConn.query('SELECT 1 as t; DO 1', (err, rows) => {
          if (err) {
            done(err);
          } else {
            assert.equal(rows.length, 2);
            assert.deepEqual(rows[0], [{ t: 1 }]);
            assert.deepEqual(rows[1], {
              affectedRows: 0,
              insertId: 0,
              warningStatus: 0
            });
            callbackConn.end();
            done();
          }
        });
      }
    });
  });

  it('multiple result type with multiple rows', function (done) {
    if (process.env.SKYSQL) this.skip();
    //using sequence engine
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 1)) this.skip();
    multiStmtConn
      .query('select * from seq_1_to_2; DO 1;select * from seq_2_to_3')
      .then((rows) => {
        assert.equal(rows.length, 3);
        assert.deepEqual(rows[0], [{ seq: 1 }, { seq: 2 }]);
        assert.deepEqual(rows[1], {
          affectedRows: 0,
          insertId: 0,
          warningStatus: 0
        });
        assert.deepEqual(rows[2], [{ seq: 2 }, { seq: 3 }]);
        done();
      })
      .catch(done);
  });

  it('multiple result from procedure', function (done) {
    if (process.env.SKYSQL) this.skip();
    shareConn.query('CREATE PROCEDURE myProc () BEGIN  SELECT 1; SELECT 2; END');
    shareConn
      .query('call myProc()')
      .then((rows) => {
        assert.equal(rows.length, 3);
        assert.deepEqual(rows[0], [{ 1: 1 }]);
        assert.deepEqual(rows[1], [{ 2: 2 }]);
        assert.deepEqual(rows[2], {
          affectedRows: 0,
          insertId: 0,
          warningStatus: 0
        });
        done();
      })
      .catch(done);
  });
});
