"use strict";

const base = require("../base.js");
const { assert } = require("chai");

const fs = require("fs");
const os = require("os");
const path = require("path");

describe("batch", () => {
  const fileName = path.join(os.tmpdir(), "tempBatchFile.txt");

  before(function(done) {
    const buf = Buffer.from("abcdefghijkflmnopqrtuvwxyz");
    fs.writeFile(fileName, buf, "utf8", function(err) {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
  });

  after(function() {
    fs.unlink(fileName, err => {});
  });

  it("simple batch", done => {
    base
      .createConnection()
      .then(conn => {
        conn.query("CREATE TEMPORARY TABLE parse(id int, id2 int, id3 int, t varchar(128), id4 int)");
        conn.batch("INSERT INTO `parse` values (1, ?, 2, ?, 3)", [ [1, "john"], [2, "jack"] ]);
        conn
          .query("select * from `parse`")
          .then(res => {
            assert.deepEqual(res,
              [
                {
                  "id": 1,
                  "id2": 1,
                  "id3": 2,
                  "t": "john",
                  "id4": 3
                },
                {
                  "id": 1,
                  "id2": 2,
                  "id3": 2,
                  "t": "jack",
                  "id4": 3
                }
              ]
            );
            conn.end();
            done();
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
      conn.query("CREATE TEMPORARY TABLE parse(id int, id2 int, id3 int, t varchar(128), id4 int, id5 int)");
      conn.batch("INSERT INTO `parse` values (1, ?, 2, ?, ?, 3)", [ [1, stream1, 99], [2, stream2, 98] ])
      .then(res => {
        conn
        .query("select * from `parse`")
        .then(res => {
          assert.deepEqual(res,
              [
                {
                  "id": 1,
                  "id2": 1,
                  "id3": 2,
                  "t": "abcdefghijkflmnopqrtuvwxyz",
                  "id4": 99,
                  "id5": 3
                },
                {
                  "id": 1,
                  "id2": 2,
                  "id3": 2,
                  "t": "abcdefghijkflmnopqrtuvwxyz",
                  "id4": 98,
                  "id5": 3
                }
              ]
          );
          conn.end();
          done();
        })
      })
      .catch(done);
    })
    .catch(done);
  });


});
