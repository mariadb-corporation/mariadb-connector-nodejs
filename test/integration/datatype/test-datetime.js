"use strict";

const base = require("../../base");
const assert = require("chai").assert;

describe("datetime", () => {
  const date = new Date("2001-12-31 00:00:00");
  const date2 = new Date("2001-12-31 23:59:58.123");
  const date3 = new Date("2001-12-31 23:59:59.123456");

  after(function() {
    shareConn.query("DROP TABLE IF EXISTS table_date", err => {});
  });

  before(done => {
    //MySQL 5.5 doesn't permit datetime(6)
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 6)) {
      done();
    } else {
      shareConn.query("CREATE TABLE table_date (t0 DATE, t1 DATETIME(3), t2 DATETIME(6))");
      shareConn.query("INSERT INTO table_date VALUES (?, ?, ?)", [date, date2, date3]);
      shareConn.query("INSERT INTO table_date VALUES (?, ?, ?)", [null, null, null], () => {
        if (!shareConn.isMariaDB() && shareConn.hasMinVersion(5, 7)) {
          done();
        } else {
          shareConn.query(
            "INSERT INTO table_date VALUES (?, ?, ?)",
            ["0000-00-00", "0000-00-00 00:00:00", "0000-00-00 00:00:00"],
            () => done()
          );
        }
      });
    }
  });

  it("standard date", done => {
    //using distant server, time might be different
    if (shareConn.opts.host !== "localhost" && shareConn.opts.host !== "mariadb.example.com")
      this.skip();

    shareConn.query("SELECT UNIX_TIMESTAMP(?) tt", [new Date("2000-01-01 UTC")], (err, res) => {
      if (err) throw err;
      assert.deepEqual(res[0].tt, 946684800);
      done();
    });
  });

  it("date text", function(done) {
    const date = new Date("1999-01-31 12:13:14");
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 6)) this.skip();
    shareConn.query("select CAST(? as datetime) d", [date], (err, res) => {
      if (err) throw done(err);
      assert.equal(Object.prototype.toString.call(res[0].d), "[object Date]");
      assert.equal(res[0].d.getDate(), date.getDate());
      assert.equal(res[0].d.getHours(), date.getHours());
      assert.equal(res[0].d.getMinutes(), date.getMinutes());
      assert.equal(res[0].d.getSeconds(), date.getSeconds());
      done();
    });
  });

  it("date text from row", function(done) {
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 6)) this.skip();
    shareConn.query("select * from table_date", (err, rows) => {
      if (err) throw err;
      assert.equal(rows[0].t0.getTime(), date.getTime());
      assert.equal(rows[0].t1.getTime(), date2.getTime());
      assert.equal(rows[0].t2.getTime(), date3.getTime());

      assert.isNull(rows[1].t0);
      assert.isNull(rows[1].t1);
      assert.isNull(rows[1].t2);

      if (shareConn.isMariaDB() || !shareConn.hasMinVersion(5, 7)) {
        assert.isNull(rows[2].t0);
        assert.isNull(rows[2].t1);
        assert.isNull(rows[2].t2);
      }

      done();
    });
  });

  it("date text as string", function(done) {
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 6)) this.skip();

    const conn1 = base.createConnection({
      dateStrings: true,
      profileSql: true
    });

    conn1.connect(function(err) {
      if (err) return done(err);
      conn1.query("select * from table_date", (err, rows) => {
        if (err) throw err;
        assert.equal(rows[0].t0, "2001-12-31");
        assert.equal(rows[0].t1, "2001-12-31 23:59:58.123");
        //microsecond doesn't work in javascript date
        assert.equal(rows[0].t2, "2001-12-31 23:59:59.123000");

        assert.isNull(rows[1].t0);
        assert.isNull(rows[1].t1);
        assert.isNull(rows[1].t2);

        if (shareConn.isMariaDB() || !shareConn.hasMinVersion(5, 7)) {
          assert.equal(rows[2].t0, "0000-00-00");
          assert.equal(rows[2].t1, "0000-00-00 00:00:00.000");
          assert.equal(rows[2].t2, "0000-00-00 00:00:00.000000");
        }
        conn1.end();
        done();
      });
    });
  });
});
