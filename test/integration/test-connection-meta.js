"use strict";

const base = require("../base.js");
const assert = require("chai").assert;

describe("Connection meta", function() {
  it("server version", () => {
    const serverVersion = shareConn.serverVersion();
    if (process.env.DB) {
      if (process.env.DB === "build") {
        //last mariadb build version
        assert(serverVersion.startsWith("10.3"));
      } else {
        const version =
          process.platform === "win32"
            ? process.env.DB
            : process.env.DB.substr(process.env.DB.indexOf(":") + 1);
        assert(serverVersion.startsWith(version));
      }
    }
  });

  it("server version before connect error", done => {
    const conn = base.createCallbackConnection();
    try {
      conn.serverVersion();
      done(new Error("Must have thrown exception"));
    } catch (err) {
      assert(
        err.message.includes("cannot know if server information until connection is established")
      );
      conn.connect(conn.end);
      done();
    }
  });

  it("isMariaDB", () => {
    const isMariadb = shareConn.isMariaDB();
    if (process.env.DB) {
      if (process.env.DB === "build") {
        assert(isMariadb);
      } else {
        //Appveyor test only mariadb, travis use docker image with DB=mariadb/mysql:version
        assert.equal(
          isMariadb,
          process.platform === "win32" || process.env.DB.startsWith("mariadb")
        );
      }
    }
  });

  it("isMariaDB before connect error", done => {
    const conn = base.createCallbackConnection();
    try {
      conn.isMariaDB();
      done(new Error("Must have thrown exception"));
    } catch (err) {
      assert(
        err.message.includes("cannot know if server is MariaDB until connection is established")
      );
      conn.connect(conn.end);
      done();
    }
  });

  it("hasMinVersion before connect error", done => {
    const conn = base.createCallbackConnection();
    try {
      conn.hasMinVersion();
      done(new Error("Must have thrown exception"));
    } catch (err) {
      assert(err.message.includes("cannot know if server version until connection is established"));
      conn.connect(conn.end);
      done();
    }
  });

  it("hasMinVersion", () => {
    try {
      shareConn.hasMinVersion();
      throw new Error("Must have thrown exception");
    } catch (err) {
      assert(err.message.includes("a major version must be set"));
    }

    assert(shareConn.hasMinVersion(3));
    assert(shareConn.hasMinVersion(3, 4));
    assert(shareConn.hasMinVersion(3, 4, 10));
    assert(!shareConn.hasMinVersion(13));
    assert(!shareConn.hasMinVersion(13, 5));
    assert(!shareConn.hasMinVersion(13, 5, 20));
  });
});
