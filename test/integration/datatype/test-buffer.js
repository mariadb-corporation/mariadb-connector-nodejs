"use strict";

const base = require("../../base");
const assert = require("chai").assert;

describe("buffer", () => {
  it("query a basic buffer", done => {
    shareConn.query("SELECT x'FF00' val", (err, rows) => {
      if (err) throw err;
      assert.deepEqual(rows[0].val, Buffer.from([255, 0]));
      done();
    });
  });

  const buf = Buffer.from("let's rocks 🤘");
  const hex = buf.toString("hex").toUpperCase();

  it("execute hex() function result", function(done) {
    shareConn.execute("SELECT HEX(?) t", [buf], function(err, rows) {
      if (err) done(err);
      assert.deepEqual(rows, [{ t: hex }]);
      done();
    });
  });

  it("query hex() function result", function(done) {
    shareConn.query("SELECT HEX(?) t", [buf], function(err, rows) {
      if (err) done(err);
      assert.deepEqual(rows, [{ t: hex }]);
      done();
    });
  });

  it("blobs to buffer type", function(done) {
    shareConn.query(
      "CREATE TEMPORARY TABLE blobToBuff (id int not null primary key auto_increment, test longblob, test2 blob, test3 text)"
    );
    shareConn.query("insert into blobToBuff values(null, 'a','b','c')");
    shareConn.query("SELECT * FROM blobToBuff", [buf], function(err, rows) {
      if (err) done(err);
      assert.deepEqual(rows, [
        { id: 1, test: Buffer.from("a"), test2: Buffer.from("b"), test3: "c" }
      ]);
      done();
    });
  });

  it("text multi bytes characters", function(done) {
    shareConn.query(
      "CREATE TEMPORARY TABLE BlobTeststreamtest2 (id int primary key not null, st varchar(20), strm text) CHARSET utf8"
    );
    const toInsert1 = '\u00D8bbcdefgh\njklmn"';
    const toInsert2 = '\u00D8abcdefgh\njklmn"';

    shareConn.query("insert into BlobTeststreamtest2 values(?, ?, ?)", [2, toInsert1, toInsert2]);
    shareConn.query("select * from BlobTeststreamtest2", (err, rows) => {
      if (err) done(err);
      assert.deepEqual(rows, [{ id: 2, st: toInsert1, strm: toInsert2 }]);
      done();
    });
  });

  it("blob empty and null", function(done) {
    shareConn.query("CREATE TEMPORARY TABLE blobEmpty (val LONGBLOB)");
    shareConn.query("insert into blobEmpty values (?)", [""]);
    shareConn.query("insert into blobEmpty values (?)", ["hello"]);
    shareConn.query("insert into blobEmpty values (?)", [null]);

    shareConn.query("select * from blobEmpty", (err, rows) => {
      if (err) done(err);
      assert.deepEqual(rows, [
        { val: Buffer.from("") },
        { val: Buffer.from("hello") },
        { val: null }
      ]);
      done();
    });
  });
});
