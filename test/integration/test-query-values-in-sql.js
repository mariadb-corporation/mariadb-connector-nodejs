//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const { isMaxscale } = require('../base');

describe('sql template strings', () => {
  const value = "'`\\";

  it('query with parameters', async () => {
    const conn = await base.createConnection();
    await conn.query('DROP TABLE IF EXISTS query_with_parameter');
    await conn.query('CREATE TABLE query_with_parameter(t varchar(128))');
    await conn.beginTransaction();
    await conn.query({
      sql: 'INSERT INTO query_with_parameter value (?)',
      values: [value]
    });
    const res = await conn.query({
      sql: 'select * from query_with_parameter where t = ?',
      values: [value]
    });
    assert.strictEqual(res[0].t, value);
    await conn.end();
  });

  it('batch with parameters', async () => {
    const conn = await base.createConnection();
    await conn.query('DROP TABLE IF EXISTS batch_with_parameters');
    await conn.query('CREATE TABLE batch_with_parameters(t varchar(128))');
    await conn.beginTransaction();
    await conn.batch({
      sql: 'INSERT INTO batch_with_parameters value (?)',
      values: [value]
    });
    const res = await conn.query({
      sql: 'select * from batch_with_parameters where t = ?',
      values: [value]
    });
    assert.strictEqual(res[0].t, value);
    await conn.end();
  });

  it('callback query with parameters', (done) => {
    const conn = base.createCallbackConnection({});
    conn.connect((err) => {
      if (err) {
        done(err);
      } else {
        conn.query('DROP TABLE IF EXISTS callback_with_parameters', (err) => {
          if (err) {
            conn.end();
            done(err);
          } else {
            conn.query('CREATE TABLE callback_with_parameters(t varchar(128))', (err) => {
              if (err) {
                conn.end();
                done(err);
              } else {
                conn.beginTransaction(() => {
                  conn.query({ sql: 'INSERT INTO callback_with_parameters value (?)', values: [value] }, (err) => {
                    if (err) {
                      conn.end();
                      done(err);
                    } else {
                      conn.query(
                        {
                          sql: 'select * from callback_with_parameters where t = ?',
                          values: [value]
                        },
                        (err, res) => {
                          if (err) {
                            conn.end(() => {
                              done(err);
                            });
                          } else {
                            assert.strictEqual(res[0].t, value);
                            conn.end(() => {
                              done();
                            });
                          }
                        }
                      );
                    }
                  });
                });
              }
            });
          }
        });
      }
    });
  });

  it('callback batch with parameters', (done) => {
    const conn = base.createCallbackConnection({});
    conn.connect((err) => {
      if (err) {
        done(err);
      } else {
        conn.query('DROP TABLE IF EXISTS callback_batch_with_parameters', (err) => {
          if (err) {
            conn.end();
            done(err);
          } else {
            conn.query('CREATE TABLE callback_batch_with_parameters(t varchar(128))', (err) => {
              if (err) {
                conn.end();
                done(err);
              } else {
                conn.beginTransaction(() => {
                  conn.batch(
                    {
                      sql: 'INSERT INTO callback_batch_with_parameters value (?)',
                      values: [value]
                    },
                    (err) => {
                      if (err) {
                        conn.end();
                        done(err);
                      } else {
                        conn.query(
                          {
                            sql: 'select * from callback_batch_with_parameters where t = ?',
                            values: [value]
                          },
                          (err, res) => {
                            if (err) {
                              conn.end(() => {
                                done(err);
                              });
                            } else {
                              assert.strictEqual(res[0].t, value);
                              conn.end(() => {
                                done();
                              });
                            }
                          }
                        );
                      }
                    }
                  );
                });
              }
            });
          }
        });
      }
    });
  });

  it('pool query with parameters', async function () {
    if (isMaxscale()) this.skip();
    const pool = base.createPool();
    try {
      await pool.query('drop table IF EXISTS pool_query_param');
    } catch (error) {
      // ignore
    }
    await pool.query('CREATE TABLE pool_query_param(t varchar(128))');
    await pool.query({ sql: 'INSERT INTO pool_query_param value (?)', values: [value] });
    const res = await pool.query({ sql: 'select * from pool_query_param where t = ?', values: [value] });

    assert.strictEqual(res[0].t, value);
    await pool.query('drop table pool_query_param');
    await pool.end();
  });

  it('pool batch with parameters', function (done) {
    if (isMaxscale()) this.skip();
    let params = {};
    const pool = base.createPool(params);
    pool
      .query('DROP TABLE IF EXISTS pool_parse_batch')
      .then(() => {
        return pool.query('CREATE TABLE pool_parse_batch(t varchar(128))');
      })
      .then(() => {
        return pool.batch({ sql: 'INSERT INTO pool_parse_batch value (?)', values: [value] });
      })
      .then(() => {
        return pool.query({ sql: 'select * from pool_parse_batch where t = ?', values: [value] });
      })
      .then((res) => {
        assert.strictEqual(res[0].t, value);
        return pool.query('drop table pool_parse_batch');
      })
      .then(() => {
        return pool.end();
      })
      .then(() => {
        done();
      })
      .catch(done);
  });

  it('pool callback query with parameters', function (done) {
    if (isMaxscale()) this.skip();
    const pool = base.createPoolCallback();
    pool.query('drop table IF EXISTS pool_parse_call', (err, res) => {
      pool.query('CREATE TABLE pool_parse_call(t varchar(128))', (err, res) => {
        pool.query({ sql: 'INSERT INTO pool_parse_call value (?)', values: [value] }, (err, res) => {
          setTimeout(() => {
            pool.query({ sql: 'select * from pool_parse_call where t = ?', values: [value] }, (err, res) => {
              if (err) {
                pool.end();
                done(err);
              } else {
                assert.strictEqual(res[0].t, value);
                pool.query('drop table pool_parse_call', () => {
                  pool.end();
                  done();
                });
              }
            });
          }, 1000);
        });
      });
    });
  });

  it('pool callback batch with parameters', function (done) {
    if (isMaxscale()) this.skip();
    let params = {};
    const pool = base.createPoolCallback(params);
    pool.query('drop table pool_batch_call', (err) => {
      pool.query('CREATE TABLE pool_batch_call(t varchar(128))', (err, res) => {
        pool.batch({ sql: 'INSERT INTO pool_batch_call value (?)', values: [value] }, (err, res) => {
          setTimeout(() => {
            pool.query({ sql: 'select * from pool_batch_call where t = ?', values: [value] }, (err, res) => {
              if (err) {
                done(err);
              } else {
                assert.strictEqual(res[0].t, value);
                pool.query('drop table pool_batch_call', () => {
                  pool.end();
                  done();
                });
              }
            });
          }, 1000);
        });
      });
    });
  });
});
