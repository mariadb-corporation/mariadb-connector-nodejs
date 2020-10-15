'use strict';

const base = require('../base.js');
const assert = require('chai').assert;

describe('Connection meta', function () {
  it('server version', () => {
    const serverVersion = shareConn.serverVersion();
    if (process.env.DB) {
      if (process.env.DB === 'build') {
        //last mariadb build version
        assert(serverVersion.startsWith('10.5'));
      } else {
        const version =
          process.env.DB.indexOf(':') != -1
            ? process.env.DB.substr(process.env.DB.indexOf(':') + 1)
            : process.env.DB;
        assert(serverVersion.startsWith(version), serverVersion + '/' + version);
      }
    }
  });

  it('server version before connect error', (done) => {
    const conn = base.createCallbackConnection();
    try {
      conn.serverVersion();
      done(new Error('Must have thrown exception'));
    } catch (err) {
      assert(
        err.message.includes('cannot know if server information until connection is established')
      );
      conn.connect(conn.end);
      done();
    }
  });

  it('isMariaDB', () => {
    const isMariadb = shareConn.info.isMariaDB();
    if (process.env.DB) {
      if (process.env.DB === 'build') {
        assert(isMariadb);
      } else {
        //Appveyor test only mariadb, travis use docker image with DB=mariadb/mysql:version
        assert.equal(
          isMariadb,
          process.platform === 'win32' || process.env.DB.startsWith('mariadb')
        );
      }
    }
  });

  it('isMariaDB before connect error', (done) => {
    const conn = base.createCallbackConnection();
    try {
      conn.info.isMariaDB();
      done(new Error('Must have thrown exception'));
    } catch (err) {
      assert(
        err.message.includes('cannot know if server is MariaDB until connection is established')
      );
      conn.connect(conn.end);
      done();
    }
  });

  it('info.hasMinVersion before connect error', (done) => {
    const conn = base.createCallbackConnection();
    try {
      conn.info.hasMinVersion();
      done(new Error('Must have thrown exception'));
    } catch (err) {
      assert(err.message.includes('cannot know if server version until connection is established'));
      conn.connect(conn.end);
      done();
    }
  });

  it('info.hasMinVersion', () => {
    try {
      shareConn.info.hasMinVersion();
      throw new Error('Must have thrown exception');
    } catch (err) {
      assert(err.message.includes('a major version must be set'));
    }

    assert(shareConn.info.hasMinVersion(3));
    assert(shareConn.info.hasMinVersion(3, 4));
    assert(shareConn.info.hasMinVersion(3, 4, 10));
    assert(!shareConn.info.hasMinVersion(13));
    assert(!shareConn.info.hasMinVersion(13, 5));
    assert(!shareConn.info.hasMinVersion(13, 5, 20));
  });
});
