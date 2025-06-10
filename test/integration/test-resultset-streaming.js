//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const { Writable } = require('stream');
const Proxy = require('../tools/proxy');
const Conf = require('../conf');

describe('results-set streaming', () => {
  before(async function () {
    await shareConn.query('DROP TABLE IF EXISTS testStreamResult');
    await shareConn.query('CREATE TABLE testStreamResult (v int)');
    let sql = 'INSERT INTO testStreamResult VALUE (?)';
    const params = [0];
    for (let i = 1; i < 10000; i++) {
      sql += ',(?)';
      params.push(i);
    }
    await shareConn.query(sql, params);
  });

  after(async function () {
    await shareConn.query('DROP TABLE IF EXISTS testStreamResult');
  });

  it('Streaming result-set for-await-of', async function () {
    let currRow = 0;
    const stream = shareConn.queryStream('SELECT * FROM testStreamResult');
    for await (const row of stream) {
      assert.equal(currRow++, row.v);
    }
    assert.equal(10000, currRow);
  });

  it('Streaming Error', function (done) {
    const stream = shareConn.queryStream('wrong');
    stream.on('error', (error) => {
      done();
    });
  });

  it('Streaming result-set for-await-of callback', async function () {
    let currRow = 0;
    const conn = base.createCallbackConnection();
    conn.connect(async (err) => {
      const cmd = conn.query('SELECT * FROM testStreamResult');
      const stream = cmd.stream();
      for await (const row of stream) {
        assert.equal(currRow++, row.v);
      }
      assert.equal(10000, currRow);
      conn.end();
    });
  });

  it('Streaming execute result-set for-await-of', async function () {
    let currRow = 0;
    const prepare = await shareConn.prepare('SELECT * FROM testStreamResult');
    const stream = prepare.executeStream();
    for await (const row of stream) {
      assert.equal(currRow++, row.v);
    }
    assert.equal(10000, currRow);
    prepare.close();
  });

  it('Streaming result-set close', function (done) {
    let currRow = 0;
    let metaReceived = false;
    const stream = shareConn.queryStream('SELECT * FROM testStreamResult');
    stream
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
        assert.equal(0, currRow);
        assert.isOk(metaReceived);
        done();
      });
    stream.close();
  });

  it('execute Streaming result-set close', function (done) {
    let currRow = 0;
    let metaReceived = false;
    shareConn.prepare('SELECT * FROM testStreamResult').then((prepare) => {
      const stream = prepare.executeStream();
      stream
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
          assert.equal(0, currRow);
          assert.isOk(metaReceived);
          done();
        });
      stream.close();
    });
  });

  it('Streaming result-set close callback', function (done) {
    let currRow = 0;
    let metaReceived = false;
    const conn = base.createCallbackConnection();
    conn.connect(async (err) => {
      const stream = conn.query('SELECT * FROM testStreamResult').stream();
      stream
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
          assert.equal(0, currRow);
          assert.isOk(metaReceived);
          conn.end();
          done();
        });
      stream.close();
    });
  });

  it('Streaming result-set callback', function (done) {
    let currRow = 0;
    let metaReceived = false;
    const conn = base.createCallbackConnection();
    conn.connect(async (err) => {
      const stream = conn.query('SELECT * FROM testStreamResult').stream();
      stream
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
    });
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

  it('Streaming error', function (done) {
    shareConn.queryStream('wrong query').on('error', (err) => {
      assert.isTrue(err.message.includes('You have an error in your SQL syntax'));
      assert.equal(err.sqlState, 42000);
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

  it('Streaming callback execute result-set for-await-of', function (done) {
    let currRow = 0;
    let metaReceived = false;
    const conn = base.createCallbackConnection();
    conn.prepare('SELECT * FROM testStreamResult', (err, prepare) => {
      const stream = prepare.executeStream();
      stream
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
          prepare.close();
          conn.end();
          done();
        });
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

  it('Streaming result-set callback pipe', function (done) {
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
        conn.end();
        done();
      }
    });
    const conn = base.createCallbackConnection();
    conn.query('SELECT * FROM testStreamResult').stream({ highWaterMark: 10 }).pipe(writableStream);
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
