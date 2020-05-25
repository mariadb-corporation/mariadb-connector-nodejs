'use strict';

const { assert } = require('chai');

describe('boolean type', () => {
  it('boolean escape', function (done) {
    const buf = true;
    assert.equal(shareConn.escape(buf), 'true');
    assert.equal(shareConn.escape(false), 'false');

    shareConn
      .query(' SELECT ' + shareConn.escape(buf) + ' t')
      .then((rows) => {
        assert.deepEqual(rows, [{ t: 1 }]);
        done();
      })
      .catch(done);
  });
});
