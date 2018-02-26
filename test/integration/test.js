"use strict";

require("../base.js");
const expect = require("chai").expect;

describe("test framework works ?", function() {
  it("ttt", function(done) {
    console.log("Node version in use: " + process.version);
    shareConn.query("SELECT '1'", (err, res) => {
      console.log(res);
      done();
    });
  });
});
