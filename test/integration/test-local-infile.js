"use strict";

const base = require("../base.js");
const assert = require("chai").assert;
const fs = require("fs");
const os = require("os");
const path = require("path");

describe("local-infile", () => {
  const smallFileName = path.join(os.tmpdir(), "smallLocalInfile.txt");
  const bigFileName = path.join(os.tmpdir(), "bigLocalInfile.txt");
  let conn;

  after(function() {
    fs.unlink(smallFileName, err => {});
    fs.unlink(bigFileName, err => {});
  });

  afterEach(() => {
    if (conn) {
      conn.end();
      conn = null;
    }
  });

  it("local infile disable when permitLocalInfile option is set", function(done) {
    conn = base.createConnection({ permitLocalInfile: false });
    conn.connect().then(() => {
      conn.query("LOAD DATA LOCAL INFILE 'dummy.tsv' INTO TABLE t (id, test)", err => {
        assert.isTrue(err != null);
        assert.equal(err.errno, 1148);
        assert.equal(err.sqlState, "42000");
        assert.isFalse(err.fatal);
        done();
      });
    });
  });

  it("local infile disable when pipelining option is set", function(done) {
    conn = base.createConnection({ pipelining: true });
    conn.connect().then(() => {
      conn.query("LOAD DATA LOCAL INFILE 'dummy.tsv' INTO TABLE t (id, test)", err => {
        assert.isTrue(err != null);
        assert.equal(err.errno, 1148);
        assert.equal(err.sqlState, "42000");
        assert.isFalse(err.fatal);
        done();
      });
    });
  });

  it("local infile disable using default options", function(done) {
    conn = base.createConnection({ pipelining: undefined, permitLocalInfile: undefined });
    conn.connect().then(() => {
      conn.query("LOAD DATA LOCAL INFILE 'dummy.tsv' INTO TABLE t (id, test)", err => {
        assert.isTrue(err != null);
        assert.equal(err.errno, 1148);
        assert.equal(err.sqlState, "42000");
        assert.isFalse(err.fatal);
        done();
      });
    });
  });

  it("file error missing", function(done) {
    shareConn.query("select @@local_infile", (err, rows) => {
      if (err) return done(err);
      if (rows[0]["@@local_infile"] === 0) return done(err);

      conn = base.createConnection({ permitLocalInfile: true });
      conn.connect().then(() => {
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
            done();
          }
        );
      });
    });
  });

  it("small local infile", function(done) {
    shareConn.query("select @@local_infile", (err, rows) => {
      if (err) return done(err);
      if (rows[0]["@@local_infile"] === 0) return done(err);
      fs.writeFile(smallFileName, "1,hello\n2,world\n", "utf8", function(err) {
        if (err) {
          done(err);
        } else {
          conn = base.createConnection({ permitLocalInfile: true });
          conn.connect().then(() => {
            conn.query("CREATE TEMPORARY TABLE smallLocalInfile(id int, test varchar(100))");
            conn.query(
              "LOAD DATA LOCAL INFILE '" +
                smallFileName.replace(/\\/g, "/") +
                "' INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)",
              err => {
                if (err) {
                  done(err);
                } else {
                  conn.query("SELECT * FROM smallLocalInfile", (err, rows) => {
                    assert.deepEqual(rows, [{ id: 1, test: "hello" }, { id: 2, test: "world" }]);
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

  it("big local infile", function(done) {
    shareConn.query("select @@local_infile", (err, rows) => {
      if (err) return done(err);
      if (rows[0]["@@local_infile"] === 0) return done(err);
      this.timeout(180000);
      shareConn.query("SELECT @@max_allowed_packet as t", function(err, results, fields) {
        if (err) done(err);
        const maxAllowedSize = results[0].t;
        const size = Math.round((maxAllowedSize - 100) / 16);
        const header = '"a","b"\n';
        const headerLen = header.length;
        const buf = Buffer.allocUnsafe(size * 16 + headerLen);
        buf.write(header);
        for (let i = 0; i < size; i++) {
          buf.write('"a' + padStartZero(i, 8) + '","b"\n', i * 16 + headerLen);
        }
        fs.writeFile(bigFileName, buf, function(err) {
          if (err) {
            done(err);
          } else {
            conn = base.createConnection({ permitLocalInfile: true });
            conn.connect().then(() => {
              conn.query("CREATE TEMPORARY TABLE bigLocalInfile(t1 varchar(10), t2 varchar(2))");
              conn.query(
                "LOAD DATA LOCAL INFILE '" +
                  bigFileName.replace(/\\/g, "/") +
                  "' INTO TABLE bigLocalInfile " +
                  "COLUMNS TERMINATED BY ',' ENCLOSED BY '\\\"' ESCAPED BY '\\\\' " +
                  "LINES TERMINATED BY '\\n' IGNORE 1 LINES " +
                  "(t1, t2)",
                err => {
                  if (err) {
                    done(err);
                  } else {
                    let error = null;
                    conn.query("SELECT * FROM bigLocalInfile", (err, rows) => {
                      assert.equal(rows.length, size);
                      for (let i = 0; i < size; i++) {
                        if (rows[i].t1 !== "a" + padStartZero(i, 8) && rows[i].t2 !== "b") {
                          console.log(
                            "result differ (no:" +
                              i +
                              ") t1=" +
                              rows[i].t1 +
                              " != " +
                              padStartZero(i, 8) +
                              " t2=" +
                              rows[i].t2
                          );
                          if (!error) error = i;
                        }
                      }
                      if (!error) {
                        done();
                      } else {
                        console.log("retrying");
                        conn.query("SELECT * FROM bigLocalInfile", (err, rows) => {
                          assert.equal(rows.length, size);
                          for (let i = 0; i < size; i++) {
                            assert.deepEqual(
                              rows[i],
                              { t1: "a" + padStartZero(i, 8), t2: "b" },
                              "result differ (no:" + i + ")"
                            );
                          }
                          done(new Error("was wrong"));
                        });
                      }
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

  function padStartZero(val, length) {
    val = "" + val;
    const stringLength = val.length;
    let add = "";
    while (add.length + stringLength < length) add += "0";
    return add + val;
  }
});
