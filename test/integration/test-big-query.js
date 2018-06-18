"use strict";

const base = require("../base.js");
const { assert } = require("chai");

describe("Big query", function() {
  const testSize = 16 * 1024 * 1024 + 800; // more than one packet
  let maxAllowedSize, buf;

  before(function(done) {
    shareConn
      .query("SELECT @@max_allowed_packet as t")
      .then(row => {
        maxAllowedSize = row[0].t;
        if (testSize < maxAllowedSize) {
          buf = Buffer.alloc(testSize);
          for (let i = 0; i < buf.length; i++) {
            buf[i] = 97 + (i % 10);
          }
        }
        done();
      })
      .catch(done);
  });

  it("parameter bigger than 16M packet size", function(done) {
    if (maxAllowedSize <= testSize) this.skip();
    this.timeout(10000); //can take some time
    shareConn.query("CREATE TEMPORARY TABLE bigParameter (b longblob)");
    shareConn
      .query("insert into bigParameter(b) values(?)", [buf])
      .then(() => {
        return shareConn.query("SELECT * from bigParameter");
      })
      .then(rows => {
        assert.deepEqual(rows[0].b, buf);
        done();
      })
      .catch(done);
  });
});
