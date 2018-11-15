"use strict";

const base = require("../base.js");
const Conf = require("../conf");
const { assert } = require("chai");
const fs = require("fs");
const os = require("os");
const path = require("path");

describe("debug", () => {
  const smallFileName = path.join(os.tmpdir(), "smallLocalInfileDebug.txt");
  let initialStdOut;
  let initialStdErr;
  let access;
  let permitLocalInfile = true;

  before(done => {
    shareConn
      .query("select @@local_infile")
      .then(rows => {
        permitLocalInfile = rows[0]["@@local_infile"] === 1;
        return new Promise(function(resolve, reject) {
          fs.writeFile(smallFileName, "1,hello\n2,world\n", "utf8", function(err) {
            if (err) reject(err);
            else resolve();
          });
        });
      })
      .then(() => {
        done();
      })
      .catch(done);
  });

  after(done => {
    fs.unlink(smallFileName, done);
  });

  it("select request debug", function(done) {
    testQueryDebug(false, done);
  });

  it("select request debug compress", function(done) {
    testQueryDebug(true, done);
  });

  function testQueryDebug(compress, done) {
    const fileName = path.join(os.tmpdir(), "tmp.txt");
    initialStdOut = process.stdout.write;
    initialStdErr = process.stderr.write;
    access = fs.createWriteStream(fileName);

    process.stdout.write = process.stderr.write = access.write.bind(access);
    base
      .createConnection({ compress: compress })
      .then(conn => {
        conn
          .query("SELECT 1")
          .then(() => {
            if (compress && process.env.MAXSCALE_VERSION == undefined) {
              conn.debugCompress(true);
            } else {
              conn.debug(true);
            }
            return conn.query("SELECT 2");
          })
          .then(() => {
            if (compress && process.env.MAXSCALE_VERSION == undefined) {
              conn.debugCompress(false);
            } else {
              conn.debug(false);
            }
            return conn.query("SELECT 3");
          })
          .then(() => {
            return conn.end();
          })
          .then(() => {
            //wait 100ms to ensure stream has been written
            setTimeout(() => {
              const data = fs.readFileSync(fileName, { encoding: "utf8", flag: "r" });
              process.stdout.write = initialStdOut;
              process.stderr.write = initialStdErr;
              const serverVersion = conn.serverVersion();
              if (process.env.MAXSCALE_VERSION) compress = false;
              const rangeWithEOF = compress ? [470, 688] : [670, 730];
              const rangeWithoutEOF = compress ? [470, 500] : [570, 610];
              if (
                ((conn.info.isMariaDB() && conn.info.hasMinVersion(10, 2, 2)) ||
                  (!conn.info.isMariaDB() && conn.info.hasMinVersion(5, 7, 5))) &&
                !process.env.MAXSCALE_VERSION
              ) {
                assert(
                  data.length > rangeWithoutEOF[0] && data.length < rangeWithoutEOF[1],
                  "wrong data length : " +
                    data.length +
                    " expected value between " +
                    rangeWithoutEOF[0] +
                    " and " +
                    rangeWithoutEOF[1] +
                    "." +
                    "\n server version : " +
                    serverVersion +
                    "\n data :\n" +
                    data
                );
              } else {
                //EOF Packet make exchange bigger
                assert(
                  data.length > rangeWithEOF[0] && data.length < rangeWithEOF[1],
                  "wrong data length : " +
                    data.length +
                    " expected value between " +
                    rangeWithEOF[0] +
                    " and " +
                    rangeWithEOF[1] +
                    "." +
                    "\n server version : " +
                    serverVersion +
                    "\n data :\n" +
                    data
                );
              }
              process.stdout.write = initialStdOut;
              process.stderr.write = initialStdErr;
              access.end();
              fs.unlink(fileName, err => {});
              done();
            }, 100);
          })
          .catch(done);
      })
      .catch(done);
  }

  it("select big request (compressed data) debug", function(done) {
    if (process.env.MAXSCALE_VERSION) this.skip();
    const fileName = path.join(os.tmpdir(), "tmp.txt");
    initialStdOut = process.stdout.write;
    initialStdErr = process.stderr.write;
    access = fs.createWriteStream(fileName);

    const buf = Buffer.alloc(5000, "z");

    process.stdout.write = process.stderr.write = access.write.bind(access);
    base
      .createConnection({ compress: true, debugCompress: true })
      .then(conn => {
        conn
          .query("SELECT ?", buf)
          .then(rows => {
            //wait 100ms to ensure stream has been written
            setTimeout(() => {
              conn
                .end()
                .then(() => {
                  const data = fs.readFileSync(fileName, { encoding: "utf8", flag: "r" });
                  process.stdout.write = initialStdOut;
                  process.stderr.write = initialStdErr;
                  const serverVersion = conn.serverVersion();
                  let range = [820, 2400];
                  assert(
                    data.length > range[0] && data.length < range[1],
                    "wrong data length : " +
                      data.length +
                      " expected value between " +
                      range[0] +
                      " and " +
                      range[1] +
                      "." +
                      "\n server version : " +
                      serverVersion +
                      "\n data :\n" +
                      data
                  );
                  process.stdout.write = initialStdOut;
                  process.stderr.write = initialStdErr;
                  access.end();
                  fs.unlink(fileName, err => {});
                  done();
                })
                .catch(done);
            }, 100);
          })
          .catch(done);
      })
      .catch(done);
  });

  it("load local infile debug", function(done) {
    if (!permitLocalInfile) this.skip();
    testLocalInfileDebug(false, done);
  });

  it("load local infile debug compress", function(done) {
    if (!permitLocalInfile) this.skip();
    testLocalInfileDebug(true, done);
  });

  function testLocalInfileDebug(compress, done) {
    const fileName = path.join(os.tmpdir(), "tmp" + compress + ".txt");
    initialStdOut = process.stdout.write;
    initialStdErr = process.stderr.write;
    access = fs.createWriteStream(fileName);
    process.stdout.write = process.stderr.write = access.write.bind(access);
    base
      .createConnection({ permitLocalInfile: true, debug: true, compress: compress })
      .then(conn => {
        conn.query("CREATE TEMPORARY TABLE smallLocalInfile(id int, test varchar(100))");
        conn
          .query(
            "LOAD DATA LOCAL INFILE '" +
              smallFileName.replace(/\\/g, "/") +
              "' INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)"
          )
          .then(() => {
            return conn.end();
          })
          .then(() => {
            //wait 100ms to ensure stream has been written
            setTimeout(() => {
              const data = fs.readFileSync(fileName, { encoding: "utf8", flag: "r" });
              process.stdout.write = initialStdOut;
              process.stderr.write = initialStdErr;
              const serverVersion = conn.serverVersion();

              const range = [2800, 4090];
              assert(
                data.length > range[0] && data.length < range[1],
                "wrong data length : " +
                  data.length +
                  " expected value between " +
                  range[0] +
                  " and " +
                  range[1] +
                  "." +
                  "\n server version : " +
                  serverVersion +
                  "\n data :\n" +
                  data
              );
              process.stdout.write = initialStdOut;
              process.stderr.write = initialStdErr;
              access.end();
              fs.unlinkSync(fileName);
              done();
            }, 500);
          })
          .catch(done);
      })
      .catch(done);
  }
});
