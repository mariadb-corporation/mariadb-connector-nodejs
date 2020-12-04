'use strict';

const base = require('../../base');
const { assert } = require('chai');
const Conf = require('../../conf');

describe('datetime', () => {
  const date = new Date('2001-12-31 00:00:00');
  const date2 = new Date('2001-12-31 23:59:58.123');
  const date3 = new Date('2001-12-31 23:59:59.123456');

  after((done) => {
    shareConn
      .query('DROP TABLE IF EXISTS table_date')
      .then((row) => {
        done();
      })
      .catch(done);
  });

  before((done) => {
    //MySQL 5.5 doesn't permit datetime(6)
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6)) {
      done();
    } else {
      shareConn.query('CREATE TABLE table_date (t0 DATE, t1 DATETIME(3), t2 DATETIME(6))');
      shareConn.query('INSERT INTO table_date VALUES (?, ?, ?)', [date, date2, date3]);
      shareConn.query('INSERT INTO table_date VALUES (?, ?, ?)', [null, null, null]).then(() => {
        if (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(5, 7)) {
          done();
        } else {
          shareConn
            .query(
              'INSERT INTO table_date VALUES (?, ?, ?)',
              ['0000-00-00', '0000-00-00 00:00:00', '0000-00-00 00:00:00'],
              () => done()
            )
            .then(() => done());
        }
      });
    }
  });

  it('date escape', function (done) {
    const val = '1999-01-31 12:13:14.000';
    const buf = new Date('1999-01-31 12:13:14.000');
    assert.equal(shareConn.escape(buf), "'1999-01-31 12:13:14.000'");

    shareConn
      .query(' SELECT ' + shareConn.escape(buf) + ' t')
      .then((rows) => {
        assert.deepEqual(rows, [{ t: val }]);
        done();
      })
      .catch(done);
  });

  it('standard date', function (done) {
    //using distant server, time might be different
    if (
      (Conf.baseConfig.host !== 'localhost' && Conf.baseConfig.host !== 'mariadb.example.com') ||
      process.env.MAXSCALE_TEST_DISABLE
    )
      this.skip();

    shareConn
      .query('SELECT UNIX_TIMESTAMP(?) tt', [new Date('2000-01-01 UTC')])
      .then((res) => {
        assert.deepEqual(res[0].tt, 946684800);
        done();
      })
      .catch(done);
  });

  it('date text', function (done) {
    const date = new Date('1999-01-31 12:13:14');
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6)) this.skip();
    shareConn
      .query('select CAST(? as datetime) d', [date])
      .then((res) => {
        assert.equal(Object.prototype.toString.call(res[0].d), '[object Date]');
        assert.equal(res[0].d.getDate(), date.getDate());
        assert.equal(res[0].d.getHours(), date.getHours());
        assert.equal(res[0].d.getMinutes(), date.getMinutes());
        assert.equal(res[0].d.getSeconds(), date.getSeconds());
        done();
      })
      .catch(done);
  });

  it('date text Z timezone', function (done) {
    const date = new Date('1999-01-31 12:13:14');
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6)) this.skip();
    base
      .createConnection({ timezone: 'Z' })
      .then((conn) => {
        conn
          .query({ sql: 'select CAST(? as datetime) d' }, [date])
          .then((res) => {
            assert.equal(Object.prototype.toString.call(res[0].d), '[object Date]');
            assert.equal(res[0].d.getDate(), date.getDate());
            assert.equal(res[0].d.getHours(), date.getHours());
            assert.equal(res[0].d.getMinutes(), date.getMinutes());
            assert.equal(res[0].d.getSeconds(), date.getSeconds());
            conn.close();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('date text America/New_York timezone', function (done) {
    const date = new Date('1999-01-31 12:13:14');
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6)) this.skip();
    base
      .createConnection({ timezone: 'America/New_York' })
      .then((conn) => {
        conn
          .query({ sql: 'select CAST(? as datetime) d' }, [date])
          .then((res) => {
            assert.equal(Object.prototype.toString.call(res[0].d), '[object Date]');
            assert.equal(res[0].d.getDate(), date.getDate());
            assert.equal(res[0].d.getHours(), date.getHours());
            assert.equal(res[0].d.getMinutes(), date.getMinutes());
            assert.equal(res[0].d.getSeconds(), date.getSeconds());
            conn.close();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('date text from row', function (done) {
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6)) this.skip();
    shareConn
      .query('select * from table_date')
      .then((rows) => {
        assert.equal(rows[0].t0.getTime(), date.getTime());
        assert.equal(rows[0].t1.getTime(), date2.getTime());
        assert.equal(rows[0].t2.getTime(), date3.getTime());

        assert.isNull(rows[1].t0);
        assert.isNull(rows[1].t1);
        assert.isNull(rows[1].t2);

        if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(5, 7)) {
          assert.isNull(rows[2].t0);
          assert.isNull(rows[2].t1);
          assert.isNull(rows[2].t2);
        }

        done();
      })
      .catch(done);
  });

  it('date text as string', function (done) {
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6)) this.skip();

    base
      .createConnection({
        dateStrings: true,
        profileSql: true
      })
      .then((conn1) => {
        conn1
          .query('select * from table_date')
          .then((rows) => {
            assert.equal(rows[0].t0, '2001-12-31');
            assert.equal(rows[0].t1, '2001-12-31 23:59:58.123');
            //microsecond doesn't work in javascript date
            assert.equal(rows[0].t2, '2001-12-31 23:59:59.123000');

            assert.isNull(rows[1].t0);
            assert.isNull(rows[1].t1);
            assert.isNull(rows[1].t2);

            if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(5, 7)) {
              assert.equal(rows[2].t0, '0000-00-00');
              assert.equal(rows[2].t1, '0000-00-00 00:00:00.000');
              assert.equal(rows[2].t2, '0000-00-00 00:00:00.000000');
            }
            conn1.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('query option : date text as string', function (done) {
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6)) this.skip();
    shareConn
      .query({ dateStrings: true, sql: 'select * from table_date' })
      .then((rows) => {
        assert.equal(rows[0].t0, '2001-12-31');
        assert.equal(rows[0].t1, '2001-12-31 23:59:58.123');
        //microsecond doesn't work in javascript date
        assert.equal(rows[0].t2, '2001-12-31 23:59:59.123000');

        assert.isNull(rows[1].t0);
        assert.isNull(rows[1].t1);
        assert.isNull(rows[1].t2);

        if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(5, 7)) {
          assert.equal(rows[2].t0, '0000-00-00');
          assert.equal(rows[2].t1, '0000-00-00 00:00:00.000');
          assert.equal(rows[2].t2, '0000-00-00 00:00:00.000000');
        }
        done();
      })
      .catch(done);
  });
});
