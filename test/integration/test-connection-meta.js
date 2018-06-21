"use strict";

const base = require("../base.js");
const assert = require("chai").assert;

describe("Connection meta", function() {
  it("server version", () => {
    const serverVersion = shareConn.serverVersion();
    if (process.env.DB) {
      if (process.env.DB === "build") {
        //last mariadb build version
        assert.isTrue(serverVersion.startsWith("10.3"));
      } else {
        const version = process.env.DB.substr(process.env.DB.indexOf(":") + 1);
        assert.isTrue(serverVersion.startsWith(version));
      }
    }
  });

  it("server version before connect error", done => {
    const conn = base.createCallbackConnection();
    try {
      conn.serverVersion();
      done(new Error("Must have thrown exception"));
    } catch (err) {
      assert.isTrue(
        err.message.includes("cannot know if server information until connection is established")
      );
      done();
    }
  });

  it("isMariaDB", () => {
    const isMariadb = shareConn.isMariaDB();
    if (process.env.DB) {
      if (process.env.DB === "build") {
        assert.isTrue(isMariadb);
      } else {
        assert.equal(isMariadb, process.env.DB.startsWith("mariadb"));
      }
    }
  });

  it("isMariaDB before connect error", done => {
    const conn = base.createCallbackConnection();
    try {
      conn.isMariaDB();
      done(new Error("Must have thrown exception"));
    } catch (err) {
      assert.isTrue(
        err.message.includes("cannot know if server is MariaDB until connection is established")
      );
      done();
    }
  });

  it("hasMinVersion before connect error", done => {
    const conn = base.createCallbackConnection();
    try {
      conn.hasMinVersion();
      done(new Error("Must have thrown exception"));
    } catch (err) {
      assert.isTrue(
        err.message.includes("cannot know if server version until connection is established")
      );
      done();
    }
  });

  it("hasMinVersion", () => {
    try {
      shareConn.hasMinVersion();
      throw new Error("Must have thrown exception");
    } catch (err) {
      assert.isTrue(err.message.includes("a major version must be set"));
    }

    assert.isTrue(shareConn.hasMinVersion(3));
    assert.isTrue(shareConn.hasMinVersion(3, 4));
    assert.isTrue(shareConn.hasMinVersion(3, 4, 10));
    assert.isFalse(shareConn.hasMinVersion(13));
    assert.isFalse(shareConn.hasMinVersion(13, 5));
    assert.isFalse(shareConn.hasMinVersion(13, 5, 20));
  });
});
