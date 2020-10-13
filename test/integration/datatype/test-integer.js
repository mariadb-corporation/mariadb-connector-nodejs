'use strict';

const base = require('../../base.js');
const { assert } = require('chai');
const Long = require('long');

describe('integer with big value', () => {
  before((done) => {
    shareConn
      .query('DROP TABLE IF EXISTS testBigint')
      .then(() => {
        return shareConn.query(
          'CREATE TABLE testBigint (v BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY)'
        );
      })
      .then(() => {
        done();
      })
      .catch(done);
  });

  it('int escape', function (done) {
    const buf = 19925;
    assert.equal(shareConn.escape(buf), '19925');
    const maxValue = Long.fromString('18446744073709551615', true);
    assert.equal(shareConn.escape(maxValue), '18446744073709551615');

    shareConn
      .query(' SELECT ' + shareConn.escape(buf) + ' t')
      .then((rows) => {
        assert.deepEqual(rows, [{ t: buf }]);
        done();
      })
      .catch(done);
  });

  it('decimal value without truncation', function (done) {
    shareConn
      .query('DROP TABLE IF EXISTS floatTest')
      .then(() => {
        return shareConn.query('CREATE TABLE floatTest (t DOUBLE, t2 DECIMAL(32,16))');
      })
      .then(() => {
        return shareConn.query(
          'INSERT INTO floatTest VALUES (-0.9999237060546875, 9999237060546875.9999237060546875)'
        );
      })
      .then(() => {
        shareConn.query(' SELECT * FROM floatTest').then((rows) => {
          assert.deepEqual(rows, [
            { t: -0.9999237060546875, t2: 9999237060546875.9999237060546875 }
          ]);
          done();
        });
      })
      .catch(done);
  });

  it('bigint format', (done) => {
    shareConn
      .query('INSERT INTO testBigint values (127), (128)')
      .then((rows) => {
        assert.strictEqual(rows.insertId, 128);
        return shareConn.query(
          'INSERT INTO testBigint values (-9007199254740991), (9007199254740991)'
        );
      })
      .then((rows) => {
        assert.strictEqual(rows.insertId, 9007199254740991);
        return shareConn.query('INSERT INTO testBigint values ()');
      })
      .then((rows) => {
        assert.strictEqual(rows.insertId, 9007199254740992);
        return shareConn.query('INSERT INTO testBigint values ()');
      })
      .then((rows) => {
        assert.strictEqual(rows.insertId, 9007199254740993);
        return shareConn.query('SELECT * FROM testBigint');
      })
      .then((rows) => {
        assert.strictEqual(rows.length, 6);
        assert.strictEqual(rows[0].v, -9007199254740991);
        assert.strictEqual(rows[1].v, 127);
        assert.strictEqual(rows[2].v, 128);
        assert.strictEqual(rows[3].v, 9007199254740991);
        assert.strictEqual(rows[4].v, 9007199254740992);
        assert.strictEqual(rows[4].v, 9007199254740993);
        assert.strictEqual(typeof rows[3].v, 'number');
        return shareConn.query({
          supportBigNumbers: true,
          sql: 'SELECT * FROM testBigint'
        });
      })
      .then((rows) => {
        assert.strictEqual(rows.length, 6);
        assert.strictEqual(rows[0].v, -9007199254740991);
        assert.strictEqual(rows[1].v, 127);
        assert.strictEqual(rows[2].v, 128);
        assert.strictEqual(rows[3].v, 9007199254740991);
        assert.strictEqual(typeof rows[4].v, 'object');
        assert.strictEqual(rows[4].v.toString(), '9007199254740992');
        assert.strictEqual(rows[5].v.toString(), '9007199254740993');
        return shareConn.query({
          bigNumberStrings: true,
          sql: 'SELECT * FROM testBigint'
        });
      })
      .then((rows) => {
        assert.strictEqual(rows.length, 6);
        assert.strictEqual(rows[0].v, -9007199254740991);
        assert.strictEqual(rows[1].v, 127);
        assert.strictEqual(rows[2].v, 128);
        assert.strictEqual(rows[3].v, 9007199254740991);
        assert.strictEqual(rows[4].v, '9007199254740992');
        assert.strictEqual(rows[5].v, '9007199254740993');
        assert.strictEqual(typeof rows[4].v, 'string');
        return shareConn.query({
          supportBigInt: true,
          sql: 'SELECT * FROM testBigint'
        });
      })
      .then((rows) => {
        assert.strictEqual(rows.length, 6);
        assert.strictEqual(rows[0].v, -9007199254740991n);
        assert.strictEqual(rows[1].v, 127n);
        assert.strictEqual(rows[2].v, 128n);
        assert.strictEqual(rows[3].v, 9007199254740991n);
        assert.strictEqual(rows[4].v, 9007199254740992n);
        assert.strictEqual(rows[5].v, 9007199254740993n);
        assert.strictEqual(typeof rows[4].v, 'bigint');
        return base.createConnection({ supportBigInt: true });
      })
      .then((conn2) => {
        conn2
          .query('INSERT INTO testBigint values ()')
          .then((rows) => {
            assert.strictEqual(rows.insertId, 9007199254740994n);
            conn2.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('bigint format null ', (done) => {
    shareConn
      .query('DROP TABLE IF EXISTS testBigintNull')
      .then(() => {
        return shareConn.query('CREATE TABLE testBigintNull (v BIGINT)');
      })
      .then(() => {
        return shareConn.query('INSERT INTO testBigintNull values (127), (null)');
      })
      .then(() => {
        return shareConn.query('SELECT * FROM testBigintNull');
      })
      .then((rows) => {
        assert.strictEqual(rows.length, 2);
        assert.strictEqual(rows[0].v, 127);
        assert.strictEqual(rows[1].v, null);
        return shareConn.query({ supportBigNumbers: true, sql: 'SELECT * FROM testBigintNull' });
      })
      .then((rows) => {
        assert.strictEqual(rows.length, 2);
        assert.strictEqual(rows[0].v, 127);
        assert.strictEqual(rows[1].v, null);
        return shareConn.query({ bigNumberStrings: true, sql: 'SELECT * FROM testBigintNull' });
      })
      .then((rows) => {
        assert.strictEqual(rows.length, 2);
        assert.strictEqual(rows[0].v, 127);
        assert.strictEqual(rows[1].v, null);
        return shareConn.query({ supportBigInt: true, sql: 'SELECT * FROM testBigintNull' });
      })
      .then((rows) => {
        assert.strictEqual(rows.length, 2);
        assert.strictEqual(rows[0].v, 127n);
        assert.strictEqual(rows[1].v, null);
        done();
      });
  });

  it('numeric fields conversion to int', (done) => {
    shareConn
      .query('DROP TABLE IF EXISTS intAllField')
      .then(() => {
        return shareConn.query(
          'CREATE TABLE intAllField (' +
            't1 TINYINT(1), t2 SMALLINT(1), t3 MEDIUMINT(1), t4 INT(1), t5 BIGINT(1), t6 DECIMAL(1), t7 FLOAT, t8 DOUBLE)'
        );
      })
      .then(() => {
        return shareConn.query(
          'INSERT INTO intAllField VALUES (null, null, null, null, null, null, null, null)'
        );
      })
      .then(() => {
        return shareConn.query('INSERT INTO intAllField VALUES (0, 0, 0, 0, 0, 0, 0, 0)');
      })
      .then(() => {
        return shareConn.query('INSERT INTO intAllField VALUES (1, 1, 1, 1, 1, 1, 1, 1)');
      })
      .then(() => {
        return shareConn.query('INSERT INTO intAllField VALUES (2, 2, 2, 2, 2, 2, 2, 2)');
      })
      .then(() => {
        return shareConn.query('SELECT * FROM intAllField');
      })
      .then((res) => {
        assert.deepEqual(res, [
          {
            t1: null,
            t2: null,
            t3: null,
            t4: null,
            t5: null,
            t6: null,
            t7: null,
            t8: null
          },
          { t1: 0, t2: 0, t3: 0, t4: 0, t5: 0, t6: 0, t7: 0, t8: 0 },
          { t1: 1, t2: 1, t3: 1, t4: 1, t5: 1, t6: 1, t7: 1, t8: 1 },
          { t1: 2, t2: 2, t3: 2, t4: 2, t5: 2, t6: 2, t7: 2, t8: 2 }
        ]);
        done();
      })
      .catch(done);
  });

  it('using very big number', function (done) {
    const maxValue = Long.fromString('18446744073709551615', true);
    base.createConnection({ supportBigNumbers: true }).then((conn) => {
      conn
        .query('DROP TABLE IF EXISTS BIG_NUMBER')
        .then(() => {
          return conn.query('CREATE TABLE BIG_NUMBER (val BIGINT unsigned)');
        })
        .then(() => {
          return conn.query('INSERT INTO BIG_NUMBER values (?), (?)', [10, maxValue]);
        })
        .then(() => {
          return conn.query('SELECT * FROM BIG_NUMBER LIMIT ?', [maxValue]);
        })
        .then((res) => {
          assert.deepEqual(res, [{ val: 10 }, { val: maxValue }]);
          conn.end();
          done();
        })
        .catch(done);
    });
  });

  it('using very big number bigint', function (done) {
    const maxValue = 18446744073709551615n;
    base.createConnection({ supportBigInt: true }).then((conn) => {
      conn
        .query('DROP TABLE IF EXISTS BIG_NUMBER')
        .then(() => {
          return conn.query('CREATE TABLE BIG_NUMBER (val BIGINT unsigned)');
        })
        .then(() => {
          return conn.query('INSERT INTO BIG_NUMBER values (?), (?)', [10, maxValue]);
        })
        .then(() => {
          return conn.query('SELECT * FROM BIG_NUMBER LIMIT ?', [maxValue]);
        })
        .then((res) => {
          assert.deepEqual(res, [{ val: 10n }, { val: maxValue }]);
          conn.end();
          done();
        })
        .catch(done);
    });
  });
});
