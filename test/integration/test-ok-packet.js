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
});
