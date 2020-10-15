'use strict';

const base = require('../../base.js');
const { assert } = require('chai');
const Long = require('long');

describe('float', () => {
  before((done) => {
    shareConn
      .query('DROP TABLE IF EXISTS testBigfloat')
      .then(() => {
        return shareConn.query('CREATE TABLE testBigfloat (a FLOAT, b DOUBLE)');
      })
      .then(() => {
        done();
      })
      .catch(done);
  });

  it('float escape', function (done) {
    const buf = 19925.1;
    assert.equal(shareConn.escape(buf), '19925.1');

    shareConn
      .query(' SELECT ' + shareConn.escape(buf) + ' t')
      .then((rows) => {
        assert.deepEqual(rows, [{ t: buf }]);
        done();
      })
      .catch(done);
  });

  it('bigint format', (done) => {
    shareConn
      .query('TRUNCATE testBigfloat')
      .then(() => {
        return shareConn.query(
          'INSERT INTO testBigfloat values (-127.1, -128.2), (19925.0991, 900719925.4740991), (null, null)'
        );
      })
      .then((rows) => {
        return shareConn.query('SELECT * FROM testBigfloat');
      })
      .then((rows) => {
        assert.equal(rows.length, 3);
        assert.equal(rows[0].a, -127.1);
        assert.equal(rows[0].b, -128.2);
        assert.equal(rows[1].a, 19925.1);
        assert.equal(rows[1].b, 900719925.4740991);
        assert.equal(rows[2].a, null);
        assert.equal(rows[2].b, null);
        done();
      })
      .catch(done);
  });
});
