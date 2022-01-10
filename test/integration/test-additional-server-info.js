'use strict';

const base = require('../base.js');
const { assert } = require('chai');

describe('server additional information API', () => {
  it('server version', function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha') this.skip();
    shareConn
      .query('SELECT VERSION() a')
      .then((res) => {
        assert.deepEqual(res, [{ a: shareConn.serverVersion() }]);
        done();
      })
      .catch(done);
  });

  it('server type', function () {
    if (!process.env.srv) this.skip();
    assert.equal(process.env.srv !== 'mysql', shareConn.info.isMariaDB());
  });
});
