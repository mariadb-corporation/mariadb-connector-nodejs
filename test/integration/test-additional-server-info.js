//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const { isMaxscale } = require('../base');

describe('server additional information API', () => {
  it('server version', async function () {
    if (isMaxscale()) this.skip();

    const res = await shareConn.query('SELECT VERSION() a');
    assert.deepEqual(res, [{ a: shareConn.serverVersion() }]);
  });

  it('server type', function () {
    if (!process.env.DB_TYPE) this.skip();
    assert.equal(process.env.DB_TYPE !== 'mysql', shareConn.info.isMariaDB());
  });
});
