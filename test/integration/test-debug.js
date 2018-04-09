"use strict";

const base = require("../base.js");
const assert = require("chai").assert;
const fs = require("fs");
const os = require("os");
const path = require("path");

describe("debug", () => {
  let initialStdOut;
  let initialStdErr;
  let access;
  const fileName = path.join(os.tmpdir(), "tmp.txt");

  before(function() {
    initialStdOut = process.stdout.write;
    initialStdErr = process.stderr.write;
    access = fs.createWriteStream(fileName);
  });

  after(function() {
    process.stdout.write = initialStdOut;
    process.stderr.write = initialStdErr;
    access.end();
    fs.unlink(fileName, err => {});
  });

  it("change debug value", function(done) {
    process.stdout.write = process.stderr.write = access.write.bind(access);

    const conn = base.createConnection();
    conn.connect(err => {
      conn.query("SELECT 1", (err, rows) => {
        conn.debug(true);
        conn.query("SELECT 2", (err, rows) => {
          conn.debug(false);
          conn.query("SELECT 3", (err, rows) => {
            //wait 100ms to ensure stream has been written
            setTimeout(() => {
              const data = fs.readFileSync(fileName, { encoding: "utf8", flag: "r" });
              process.stdout.write = initialStdOut;
              process.stderr.write = initialStdErr;
              conn.end();
              if (
                (conn.isMariaDB && conn.hasMinVersion(10, 2, 2)) ||
                (!conn.isMariaDB && conn.hasMinVersion(5, 7, 5))
              ) {
                assert.isTrue(
                  data.length > 580 && data.length < 610,
                  "wrong data length : " +
                    data.length +
                    " expected value between 580 and 610." +
                    "\n data :\n" +
                    data
                );
              } else {
                //EOF Packet make exchange bigger
                assert.isTrue(
                  data.length > 680 && data.length < 710,
                  "wrong data length : " +
                    data.length +
                    " expected value between 680 and 710" +
                    "\n data :\n" +
                    data
                );
              }
              done();
            }, 100);
          });
        });
      });
    });
  });
});
