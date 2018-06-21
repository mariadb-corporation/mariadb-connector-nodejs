"use strict";

const base = require("../base.js");
const { assert } = require("chai");
const { Writable } = require("stream");

describe("results-set streaming", () => {
  before(function(done) {
    shareConn
      .query("CREATE TEMPORARY TABLE testStreamResult (v int)")
      .then(() => {
        let sql = "INSERT INTO testStreamResult VALUE (?)";
        const params = [0];
        for (let i = 1; i < 10000; i++) {
          sql += ",(?)";
          params.push(i);
        }
        return shareConn.query(sql, params);
      })
      .then(() => {
        done();
      })
      .catch(done);
  });

  it("Streaming result-set with promise implementation", function(done) {
    let currRow = 0;
    shareConn
      .stream("SELECT * FROM testStreamResult")
      .on("error", err => {
        done(new Error("must not have thrown any error !"));
      })
      .on("data", row => {
        assert.equal(currRow++, row.v);
      })
      .on("end", () => {
        assert.equal(10000, currRow);
        done();
      });
  });

  it("streaming with option rows as array", function(done) {
    let currRow = 0;
    shareConn
      .stream({ rowsAsArray: true, sql: "SELECT * FROM testStreamResult" })
      .on("error", err => {
        done(new Error("must not have thrown any error !"));
      })
      .on("data", row => {
        assert(Array.isArray(row));
        assert.deepEqual(row, [currRow++]);
      })
      .on("end", () => {
        assert.equal(10000, currRow);
        done();
      });
  });

  it("Streaming result-set pipe", function(done) {
    let currRow = 0;
    const writableStream = new Writable({
      objectMode: true,
      decodeStrings: false,
      write: (row, encoding, callback) => {
        assert.equal(currRow++, row.v);
        callback();
        if (process.versions.node.startsWith("6.") && currRow === 10000) {
          //final was implemented in v8
          done();
        }
      },
      writev: (rows, callback) => {
        for (let i = 0; i < rows.length; i++) {
          assert.equal(++currRow, row.v);
        }
        callback();
      },
      final: () => {
        assert.equal(10000, currRow);
        done();
      }
    });

    shareConn.stream("SELECT * FROM testStreamResult").pipe(writableStream);
  });

  it("Streaming error handling", function(done) {
    shareConn.stream("SELECT * FROM UnknownTable").on("error", err => {
      assert.equal(err.errno, 1146);
      assert.equal(err.sqlState, "42S02");
      assert.equal(err.code, "ER_NO_SUCH_TABLE");
      done();
    });
  });
});
