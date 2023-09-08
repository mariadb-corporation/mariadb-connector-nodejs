//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2023 MariaDB Corporation Ab

'use strict';

const base = require('../base.js');
const { assert } = require('chai');

describe('server additional information API', () => {
  it('server version', async function () {
    if (
      process.env.srv === 'skysql' ||
      process.env.srv === 'skysql-ha' ||
      process.env.srv === 'maxscale' ||
      process.env.srv === 'build'
    )
      this.skip();

    const res = await shareConn.query('SELECT VERSION() a');
    assert.deepEqual(res, [{ a: shareConn.serverVersion() }]);
  });

  it('server type', function () {
    if (!process.env.srv) this.skip();
    assert.equal(process.env.srv !== 'mysql', shareConn.info.isMariaDB());
  });
});
