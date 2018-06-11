"use strict";

const base = require("../base.js");
const assert = require("chai").assert;
const { Writable } = require("stream");

describe("results-set streaming", () => {
  before(function(done) {
    shareConn
      .query("CREATE TEMPORARY TABLE testStreamResult (v int)")
      .then(() => {
        for (let i = 1; i < 10000; i++) {
          shareConn.query("INSERT INTO testStreamResult VALUE (?)", i);
        }
        return shareConn.query("INSERT INTO testStreamResult VALUE (?)", 10000);
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
        assert.equal(++currRow, row.v);
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
        assert.equal(++currRow, row.v);
        callback();
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
