"use strict";

const base = require("../base.js");
const assert = require("chai").assert;
const fs = require("fs");
const os = require("os");
const path = require("path");

describe("local-infile", () => {
  it("local infile disable when permitLocalInfile option is set", function(done) {
    const conn = base.createConnection({ permitLocalInfile: false });
    conn.connect(() => {
      conn.query("LOAD DATA LOCAL INFILE 'dummy.tsv' INTO TABLE t (id, test)", err => {
        assert.isTrue(err != null);
        assert.equal(err.errno, 1148);
        assert.equal(err.sqlState, "42000");
        assert.isFalse(err.fatal);
        conn.end();
        done();
      });
    });
  });

  it("local infile disable when pipelining option is set", function(done) {
    const conn = base.createConnection({ pipelining: true });
    conn.connect(() => {
      conn.query("LOAD DATA LOCAL INFILE 'dummy.tsv' INTO TABLE t (id, test)", err => {
        assert.isTrue(err != null);
        assert.equal(err.errno, 1148);
        assert.equal(err.sqlState, "42000");
        assert.isFalse(err.fatal);
        conn.end();
        done();
      });
    });
  });

  it("local infile disable using default options", function(done) {
    const conn = base.createConnection({ pipelining: undefined, permitLocalInfile: undefined });
    conn.connect(() => {
      conn.query("LOAD DATA LOCAL INFILE 'dummy.tsv' INTO TABLE t (id, test)", err => {
        assert.isTrue(err != null);
        assert.equal(err.errno, 1148);
        assert.equal(err.sqlState, "42000");
        assert.isFalse(err.fatal);
        conn.end();
        done();
      });
    });
  });

  it("file error missing", function(done) {
    const conn = base.createConnection({ permitLocalInfile: true });
    conn.connect(() => {
      conn.query("CREATE TEMPORARY TABLE smallLocalInfile(id int, test varchar(100))");
      conn.query(
        "LOAD DATA LOCAL INFILE '" +
          path.join(os.tmpdir(), "notExistFile.txt").replace(/\\/g, "/") +
          "' INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)",
        err => {
          assert.isTrue(err != null);
          assert.isTrue(
            err.message.includes("LOCAL INFILE command failed: ENOENT: no such file or directory")
          );
          assert.equal(err.sqlState, "22000");
          assert.isFalse(err.fatal);
          conn.end();
          done();
        }
      );
    });
  });

  it("small local infile", function(done) {
    const fileName = path.join(os.tmpdir(), "smallLocalInfile.txt");
    fs.unlink(fileName, err => {});
    fs.writeFile(fileName, "1,hello\n2,world\n", "utf8", function(err) {
      if (err) {
        done(err);
      } else {
        const conn = base.createConnection({ permitLocalInfile: true });
        conn.connect(() => {
          conn.query("CREATE TEMPORARY TABLE smallLocalInfile(id int, test varchar(100))");
          conn.query(
            "LOAD DATA LOCAL INFILE '" +
              fileName.replace(/\\/g, "/") +
              "' INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)",
            err => {
              if (err) {
                done(err);
              } else {
                conn.query("SELECT * FROM smallLocalInfile", (err, rows) => {
                  assert.deepEqual(rows, [{ id: 1, test: "hello" }, { id: 2, test: "world" }]);
                  conn.end();
                  done();
                });
              }
            }
          );
        });
      }
    });
  });

  it("big local infile", function(done) {
    this.timeout(60000);
    shareConn.query("SELECT @@max_allowed_packet as t", function(err, results, fields) {
      if (err) done(err);
      const maxAllowedSize = results[0].t;
      const fileName = path.join(os.tmpdir(), "bigLocalInfile.txt");
      fs.unlink(fileName, err => {});
      const size = Math.round((maxAllowedSize - 100) / 16);
      const buf = Buffer.allocUnsafe(size * 16);
      for (let i = 0; i < size; i++) {
        buf.write('"a01234567","b"\n', i * 16);
      }
      fs.writeFile(fileName, buf, function(err) {
        if (err) {
          done(err);
        } else {
          const conn = base.createConnection({ permitLocalInfile: true });
          conn.connect(() => {
            conn.query("CREATE TEMPORARY TABLE bigLocalInfile(t1 varchar(10), t2 varchar(2))");
            conn.query(
              "LOAD DATA LOCAL INFILE '" +
                fileName.replace(/\\/g, "/") +
                "' INTO TABLE bigLocalInfile " +
                "COLUMNS TERMINATED BY ',' ENCLOSED BY '\\\"' ESCAPED BY '\\\\' " +
                "LINES TERMINATED BY '\\n' (t1, t2)",
              err => {
                if (err) {
                  done(err);
                } else {
                  conn.query("SELECT * FROM bigLocalInfile", (err, rows) => {
                    assert.equal(rows.length, size);
                    const expectedRow = { t1: "a01234567", t2: "b" };
                    for (let i = 0; i < size; i++) {
                      assert.deepEqual(rows[i], expectedRow);
                    }
                    conn.end();
                    done();
                  });
                }
              }
            );
          });
        }
      });
    });
  });
});
