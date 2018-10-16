"use strict";

const base = require("../base.js");
const { assert } = require("chai");

const fs = require("fs");
const os = require("os");
const path = require("path");

describe("batch", () => {
  const fileName = path.join(os.tmpdir(), Math.random() + "tempBatchFile.txt");
  const bigFileName = path.join(os.tmpdir(), Math.random() + "tempBigBatchFile.txt");
  const testSize = 16 * 1024 * 1024 + 800; // more than one packet

  let maxAllowedSize, bigBuf;

  before(function(done) {
    shareConn
      .query("SELECT @@max_allowed_packet as t")
      .then(row => {
        maxAllowedSize = row[0].t;
        if (testSize < maxAllowedSize) {
          bigBuf = Buffer.alloc(testSize);
          for (let i = 0; i < testSize; i++) {
            bigBuf[i] = 97 + (i % 10);
          }
        }
        const buf = Buffer.from("abcdefghijkflmnopqrtuvwxyz");
        fs.writeFile(fileName, buf, "utf8", function(err) {
          if (err) {
            done(err);
          } else {
            done();
          }
        });
      })
      .catch(done);
  });

  after(function() {
    fs.unlink(fileName, err => {});
    fs.unlink(bigFileName, err => {});
  });

  it("simple batch", done => {
    base
      .createConnection()
      .then(conn => {
        conn.query(
          "CREATE TEMPORARY TABLE parse(id int, id2 int, id3 int, t varchar(128), id4 int)"
        );
        conn
          .batch("INSERT INTO `parse` values (1, ?, 2, ?, 3)", [[1, "john"], [2, "jack"]])
          .then(res => {
            assert.equal(res.affectedRows, 2);
            conn
              .query("select * from `parse`")
              .then(res => {
                assert.deepEqual(res, [
                  {
                    id: 1,
                    id2: 1,
                    id3: 2,
                    t: "john",
                    id4: 3
                  },
                  {
                    id: 1,
                    id2: 2,
                    id3: 2,
                    t: "jack",
                    id4: 3
                  }
                ]);
                conn.end();
                done();
              })
              .catch(done);
          });
      })
      .catch(done);
  });

  it("non rewritable batch", done => {
    base
      .createConnection()
      .then(conn => {
        conn.batch("SELECT ? as id, ? as t", [[1, "john"], [2, "jack"]]).then(res => {
          assert.deepEqual(res, [
            [
              {
                id: 1,
                t: "john"
              }
            ],
            [
              {
                id: 2,
                t: "jack"
              }
            ]
          ]);
          conn.end();
          done();
        });
      })
      .catch(done);
  });

  it("16M+ batch", function(done) {
    if (maxAllowedSize <= testSize) this.skip();
    this.timeout(30000);
    base
      .createConnection()
      .then(conn => {
        conn.query(
          "CREATE TEMPORARY TABLE parse(id int, id2 int, id3 int, t varchar(128), id4 int)"
        );
        const values = [];
        for (let i = 0; i < 1000000; i++) {
          values.push([i, "abcdefghijkflmnopqrtuvwxyz"]);
        }
        conn
          .batch("INSERT INTO `parse` values (1, ?, 2, ?, 3)", values)
          .then(res => {
            assert.equal(res.affectedRows, 1000000);

            let currRow = 0;
            conn
              .queryStream("select * from `parse`")
              .on("error", err => {
                done(new Error("must not have thrown any error !"));
              })
              .on("data", row => {
                assert.deepEqual(row, {
                  id: 1,
                  id2: currRow,
                  id3: 2,
                  t: "abcdefghijkflmnopqrtuvwxyz",
                  id4: 3
                });
                currRow++;
              })
              .on("end", () => {
                assert.equal(1000000, currRow);
                conn.end();
                done();
              });
          })
          .catch(done);
      })
      .catch(done);
  });

  it("16M+ single insert batch", function(done) {
    if (maxAllowedSize <= testSize) this.skip();
    this.timeout(30000);
    base
      .createConnection()
      .then(conn => {
        conn.query("CREATE TEMPORARY TABLE parse(id int, id2 int, id3 int, t longtext, id4 int)");
        conn
          .batch("INSERT INTO `parse` values (1, ?, 2, ?, 3)", [[1, bigBuf], [2, "john"]])
          .then(res => {
            assert.equal(res.affectedRows, 2);
            conn.query("select * from `parse`").then(rows => {
              assert.deepEqual(rows, [
                {
                  id: 1,
                  id2: 1,
                  id3: 2,
                  t: bigBuf.toString(),
                  id4: 3
                },
                {
                  id: 1,
                  id2: 2,
                  id3: 2,
                  t: "john",
                  id4: 3
                }
              ]);
              conn.end();
              done();
            });
          })
          .catch(done);
      })
      .catch(done);
  });

  it("batch with streams", done => {
    const stream1 = fs.createReadStream(fileName);
    const stream2 = fs.createReadStream(fileName);
    base
      .createConnection()
      .then(conn => {
        conn.query(
          "CREATE TEMPORARY TABLE parse(id int, id2 int, id3 int, t varchar(128), id4 int, id5 int)"
        );
        conn
          .batch("INSERT INTO `parse` values (1, ?, 2, ?, ?, 3)", [
            [1, stream1, 99],
            [2, stream2, 98]
          ])
          .then(res => {
            assert.equal(res.affectedRows, 2);
            conn.query("select * from `parse`").then(res => {
              assert.deepEqual(res, [
                {
                  id: 1,
                  id2: 1,
                  id3: 2,
                  t: "abcdefghijkflmnopqrtuvwxyz",
                  id4: 99,
                  id5: 3
                },
                {
                  id: 1,
                  id2: 2,
                  id3: 2,
                  t: "abcdefghijkflmnopqrtuvwxyz",
                  id4: 98,
                  id5: 3
                }
              ]);
              conn.end();
              done();
            });
          })
          .catch(done);
      })
      .catch(done);
  });

  it("16M+ batch with streams", function(done) {
    if (maxAllowedSize <= testSize) this.skip();
    this.timeout(30000);
    const values = [];
    for (let i = 0; i < 1000000; i++) {
      if (i % 100000 === 0) values.push([i, fs.createReadStream(fileName), i * 2]);
      else values.push([i, "abcdefghijkflmnopqrtuvwxyz", i * 2]);
    }

    base
      .createConnection()
      .then(conn => {
        conn.query(
          "CREATE TEMPORARY TABLE parse(id int, id2 int, id3 int, t varchar(128), id4 int, id5 int)"
        );
        conn
          .batch("INSERT INTO `parse` values (1, ?, 2, ?, ?, 3)", values)
          .then(res => {
            assert.equal(res.affectedRows, 1000000);
            let currRow = 0;
            conn
              .queryStream("select * from `parse`")
              .on("error", err => {
                done(new Error("must not have thrown any error !"));
              })
              .on("data", row => {
                assert.deepEqual(row, {
                  id: 1,
                  id2: currRow,
                  id3: 2,
                  t: "abcdefghijkflmnopqrtuvwxyz",
                  id4: currRow * 2,
                  id5: 3
                });
                currRow++;
              })
              .on("end", () => {
                assert.equal(1000000, currRow);
                conn.end();
                done();
              });
          })
          .catch(done);
      })
      .catch(done);
  });
});
