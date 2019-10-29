'use strict';

const base = require('../base.js');
const { assert } = require('chai');

describe('TypeCast', () => {
  const changeCaseCast = (column, next) => {
    if (column.type == 'VAR_STRING') {
      const val = column.string();
      if (column.name().startsWith('upp')) return val.toUpperCase();
      if (column.name().startsWith('low')) return val.toLowerCase();
      return val;
    }
    return next();
  };

  it('query level typecast function', function(done) {
    shareConn
      .query({
        sql: "SELECT 'blaBLA' as upper, 'blaBLA' as lower, 'blaBLA' as std, 1 as r",
        typeCast: changeCaseCast
      })
      .then(rows => {
        assert.deepEqual(rows, [{ upper: 'BLABLA', lower: 'blabla', std: 'blaBLA', r: 1 }]);
        done();
      })
      .catch(done);
  });

  it('connection level typecast function', function(done) {
    base
      .createConnection({ typeCast: changeCaseCast })
      .then(conn => {
        conn
          .query("SELECT 'blaBLA' as upper, 'blaBLA' as lower, 'blaBLA' as std, 1 as r")
          .then(rows => {
            assert.deepEqual(rows, [{ upper: 'BLABLA', lower: 'blabla', std: 'blaBLA', r: 1 }]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('compatibility automatic cast', function(done) {
    base
      .createConnection({ typeCast: true })
      .then(conn => {
        conn
          .query('SELECT 1 as r')
          .then(rows => {
            assert.deepEqual(rows, [{ r: 1 }]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('connection level typecast function', function(done) {
    base
      .createConnection({ typeCast: changeCaseCast })
      .then(conn => {
        conn
          .query("SELECT 'blaBLA' as upper, 'blaBLA' as lower, 'blaBLA' as std, 1 as r")
          .then(rows => {
            assert.deepEqual(rows, [{ upper: 'BLABLA', lower: 'blabla', std: 'blaBLA', r: 1 }]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('cast fields', function(done) {
    const checkCaseType = (field, next) => {
      assert.equal(field.type, 'VAR_STRING');
      assert.equal(field.columnLength, base.utf8Collation() ? 24 : 6);
      return next();
    };
    shareConn
      .query({
        sql: "SELECT 'blaBLA' as upper",
        typeCast: checkCaseType
      })
      .then(rows => {
        assert.deepEqual(rows, [{ upper: 'blaBLA' }]);
        done();
      })
      .catch(done);
  });

  it('TINY(1) to boolean cast', function(done) {
    const tinyToBoolean = (column, next) => {
      if (column.type == 'TINY' && column.columnLength === 1) {
        const val = column.int();
        return val === null ? null : val === 1;
      }
      return next();
    };
    base
      .createConnection({ typeCast: tinyToBoolean })
      .then(conn => {
        conn
          .query('CREATE TEMPORARY TABLE tinyToBool(b1 TINYINT(1), b2 TINYINT(2))')
          .then(() => {
            return conn.query('INSERT INTO tinyToBool VALUES (0,0), (1,1), (2,2), (null,null)');
          })
          .then(() => {
            return conn.query('SELECT * from tinyToBool');
          })
          .then(rows => {
            assert.deepEqual(rows, [
              { b1: false, b2: 0 },
              { b1: true, b2: 1 },
              { b1: false, b2: 2 },
              { b1: null, b2: null }
            ]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });
});
