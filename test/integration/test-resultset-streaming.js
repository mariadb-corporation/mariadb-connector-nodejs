'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const { Writable } = require('stream');

describe('results-set streaming', () => {
  before(function (done) {
    this.timeout(10000);
    shareConn
      .query('CREATE TABLE testStreamResult (v int)')
      .then(() => {
        let sql = 'INSERT INTO testStreamResult VALUE (?)';
        const params = [0];
        for (let i = 1; i < 10000; i++) {
          sql += ',(?)';
          params.push(i);
        }
        return shareConn.query(sql, params);
      })
      .then(() => {
        done();
      })
      .catch(done);
  });

  after(function (done) {
    shareConn
      .query('DROP TABLE testStreamResult')
      .then(() => {
        done();
      })
      .catch(done);
  });

  it('Streaming result-set with promise implementation', function (done) {
    let currRow = 0;
    let metaReceived = false;
    shareConn
      .queryStream('SELECT * FROM testStreamResult')
      .on('error', (err) => {
        done(new Error('must not have thrown any error !'));
      })
      .on('fields', (meta) => {
        assert.equal(meta.length, 1);
        metaReceived = true;
      })
      .on('data', (row) => {
        assert.equal(currRow++, row.v);
      })
      .on('end', () => {
        assert.equal(10000, currRow);
        assert.isOk(metaReceived);
        done();
      });
  });

  it('Streaming result-set with callback implementation', function (done) {
    let currRow = 0;
    let metaReceived = false;
    const conn = base.createCallbackConnection();
    conn.connect((err) => {
      if (err) {
        done(err);
      } else {
        const query = conn.query('SELECT * FROM testStreamResult');
        query
          .on('error', (err) => {
            done(new Error('must not have thrown any error !'));
          })
          .on('fields', (meta) => {
            assert.equal(meta.length, 1);
            metaReceived = true;
          })
          .on('data', (row) => {
            assert.equal(currRow++, row.v);
          })
          .on('end', () => {
            assert.equal(10000, currRow);
            assert.isOk(metaReceived);
            conn.end();
            done();
          });
      }
    });
  });

  it('streaming with option rows as array', function (done) {
    let currRow = 0;
    let metaReceived = false;
    shareConn
      .queryStream({ rowsAsArray: true, sql: 'SELECT * FROM testStreamResult' })
      .on('error', (err) => {
        done(new Error('must not have thrown any error !'));
      })
      .on('fields', (meta) => {
        assert.equal(meta.length, 1);
        metaReceived = true;
      })
      .on('data', (row) => {
        assert(Array.isArray(row));
        assert.deepEqual(row, [currRow++]);
      })
      .on('end', () => {
        assert.equal(10000, currRow);
        assert.isOk(metaReceived);
        done();
      });
  });

  it('Streaming result-set pipe', function (done) {
    let currRow = 0;
    const writableStream = new Writable({
      objectMode: true,
      decodeStrings: false,
      write: (row, encoding, callback) => {
        assert.equal(currRow++, row.v);
        callback();
        if (process.versions.node.startsWith('6.') && currRow === 10000) {
          //final was implemented in v8
          done();
        }
      },
      writev: (rows, callback) => {
        for (let i = 0; i < rows.length; i++) {
          assert.equal(++currRow, row.v);
        }
        callback();
      },
      final: () => {
        assert.equal(10000, currRow);
        done();
      }
    });

    shareConn.queryStream('SELECT * FROM testStreamResult').pipe(writableStream);
  });

  it('Streaming error handling', function (done) {
    shareConn.queryStream('SELECT * FROM UnknownTable').on('error', (err) => {
      assert.equal(err.errno, 1146);
      assert.equal(err.sqlState, '42S02');
      assert.equal(err.code, 'ER_NO_SUCH_TABLE');
      done();
    });
  });
});
