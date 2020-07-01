'use strict';

const base = require('../base.js');
const { assert } = require('chai');

describe('sql template strings', () => {
  const value = "'`\\";
  it('query with parameters', (done) => {
    base
      .createConnection()
      .then((conn) => {
        conn.query('CREATE TEMPORARY TABLE parse(t varchar(128))');
        conn.query({ sql: 'INSERT INTO parse value (?)', values: [value] });
        conn
          .query({ sql: 'select * from parse where t = ?', values: [value] })
          .then((res) => {
            assert.strictEqual(res[0].t, value);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('batch with parameters', (done) => {
    base
      .createConnection()
      .then((conn) => {
        conn.query('CREATE TEMPORARY TABLE parse(t varchar(128))');
        conn.batch({ sql: 'INSERT INTO parse value (?)', values: [value] });
        conn
          .query({ sql: 'select * from parse where t = ?', values: [value] })
          .then((res) => {
            assert.strictEqual(res[0].t, value);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('callback query with parameters', (done) => {
    const conn = base.createCallbackConnection({});
    conn.connect((err) => {
      if (err) {
        done(err);
      } else {
        conn.query('CREATE TEMPORARY TABLE parse(t varchar(128))');
        conn.query({ sql: 'INSERT INTO parse value (?)', values: [value] });
        conn.query({ sql: 'select * from parse where t = ?', values: [value] }, (err, res) => {
          if (err) {
            done(err);
          } else {
            assert.strictEqual(res[0].t, value);
            conn.end();
            done();
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
        conn.query('CREATE TEMPORARY TABLE parse(t varchar(128))');
        conn.batch({ sql: 'INSERT INTO parse value (?)', values: [value] });
        conn.query({ sql: 'select * from parse where t = ?', values: [value] }, (err, res) => {
          if (err) {
            done(err);
          } else {
            assert.strictEqual(res[0].t, value);
            conn.end();
            done();
          }
        });
      }
    });
  });

  it('pool query with parameters', (done) => {
    const pool = base.createPool();
    pool
      .query('drop table IF EXISTS pool_parse')
      .catch((err) => {})
      .then(() => {
        return pool.query('CREATE TABLE pool_parse(t varchar(128))');
      })
      .then(() => {
        return pool.query({ sql: 'INSERT INTO pool_parse value (?)', values: [value] });
      })
      .then(() => {
        return pool.query({ sql: 'select * from pool_parse where t = ?', values: [value] });
      })
      .then((res) => {
        assert.strictEqual(res[0].t, value);
        return pool.query('drop table pool_parse');
      })
      .then(() => {
        pool.end();
        done();
      })
      .catch(done);
  });

  it('pool batch with parameters', (done) => {
    const pool = base.createPool();
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
        pool.end();
        done();
      })
      .catch(done);
  });

  it('pool callback query with parameters', (done) => {
    const pool = base.createPoolCallback();
    pool.query('drop table IF EXISTS pool_parse_call', (err, res) => {
      pool.query('CREATE TABLE pool_parse_call(t varchar(128))', (err, res) => {
        pool.query(
          { sql: 'INSERT INTO pool_parse_call value (?)', values: [value] },
          (err, res) => {
            pool.query(
              { sql: 'select * from pool_parse_call where t = ?', values: [value] },
              (err, res) => {
                if (err) {
                  done(err);
                } else {
                  assert.strictEqual(res[0].t, value);
                  pool.query('drop table pool_parse_call', () => {
                    pool.end();
                    done();
                  });
                }
              }
            );
          }
        );
      });
    });
  });

  it('pool callback batch with parameters', (done) => {
    const pool = base.createPoolCallback();
    pool.query('drop table pool_batch_call', (err) => {
      pool.query('CREATE TABLE pool_batch_call(t varchar(128))', (err, res) => {
        pool.batch(
          { sql: 'INSERT INTO pool_batch_call value (?)', values: [value] },
          (err, res) => {
            pool.query(
              { sql: 'select * from pool_batch_call where t = ?', values: [value] },
              (err, res) => {
                if (err) {
                  done(err);
                } else {
                  assert.strictEqual(res[0].t, value);
                  pool.query('drop table pool_batch_call', () => {
                    pool.end();
                    done();
                  });
                }
              }
            );
          }
        );
      });
    });
  });
});
