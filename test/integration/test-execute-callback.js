//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2023 MariaDB Corporation Ab

'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isXpand } = require('../base');

describe('prepare and execute callback', () => {
  let bigVal;
  let maxAllowedSize;

  before(async function () {
    const row = await shareConn.query('SELECT @@max_allowed_packet as t');
    maxAllowedSize = Number(row[0].t);
    await shareConn.query('DROP TABLE IF EXISTS big_test_table');
    await shareConn.query('DROP TABLE IF EXISTS big_test_table2');
    await shareConn.query('CREATE TABLE big_test_table (a LONGTEXT, b BIGINT)');
    await shareConn.query('CREATE TABLE big_test_table2 (a LONGTEXT, b LONGTEXT)');
    await shareConn.query('FLUSH TABLES');
    let bigBuf = Buffer.alloc(16 * 1024 * 1024 - 22);
    for (let i = 0; i < bigBuf.length; i++) {
      bigBuf[i] = 97 + (i % 10);
    }
    bigVal = bigBuf.toString();
  });

  beforeEach(async function () {
    await shareConn.query('TRUNCATE big_test_table');
    await shareConn.query('TRUNCATE big_test_table2');
  });

  after(async function () {
    await shareConn.query('DROP TABLE IF EXISTS big_test_table');
    await shareConn.query('DROP TABLE IF EXISTS big_test_table2');
  });

  it('prepare error', (done) => {
    const conn = base.createCallbackConnection({ prepareCacheLength: 0 });
    conn.connect((err) => {
      if (err) return done(err);
      conn.prepare('wrong query', (err, prepare) => {
        if (!err) return done(new Error('Expect error'));
        if (!isXpand()) {
          assert.isTrue(err.message.includes('You have an error in your SQL syntax'));
          assert.isTrue(err.message.includes('sql: wrong query'));
          assert.equal(err.sqlState, 42000);
        }
        assert.equal(err.errno, 1064);
        assert.equal(err.code, 'ER_PARSE_ERROR');
        conn.end();
        done();
      });
    });
  });

  it('execute callback stack trace', function (done) {
    if (process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    const conn = base.createCallbackConnection({ trace: true });
    conn.connect((err) => {
      conn.execute('wrong query', (err) => {
        if (!err) {
          done(Error('must have thrown error !'));
        } else {
          assert.isTrue(err.stack.includes('test-execute-callback.js:'), err.stack);
          conn.end();
          done();
        }
      });
    });
  });

  it('execute callback wrong param stack trace', function (done) {
    if (process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    const conn = base.createCallbackConnection({ trace: true });
    conn.connect((err) => {
      conn.execute('SELECT ?', [], (err) => {
        if (!err) {
          done(Error('must have thrown error !'));
        } else {
          assert.isTrue(err.stack.includes('test-execute-callback.js:'), err.stack);
          conn.end();
          done();
        }
      });
    });
  });

  it('prepare close, no cache', (done) => {
    const conn = base.createCallbackConnection({ prepareCacheLength: 0 });
    conn.connect((err) => {
      if (err) return done(err);
      conn.prepare('select ?', (err, prepare) => {
        if (err) return done(err);
        assert.equal(prepare.parameterCount, 1);
        assert.equal(prepare.columns.length, 1);
        prepare.close();
        conn.end();
        done();
      });
    });
  });

  it('prepare close with cache', (done) => {
    const conn = base.createCallbackConnection({ prepareCacheLength: 2 });
    conn.connect((err) => {
      if (err) return done(err);
      for (let i = 0; i < 10; i++) {
        conn.prepare('select ' + i + ',?', (err, prepare) => {
          if (err) {
            console.log(err);
            return done(err);
          }
          assert.equal(prepare.parameterCount, 1);
          assert.equal(prepare.columns.length, 2);
          prepare.close();
          if (i === 9) {
            conn.end();
            done();
          }
        });
      }
    });
  });

  it('prepare after prepare close - no cache', (done) => {
    const conn = base.createCallbackConnection({ prepareCacheLength: 0 });
    conn.connect((err) => {
      if (err) return done(err);
      conn.prepare('select ?', (err, prepare) => {
        prepare.execute('1', (res) => {
          prepare.close();
          prepare.execute('1', (err, res) => {
            if (!err) {
              done(new Error('must have thrown error'));
            } else {
              assert.isTrue(err.message.includes('Execute fails, prepare command as already been closed'));
              conn.prepare('select ?', (err, prepare2) => {
                if (err) {
                  done(err);
                } else {
                  prepare2.execute('1', (res) => {
                    prepare2.close();
                    conn.end();
                    done();
                  });
                }
              });
            }
          });
        });
      });
    });
  });

  it('prepare after prepare close - with cache', (done) => {
    const conn = base.createCallbackConnection({ prepareCacheLength: 2 });
    conn.connect((err) => {
      if (err) return done(err);
      conn.prepare('select ?', (err, prepare) => {
        prepare.execute('1', (res) => {
          prepare.close();
          prepare.execute('1', (err, res) => {
            if (err) {
              assert.isTrue(err.message.includes('Execute fails, prepare command as already been closed'));
            } else {
              done(new Error('expect to have thrown an error'));
            }
            //remove from cache
            conn.execute('select 1, ?', ['2']);
            conn.execute('select 2, ?', ['2']);
            conn.execute('select 3, ?', ['2']);
            conn.execute('select 4, ?', ['2'], (err, res) => {
              //removed from cache, must really be closed
              prepare.execute('1', (err, res) => {
                if (!err) {
                  done(new Error('must have thrown error'));
                } else {
                  assert.isTrue(err.message.includes('Execute fails, prepare command as already been closed'));
                  conn.prepare('select ?', (err, prepare2) => {
                    if (err) {
                      done(err);
                    } else {
                      prepare2.execute('1', (res) => {
                        prepare2.close();
                        conn.end();
                        done();
                      });
                    }
                  });
                }
              });
            });
          });
        });
      });
    });
  });

  it('prepare cache reuse', (done) => {
    const conn = base.createCallbackConnection({ prepareCacheLength: 2 });
    conn.connect((err) => {
      if (err) return done(err);
      conn.prepare('select ?', (err, prepare) => {
        if (err) return done(err);
        const initialPrepareId = prepare.id;

        prepare.close();
        conn.prepare('select ? + 1', (err, prepare2) => {
          if (err) return done(err);
          conn.prepare('select ? + 2', (err, prepare3) => {
            if (err) return done(err);
            conn.prepare('select ? + 3', (err, prepare4) => {
              if (err) return done(err);
              conn.prepare({ sql: 'select ? + 4' }, (err, prepare5) => {
                if (err) return done(err);
                conn.prepare('select ?', (err, prepare) => {
                  if (err) return done(err);
                  assert.notEqual(prepare.id, initialPrepareId);
                  const secondPrepareId = prepare.id;
                  for (let i = 0; i < 10; i++) {
                    conn.prepare('select ?', (err, prepare2) => {
                      if (err) return done(err);
                      assert.equal(prepare2.id, secondPrepareId);
                      prepare2.close();
                      if (i == 9) {
                        conn.reset((err) => {
                          conn.end();
                          done();
                        });
                      }
                    });
                  }
                });
              });
            });
          });
        });
      });
    });
  });

  it('basic prepare and execute', function (done) {
    this.timeout(5000);
    const conn = base.createCallbackConnection({ prepareCacheLength: 0 });
    conn.connect((err) => {
      if (err) return done(err);

      conn.prepare('select ? as a', (err, prepare) => {
        if (err) return done(err);
        assert.equal(prepare.parameterCount, 1);
        assert.equal(prepare.columns.length, 1);
        prepare.execute([2], (err, res) => {
          if (err) return done(err);
          assert.isTrue(res[0].a === 2 || res[0].a === 2n);
          prepare.execute([3], (err, res) => {
            if (err) return done(err);
            assert.isTrue(res[0].a === 3 || res[0].a === 3n);
            if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(8, 0, 0)) {
              prepare.execute(['a'], (err, res) => {
                if (err) return done(err);
                assert.isTrue(res[0].a === 'a');
                prepare.close();
                conn.end();
                done();
              });
            } else {
              prepare.close();
              conn.end();
              done();
            }
          });
        });
      });
    });
  });

  it('direct execution without cache', (done) => {
    const conn = base.createCallbackConnection({ prepareCacheLength: 0 });
    conn.connect((err) => {
      if (err) return done(err);
      conn.execute('select ? as a', [2], (err, res, meta) => {
        if (err) return done(err);
        assert.isTrue(res[0].a === 2 || res[0].a === 2n);
        assert.isTrue(meta.length === 1);
        conn.execute({ sql: 'select ? as a', bigIntAsNumber: true }, [3], (err, res, meta) => {
          if (err) return done(err);
          assert.isTrue(res[0].a === 3);
          conn.execute('select ? as a', ['a'], (err, res, meta) => {
            if (err) return done(err);
            if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(8, 0, 0)) {
              assert.isTrue(res[0].a === 'a');
            }
            conn.execute({ sql: 'select 4 as a', bigIntAsNumber: true }, (err, res, meta) => {
              if (err) return done(err);
              assert.isTrue(res[0].a === 4);

              conn.end();
              done();
            });
          });
        });
      });
    });
  });

  it('execution with namedPlaceholders', (done) => {
    const conn = base.createCallbackConnection({ namedPlaceholders: true });
    conn.connect((err) => {
      if (err) return done(err);
      conn.execute('select :param2 as a, :param1 as b', { param1: 2, param2: 3 }, (err, res, meta) => {
        if (err) return done(err);
        assert.isTrue(res[0].a === 3 || res[0].a === 3n);
        assert.isTrue(res[0].b === 2 || res[0].b === 2n);
        conn.execute('select :param2 as a, :param1 as b', { param1: 2, param3: 3 }, (err, res, meta) => {
          if (err) {
            assert.isTrue(err.message.includes('Parameter named param2 is not set'));
            done();
            conn.end();
            return;
          }
          done(new Error('must have throw error'));
          conn.end();
        });
      });
    });
  });

  it('close alias', function (done) {
    this.timeout(5000);
    const conn = base.createCallbackConnection({ prepareCacheLength: 0 });
    conn.connect((err) => {
      if (err) return done(err);
      conn.close();
      done();
    });
  });
});
