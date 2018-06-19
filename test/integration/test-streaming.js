"use strict";

const base = require("../base.js");
const { assert } = require("chai");
const fs = require("fs");
const os = require("os");
const path = require("path");

describe("streaming", () => {
  const fileName = path.join(os.tmpdir(), "tempBigFile.txt");
  const halfFileName = path.join(os.tmpdir(), "tempHalfFile.txt");
  const size = 20 * 1024 * 1024;
  const buf = Buffer.alloc(size);
  const buf2 = Buffer.alloc(size / 2);
  let maxAllowedSize;

  before(function(done) {
    this.timeout(20000);
    shareConn
      .query(
        "CREATE TEMPORARY TABLE Streaming (id int NOT NULL AUTO_INCREMENT, b longblob, c varchar(10), d longblob, e varchar(10), PRIMARY KEY (id))"
      )
      .then(() => {
        return shareConn.query("SELECT @@max_allowed_packet as t");
      })
      .then(rows => {
        maxAllowedSize = rows[0].t;
        createTmpFiles(done);
      })
      .catch(done);
  });

  after(function() {
    //create
    fs.unlink(fileName, err => {});
    fs.unlink(halfFileName, err => {});
  });

  it("Streaming url content", function(done) {
    this.timeout(10000);
    const https = require("https");
    https.get(
      "https://node.green/#ES2018-features-Promise-prototype-finally-basic-support",
      res => {
        base.createConnection().then(conn => {
          conn
            .query(
              "CREATE TEMPORARY TABLE StreamingContent (id int NOT NULL AUTO_INCREMENT, b longblob, PRIMARY KEY (id))"
            )
            .then(() => conn.query("INSERT INTO StreamingContent (b) VALUE (?)", [res]))
            .then(() => conn.query("SELECT * FROM StreamingContent"))
            .then(rows => {
              conn.end();
              done();
            })
            .catch(done);
        });
      }
    );
  });

  it("Streaming single parameter", function(done) {
    if (maxAllowedSize < size) this.skip();
    this.timeout(20000);
    const r = fs.createReadStream(fileName);
    shareConn
      .query("truncate Streaming")
      .then(() => {
        return shareConn.query("insert into Streaming(b) values(?)", [r]);
      })
      .then(() => {
        return shareConn.query("SELECT b from Streaming");
      })
      .then(rows => {
        assert.equal(size, rows[0].b.length);
        assert.deepEqual(rows, [{ b: buf }]);
        done();
      })
      .catch(done);
  });

  it("Streaming multiple parameter", function(done) {
    this.timeout(20000);
    if (maxAllowedSize < size) this.skip();
    const r = fs.createReadStream(halfFileName);
    const r2 = fs.createReadStream(halfFileName);
    shareConn
      .query("truncate Streaming")
      .then(() => {
        return shareConn.query("insert into Streaming(b, c, d, e) values(?, ?, ?, ?)", [
          r,
          "t1",
          r2,
          "t2"
        ]);
      })
      .then(() => {
        return shareConn.query("SELECT * from Streaming");
      })
      .then(rows => {
        assert.equal(size / 2, rows[0].b.length);
        assert.equal(size / 2, rows[0].d.length);
        assert.deepEqual(rows, [{ id: 1, b: buf2, c: "t1", d: buf2, e: "t2" }]);
        done();
      })
      .catch(done);
  });

  it("Streaming multiple parameter begin no stream", function(done) {
    if (maxAllowedSize < size) this.skip();
    this.timeout(20000);
    const r = fs.createReadStream(halfFileName);
    const r2 = fs.createReadStream(halfFileName);
    shareConn
      .query("truncate Streaming")
      .then(() => {
        return shareConn.query("insert into Streaming(c, b, e, d) values(?, ?, ?, ?)", [
          "t1",
          r,
          "t2",
          r2
        ]);
      })
      .then(() => {
        return shareConn.query("SELECT * from Streaming");
      })
      .then(rows => {
        assert.equal(size / 2, rows[0].b.length);
        assert.equal(size / 2, rows[0].d.length);
        assert.deepEqual(rows, [{ id: 1, b: buf2, c: "t1", d: buf2, e: "t2" }]);
        done();
      })
      .catch(done);
  });

  it("Streaming multiple parameter ensure max callstack", function(done) {
    if (maxAllowedSize < size) this.skip();
    this.timeout(20000);
    const r = fs.createReadStream(halfFileName);

    let createTable = "CREATE TEMPORARY TABLE Streaming2 (b longblob";
    let insertSql = "insert into Streaming2 values(?";
    const params = [r];
    const max = 200;
    for (let i = 0; i < max; i++) {
      createTable += ",t" + i + " int";
      insertSql += ",?";
      params.push(i);
    }
    createTable += ")";
    insertSql += ")";

    shareConn
      .query(createTable)
      .then(() => {
        return shareConn.query(insertSql, params);
      })
      .then(() => {
        return shareConn.query("SELECT * from Streaming2");
      })
      .then(rows => {
        assert.equal(size / 2, rows[0].b.length);
        assert.deepEqual(rows[0].b, buf2);
        for (let i = 0; i < max; i++) {
          assert.equal(rows[0]["t" + i], i);
        }
        done();
      })
      .catch(done);
  });

  function createTmpFiles(done) {
    for (let i = 0; i < buf.length; i++) {
      buf[i] = 97 + i % 10;
    }

    //create
    fs.writeFile(fileName, buf, "utf8", function(err) {
      if (err) {
        done(err);
      } else {
        for (let i = 0; i < buf2.length; i++) {
          buf2[i] = 97 + i % 10;
        }
        fs.writeFile(halfFileName, buf2, "utf8", function(err) {
          if (err) {
            done(err);
          } else {
            done();
          }
        });
      }
    });
  }
});
