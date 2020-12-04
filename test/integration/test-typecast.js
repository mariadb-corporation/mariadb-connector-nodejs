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

  it('query level typecast function', function (done) {
    shareConn
      .query({
        sql: "SELECT 'blaBLA' as upper, 'blaBLA' as lower, 'blaBLA' as std, 1 as r",
        typeCast: changeCaseCast
      })
      .then((rows) => {
        assert.deepEqual(rows, [{ upper: 'BLABLA', lower: 'blabla', std: 'blaBLA', r: 1 }]);
        done();
      })
      .catch(done);
  });

  it('connection level typecast function', function (done) {
    base
      .createConnection({ typeCast: changeCaseCast })
      .then((conn) => {
        conn
          .query("SELECT 'blaBLA' as upper, 'blaBLA' as lower, 'blaBLA' as std, 1 as r")
          .then((rows) => {
            assert.deepEqual(rows, [{ upper: 'BLABLA', lower: 'blabla', std: 'blaBLA', r: 1 }]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('compatibility automatic cast', function (done) {
    base
      .createConnection({ typeCast: true })
      .then((conn) => {
        conn
          .query('SELECT 1 as r')
          .then((rows) => {
            assert.deepEqual(rows, [{ r: 1 }]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('connection level typecast function', function (done) {
    base
      .createConnection({ typeCast: changeCaseCast })
      .then((conn) => {
        conn
          .query("SELECT 'blaBLA' as upper, 'blaBLA' as lower, 'blaBLA' as std, 1 as r")
          .then((rows) => {
            assert.deepEqual(rows, [{ upper: 'BLABLA', lower: 'blabla', std: 'blaBLA', r: 1 }]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('cast fields', function (done) {
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
      .then((rows) => {
        assert.deepEqual(rows, [{ upper: 'blaBLA' }]);
        done();
      })
      .catch(done);
  });

  it('TINY(1) to boolean cast', async function () {
    const tinyToBoolean = (column, next) => {
      if (column.type == 'TINY' && column.columnLength === 1) {
        const val = column.int();
        return val === null ? null : val === 1;
      }
      return next();
    };
    const conn = await base.createConnection({ typeCast: tinyToBoolean });
    await conn.query('DROP TABLE IF EXISTS tinyToBool');
    await conn.query('CREATE TABLE tinyToBool(b1 TINYINT(1), b2 TINYINT(2))');
    await conn.beginTransaction();
    await conn.query('INSERT INTO tinyToBool VALUES (0,0), (1,1), (2,2), (null,null)');
    const rows = await conn.query('SELECT * from tinyToBool');
    assert.deepEqual(rows, [
      { b1: false, b2: 0 },
      { b1: true, b2: 1 },
      { b1: false, b2: 2 },
      { b1: null, b2: null }
    ]);
    conn.end();
  });

  it('long cast', async function () {
    const longCast = (column, next) => {
      if (column.type == 'TINY' && column.columnLength === 1) {
        return column.long();
      }
      if (column.type == 'VAR_STRING') {
        return column.decimal();
      }
      return next();
    };
    const conn = await base.createConnection({ typeCast: longCast });
    await conn.query('DROP TABLE IF EXISTS stupidCast');
    await conn.query('CREATE TABLE stupidCast(b1 TINYINT(1), b2 varchar(3))');
    await conn.beginTransaction();
    await conn.query(
      "INSERT INTO stupidCast VALUES (0,'0.1'), (1,'1.1')," + " (2,'2.2'), (null,null)"
    );
    const rows = await conn.query('SELECT * from stupidCast');
    assert.deepEqual(rows, [
      { b1: 0, b2: 0.1 },
      { b1: 1, b2: 1.1 },
      { b1: 2, b2: 2.2 },
      { b1: null, b2: null }
    ]);
    conn.end();
  });

  it('date cast', async function () {
    const longCast = (column, next) => {
      if (column.type == 'VAR_STRING') {
        let da = column.date();
        return da == null ? null : da.getMinutes();
      }
      return next();
    };
    const conn = await base.createConnection({ typeCast: longCast });
    await conn.query('DROP TABLE IF EXISTS stupidCast');
    await conn.query('CREATE TABLE stupidCast(b1 varchar(100))');
    await conn.beginTransaction();
    await conn.query(
      "INSERT INTO stupidCast VALUES ('1999-01-31" +
        " 12:13:14.000'), ('1999-01-31 12:16:15'), (null)"
    );
    const rows = await conn.query('SELECT * from stupidCast');
    assert.deepEqual(rows, [{ b1: 13 }, { b1: 16 }, { b1: null }]);
    conn.end();
  });

  it('geometry cast', async function () {
    const longCast = (column, next) => {
      if (column.type == 'BINARY') {
        return column.geometry();
      }
      return next();
    };
    const conn = await base.createConnection({ typeCast: longCast });
    await conn.query('DROP TABLE IF EXISTS stupidCast');
    await conn.query('CREATE TABLE stupidCast(b1 POINT)');
    await conn.query('INSERT INTO stupidCast VALUES (?), (?),(null)', [
      {
        type: 'Point',
        coordinates: [10, 10]
      },
      {
        type: 'Point',
        coordinates: [20, 10]
      }
    ]);
    const rows = await conn.query('SELECT * from stupidCast');
    assert.deepEqual(rows, [
      {
        b1: {
          type: 'Point',
          coordinates: [10, 10]
        }
      },
      {
        b1: {
          type: 'Point',
          coordinates: [20, 10]
        }
      },
      {
        b1:
          shareConn.info.isMariaDB() &&
          shareConn.info.hasMinVersion(10, 5, 2) &&
          !process.env.MAXSCALE_TEST_DISABLE
            ? { type: 'Point' }
            : null
      }
    ]);
    conn.end();
  });
});
