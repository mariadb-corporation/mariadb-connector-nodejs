'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const ServerStatus = require('../../lib/const/server-status');

describe('reset connection', () => {
  it('reset user variable', function (done) {
    base
      .createConnection()
      .then((conn) => {
        conn
          .query("set @youhou='test'")
          .then(() => {
            return conn.query('select @youhou');
          })
          .then((rows) => {
            assert.deepEqual(rows, [{ '@youhou': 'test' }]);
            return conn.reset();
          })
          .then(() => {
            return conn.query('select @youhou');
          })
          .then((rows) => {
            conn.end();
            if (
              (conn.info.isMariaDB() && conn.info.hasMinVersion(10, 2, 4)) ||
              (!conn.info.isMariaDB() && conn.info.hasMinVersion(5, 7, 3))
            ) {
              assert.deepEqual(rows, [{ '@youhou': null }]);
              done();
            } else {
              done(new Error('must have thrown an error'));
            }
          })
          .catch((err) => {
            if (
              (conn.info.isMariaDB() && conn.info.hasMinVersion(10, 2, 4)) ||
              (!conn.info.isMariaDB() && conn.info.hasMinVersion(5, 7, 3))
            ) {
              done(err);
            } else {
              conn.end();
              done();
            }
          });
      })
      .catch(done);
  });

  it('reset temporary tables', function (done) {
    base
      .createConnection()
      .then((conn) => {
        conn
          .query('CREATE TEMPORARY TABLE resetTemporaryTable(t varchar(128))')
          .then(() => {
            return conn.query('select * from resetTemporaryTable');
          })
          .then((rows) => {
            assert.deepEqual(rows, []);
            return conn.reset();
          })
          .then(() => {
            return conn.query('select * from resetTemporaryTable');
          })
          .then((rows) => {
            done(new Error('temporary table must not exist !'));
          })
          .catch((err) => {
            if (
              (conn.info.isMariaDB() && conn.info.hasMinVersion(10, 2, 4)) ||
              (!conn.info.isMariaDB() && conn.info.hasMinVersion(5, 7, 3))
            ) {
              assert.equal(err.errno, 1146);
            }
            conn.end();
            done();
          });
      })
      .catch(done);
  });

  it('reset transaction in progress', function (done) {
    shareConn.query('DROP TABLE IF EXISTS resetTransaction');
    shareConn.query('CREATE TABLE resetTransaction(firstName varchar(32))');
    shareConn
      .query("INSERT INTO resetTransaction values ('john')")
      .then((res) => {
        base.createConnection().then((conn) => {
          conn
            .beginTransaction()
            .then(() => {
              return conn.query("UPDATE resetTransaction SET firstName='Tom'");
            })
            .then(() => {
              assert.isTrue((conn.info.status & ServerStatus.STATUS_IN_TRANS) === 1);
              return conn.reset();
            })
            .then(() => {
              conn.end();
              if (
                (conn.info.isMariaDB() && conn.info.hasMinVersion(10, 2, 4)) ||
                (!conn.info.isMariaDB() && conn.info.hasMinVersion(5, 7, 3))
              ) {
                assert.isTrue((conn.info.status & ServerStatus.STATUS_IN_TRANS) === 0);
                conn.end();
                done();
              } else {
                done(new Error('must have thrown an error'));
              }
            })
            .catch((err) => {
              if (
                (conn.info.isMariaDB() && conn.info.hasMinVersion(10, 2, 4)) ||
                (!conn.info.isMariaDB() && conn.info.hasMinVersion(5, 7, 3))
              ) {
                done(err);
              } else {
                conn.end();
                done();
              }
            });
        });
      })
      .catch(done);
  });
});
