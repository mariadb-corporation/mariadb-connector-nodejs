"use strict";

const base = require("../base.js");
const assert = require("chai").assert;

describe("ok packet", () => {
  it("insertId", function(done) {
    shareConn.query(
      "CREATE TEMPORARY TABLE autoInc (id BIGINT not null primary key auto_increment)"
    );
    shareConn.query("INSERT INTO autoInc values ()", (err, rows) => {
      assert.equal(rows.insertId, 1);
      shareConn.query("INSERT INTO autoInc values (245)", (err, rows) => {
        assert.equal(rows.insertId, 245);
        shareConn.query("INSERT INTO autoInc values (32767)", (err, rows) => {
          assert.equal(rows.insertId, 32767);
          shareConn.query("INSERT INTO autoInc values (65535)", (err, rows) => {
            assert.equal(rows.insertId, 65535);
            shareConn.query("INSERT INTO autoInc values ()", (err, rows) => {
              assert.equal(rows.insertId, 65536);
              shareConn.query("INSERT INTO autoInc values (16777215)", (err, rows) => {
                assert.equal(rows.insertId, 16777215);
                shareConn.query("INSERT INTO autoInc values ()", (err, rows) => {
                  assert.equal(rows.insertId, 16777216);
                  shareConn.query("INSERT INTO autoInc values (4294967295)", (err, rows) => {
                    assert.equal(rows.insertId, 4294967295);
                    shareConn.query("INSERT INTO autoInc values ()", (err, rows) => {
                      assert.equal(rows.insertId, 4294967296);
                      shareConn.query(
                        "INSERT INTO autoInc values (9007199254740992)",
                        (err, rows) => {
                          assert.equal(rows.insertId.toString(10), "9007199254740992");
                          done();
                        }
                      );
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });

  it("negative insertId", function(done) {
    shareConn.query(
      "CREATE TEMPORARY TABLE negAutoInc (id BIGINT not null primary key auto_increment)"
    );
    shareConn.query("INSERT INTO negAutoInc values (-9007199254740990)", (err, rows) => {
      assert.equal(rows.insertId, -9007199254740990);
      shareConn.query("INSERT INTO negAutoInc values (-9007199254740989)", (err, rows) => {
        assert.equal(rows.insertId, -9007199254740989);
        shareConn.query("INSERT INTO negAutoInc values (-2147483648)", (err, rows) => {
          assert.equal(rows.insertId, -2147483648);
          shareConn.query("INSERT INTO negAutoInc values (-2147483647)", (err, rows) => {
            assert.equal(rows.insertId, -2147483647);
            shareConn.query("INSERT INTO negAutoInc values (-8388608)", (err, rows) => {
              assert.equal(rows.insertId, -8388608);
              shareConn.query("INSERT INTO negAutoInc values (-8388607)", (err, rows) => {
                assert.equal(rows.insertId, -8388607);
                shareConn.query("INSERT INTO negAutoInc values (-32768)", (err, rows) => {
                  assert.equal(rows.insertId, -32768);
                  shareConn.query("INSERT INTO negAutoInc values (-245)", (err, rows) => {
                    assert.equal(rows.insertId, -245);
                    shareConn.query(
                      "INSERT INTO negAutoInc values (-9007199254740992)",
                      (err, rows) => {
                        assert.equal(rows.insertId.toString(10), "-9007199254740992");
                        done();
                      }
                    );
                  });
                });
              });
            });
          });
        });
      });
    });
  });

  it("basic insert result", function(done) {
    shareConn.query(
      "CREATE TEMPORARY TABLE insertResultSet1(" +
        "id int(11) unsigned NOT NULL AUTO_INCREMENT," +
        "val varchar(256)," +
        "PRIMARY KEY (id))"
    );

    shareConn.query("INSERT INTO insertResultSet1(val) values (?)", ["t"], function(err, rows) {
      if (err) done(err);
      assert.ok(!Array.isArray(rows));
      assert.strictEqual(typeof rows, "object");
      assert.strictEqual(rows.insertId, 1);
      assert.strictEqual(rows.affectedRows, 1);
      assert.strictEqual(rows.warningStatus, 0);
    });

    shareConn.execute("INSERT INTO insertResultSet1(val) values (?)", ["t"], function(err, rows) {
      if (err) done(err);
      assert.ok(!Array.isArray(rows));
      assert.strictEqual(typeof rows, "object");
      assert.strictEqual(rows.insertId, 2);
      assert.strictEqual(rows.affectedRows, 1);
      assert.strictEqual(rows.warningStatus, 0);
      done();
    });
  });

  it("multiple insert result", function(done) {
    const conn = base.createConnection({ multipleStatements: true });
    conn.connect(function(err) {
      conn.query(
        "CREATE TEMPORARY TABLE multiple_insert_result(" +
          "id int(11) unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY," +
          "val varchar(256))"
      );

      conn.query(
        "INSERT INTO multiple_insert_result(val) values (?); " +
          "INSERT INTO multiple_insert_result(id,val) values (9, 't2'); " +
          "INSERT INTO multiple_insert_result(val) values (?)",
        ["t1", "t3"],
        (err, rows) => {
          if (err) done(err);

          assert.ok(Array.isArray(rows));
          assert.strictEqual(rows.length, 3);
          assert.strictEqual(rows[0].insertId, 1);
          assert.strictEqual(rows[0].affectedRows, 1);
          assert.strictEqual(rows[0].warningStatus, 0);
          assert.strictEqual(rows[1].insertId, 9);
          assert.strictEqual(rows[1].affectedRows, 1);
          assert.strictEqual(rows[1].warningStatus, 0);
          assert.strictEqual(rows[2].insertId, 10);
          assert.strictEqual(rows[2].affectedRows, 1);
          assert.strictEqual(rows[2].warningStatus, 0);
          conn.end();
          done();
        }
      );
    });
  });

  it("update result text", function(done) {
    shareConn.query("CREATE TEMPORARY TABLE updateResultSet1(id int(11))");
    shareConn.query("INSERT INTO updateResultSet1 values (1), (1), (2), (3)");
    shareConn.query("UPDATE updateResultSet1 set id = 1", function(err, res) {
      assert.ok(!Array.isArray(res));
      assert.strictEqual(typeof res, "object");
      assert.strictEqual(res.insertId, 0);
      assert.strictEqual(res.affectedRows, 4);
      assert.strictEqual(res.warningStatus, 0);
      shareConn.query("UPDATE updateResultSet1 set id = 1", function(err, res) {
        assert.ok(!Array.isArray(res));
        assert.strictEqual(typeof res, "object");
        assert.strictEqual(res.insertId, 0);
        assert.strictEqual(res.affectedRows, 4);
        assert.strictEqual(res.warningStatus, 0);
        done();
      });
    });
  });

  it("update result execute", function(done) {
    shareConn.query("CREATE TEMPORARY TABLE updateResultSet2(id int(11))");
    shareConn.query("INSERT INTO updateResultSet2 values (1), (1), (2), (3)");
    shareConn.execute("UPDATE updateResultSet2 set id = 1", function(err, res) {
      assert.ok(!Array.isArray(res));
      assert.strictEqual(typeof res, "object");
      assert.strictEqual(res.insertId, 0);
      assert.strictEqual(res.affectedRows, 4);
      assert.strictEqual(res.warningStatus, 0);
      shareConn.execute("UPDATE updateResultSet2 set id = 1", function(err, res) {
        assert.ok(!Array.isArray(res));
        assert.strictEqual(typeof res, "object");
        assert.strictEqual(res.insertId, 0);
        assert.strictEqual(res.affectedRows, 4);
        assert.strictEqual(res.warningStatus, 0);
        done();
      });
    });
  });

  it("update result text changedRows", function(done) {
    const conn = base.createConnection({ foundRows: false });
    conn.connect();
    conn.query("CREATE TEMPORARY TABLE updateResultSet1(id int(11))");
    conn.query("INSERT INTO updateResultSet1 values (1), (1), (2), (3)");
    conn.query("UPDATE updateResultSet1 set id = 1", function(err, res) {
      assert.ok(!Array.isArray(res));
      assert.strictEqual(typeof res, "object");
      assert.strictEqual(res.insertId, 0);
      assert.strictEqual(res.affectedRows, 2);
      assert.strictEqual(res.warningStatus, 0);
      conn.query("UPDATE updateResultSet1 set id = 1", function(err, res) {
        assert.ok(!Array.isArray(res));
        assert.strictEqual(typeof res, "object");
        assert.strictEqual(res.insertId, 0);
        assert.strictEqual(res.affectedRows, 0);
        assert.strictEqual(res.warningStatus, 0);
        conn.end();
        done();
      });
    });
  });

  it("update result binary changedRows", function(done) {
    const conn = base.createConnection({ foundRows: false });
    conn.connect();
    conn.query("CREATE TEMPORARY TABLE updateResultSet2(id int(11))");
    conn.query("INSERT INTO updateResultSet2 values (1), (1), (2), (3)");
    conn.execute("UPDATE updateResultSet2 set id = 1", function(err, res) {
      assert.ok(!Array.isArray(res));
      assert.strictEqual(typeof res, "object");
      assert.strictEqual(res.insertId, 0);
      assert.strictEqual(res.affectedRows, 2);
      assert.strictEqual(res.warningStatus, 0);
      conn.execute("UPDATE updateResultSet2 set id = 1", function(err, res) {
        assert.ok(!Array.isArray(res));
        assert.strictEqual(typeof res, "object");
        assert.strictEqual(res.insertId, 0);
        assert.strictEqual(res.affectedRows, 0);
        assert.strictEqual(res.warningStatus, 0);
        conn.end();
        done();
      });
    });
  });
});
