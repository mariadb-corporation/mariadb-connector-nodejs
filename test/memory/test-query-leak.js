"use strict";

require("../base.js");
const memwatch = require("memwatch-next");
const assert = require("chai").assert;

describe("leaks", () => {
  const queryUsers = queryCount => {
    if (queryCount > 0) {
      shareConn.query("SELECT * FROM mysql.USER").then(rows => {
        return queryUsers(--queryCount);
      });
    }
    return Promise.resolve();
  };

  it("1000 select leaking test", function(done) {
    this.timeout(20000);
    const hd = new memwatch.HeapDiff();
    queryUsers(1000, done)
      .then(() => {
        handleDiff(hd, done);
      })
      .catch(done);
  });

  const handleDiff = (hd, done) => {
    const diff = hd.end();
    const errs = [];
    for (let i = 0; i < diff.change.details.length; i++) {
      const obj = diff.change.details[i];
      if (obj["what"] === "Code") continue;
      if (obj["+"] > obj["-"] + 5) {
        errs.push(obj);
      }
    }
    if (errs.length > 0) {
      console.log(diff);
      for (let i = 0; i < errs.length; i++) {
        console.log(errs[i]);
      }

      done(new Error("Object is leaking"));
    } else {
      done();
    }
  };

  const queryPipelineUsers = queryCount => {
    const queries = [];
    for (let i = 0; i < queryCount; i++) {
      queries.push(shareConn.query("SELECT * FROM mysql.USER"));
    }
    return Promise.all(queries)
      .then(() => {
        //not returning results, or all data will still be in memory,
        // disturbing results
        return Promise.resolve();
      })
      .catch(err => {
        return Promise.reject(err);
      });
  };

  it("1000 select pipeline leaking test", function(done) {
    this.timeout(20000);

    //run first pipeling, so denque queue increase array size first
    queryPipelineUsers(1000).catch(done);
    const hd = new memwatch.HeapDiff();

    queryPipelineUsers(1000)
      .then(() => {
        handleDiff(hd, done);
      })
      .catch(done);
  });
});
