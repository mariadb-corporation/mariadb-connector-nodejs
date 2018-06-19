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

  it("select request debug", function(done) {
    process.stdout.write = process.stderr.write = access.write.bind(access);

    base
      .createConnection()
      .then(conn => {
        conn
          .query("SELECT 1")
          .then(() => {
            conn.debug(true);
            return conn.query("SELECT 2");
          })
          .then(() => {
            conn.debug(false);
            return conn.query("SELECT 3");
          })
          .then(() => {
            //wait 100ms to ensure stream has been written
            setTimeout(() => {
              const data = fs.readFileSync(fileName, { encoding: "utf8", flag: "r" });
              process.stdout.write = initialStdOut;
              process.stderr.write = initialStdErr;
              const serverVersion = conn.serverVersion();
              const rangeWithEOF = Conf.baseConfig.compress ? [470, 500] : [680, 710];
              const rangeWithoutEOF = Conf.baseConfig.compress ? [470, 500] : [572, 590];
              conn
                .end()
                .then(() => {
                  if (
                    (conn.isMariaDB() && conn.hasMinVersion(10, 2, 2)) ||
                    (!conn.isMariaDB() && conn.hasMinVersion(5, 7, 5))
                  ) {
                    assert.isTrue(
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
                    assert.isTrue(
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
                  fs.truncateSync(fileName, 0);
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
    process.stdout.write = process.stderr.write = access.write.bind(access);

    shareConn
      .query("select @@local_infile")
      .then(rows => {
        if (rows[0]["@@local_infile"] === 0) {
          self.skip();
        }
        return new Promise(function(resolve, reject) {
          fs.writeFile(smallFileName, "1,hello\n2,world\n", "utf8", function(err) {
            if (err) reject(err);
            else resolve();
          });
        });
      })
      .then(() => {
        base
          .createConnection({ permitLocalInfile: true, debug: true })
          .then(conn => {
            conn.query("CREATE TEMPORARY TABLE smallLocalInfile(id int, test varchar(100))");
            conn
              .query(
                "LOAD DATA LOCAL INFILE '" +
                  smallFileName.replace(/\\/g, "/") +
                  "' INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)"
              )
              .then(() => {
                //wait 100ms to ensure stream has been written
                setTimeout(() => {
                  const data = fs.readFileSync(fileName, { encoding: "utf8", flag: "r" });
                  process.stdout.write = initialStdOut;
                  process.stderr.write = initialStdErr;
                  const serverVersion = conn.serverVersion();
                  conn.end();
                  const rangeWithEOF = Conf.baseConfig.compress ? [4450, 4470] : [4390, 4430];
                  const rangeWithoutEOF = Conf.baseConfig.compress ? [4450, 4470] : [4280, 4330];
                  if (
                    (conn.isMariaDB() && conn.hasMinVersion(10, 2, 2)) ||
                    (!conn.isMariaDB() && conn.hasMinVersion(5, 7, 5))
                  ) {
                    assert.isTrue(
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
                    assert.isTrue(
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
                  conn
                    .end()
                    .then(() => {
                      fs.unlink(smallFileName, err => {});
                      fs.truncateSync(fileName, 0);
                      done();
                    })
                    .catch(done);
                }, 100);
              })
              .catch(done);
          })
          .catch(done);
      })
      .catch(done);
  });
});
