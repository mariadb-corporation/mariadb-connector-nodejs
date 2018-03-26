"use strict";

const base = require("../base.js");
const assert = require("chai").assert;

describe("pipelining", () => {
  let conn1, conn2;
  const iterations = 5000;

  before(function(done) {
    conn1 = base.createConnection({ pipelining: false });
    conn2 = base.createConnection({ pipelining: true });
    conn1.connect(function(err) {
      if (err) done(err);
      conn2.connect(function(err) {
        if (err) done(err);
        done();
      });
    });
  });

  after(function() {
    conn1.end();
    conn2.end();
  });

  it("5000 insert test speed", function(done) {
    this.timeout(60000);
    conn1.query("CREATE TEMPORARY TABLE pipeline1 (test int)");
    conn2.query("CREATE TEMPORARY TABLE pipeline2 (test int)", (err, res) => {
      insertBulk(conn1, "pipeline1", diff => {
        insertBulk(conn2, "pipeline2", pipelineDiff => {
          if (shareConn.hasMinVersion(10, 2, 0)) {
            //before 10.1, speed is sometime nearly equivalent using pipelining or not
            //remove speed test then to avoid random error in CIs
            assert.isTrue(
              diff[0] > pipelineDiff[0] ||
                (diff[0] === pipelineDiff[0] && diff[1] > pipelineDiff[1]),
              "error - time to insert 1000 : std=" +
                Math.floor(diff[0] * 1000 + diff[1] / 1000000) +
                "ms pipelining=" +
                Math.floor(pipelineDiff[0] * 1000 + pipelineDiff[1] / 1000000) +
                "ms"
            );
          }
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
