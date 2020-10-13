'use strict';

const base = require('../base.js');
const { assert } = require('chai');

describe('server additional information API', () => {
  it('server version', function (done) {
    shareConn
      .query('SELECT VERSION() a')
      .then((res) => {
        if (process.env.MAXSCALE_VERSION) {
          //maxscale version is set to 10.5.99-MariaDB-maxScale
          assert.deepEqual(shareConn.serverVersion(), '10.5.99-MariaDB-maxScale');
        } else {
          assert.deepEqual(res, [{ a: shareConn.serverVersion() }]);
        }
        done();
      })
      .catch(done);
  });

  it('server type', function () {
    if (!process.env.DB) this.skip();
    if (process.env.DB.indexOf(':') != -1) {
      const serverInfo = process.env.DB.split(':');
      assert.equal(serverInfo[0] === 'mariadb', shareConn.info.isMariaDB());
    } else {
      //appveyor use mariadb only
      assert(shareConn.info.isMariaDB());
    }
  });
});
