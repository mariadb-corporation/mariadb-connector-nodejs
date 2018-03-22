"use strict";

const base = require("../base.js");
const assert = require("chai").assert;

describe("pipelining", () => {
  let conn;
  const iterations = 1000;

  before(function(done) {
    conn = base.createConnection({ pipelining: false });
    conn.connect(function(err) {
      if (err) done(err);
      done();
    });
  });

  after(function() {
    conn.end();
  });

  it("1000 insert test speed", function(done) {
    conn.query("CREATE TEMPORARY TABLE pipeline1 (test int)");
    shareConn.query("CREATE TEMPORARY TABLE pipeline2 (test int)", (err, res) => {
      insertBulk(conn, "pipeline1", diff => {
        insertBulk(shareConn, "pipeline2", pipelineDiff => {
          assert.isTrue(
            diff[0] > pipelineDiff[0] || (diff[0] === pipelineDiff[0] && diff[1] > pipelineDiff[1]),
            "error - time to insert 1000 : std=" +
              Math.floor(diff[0] * 1000 + diff[1] / 1000000) +
              "ms pipelining=" +
              Math.floor(pipelineDiff[0] * 1000 + pipelineDiff[1] / 1000000) +
              "ms"
          );
          done();
        });
      });
    });
  });

  function insertBulk(conn, tableName, cb) {
    const startTime = process.hrtime();
    let ended = 0;
    for (let i = 0; i < iterations; i++) {
      conn.query("INSERT INTO " + tableName + " VALUES(?)", [i], function(err) {
        if (++ended === iterations) {
          cb(process.hrtime(startTime));
        }
      });
    }
  }
});
