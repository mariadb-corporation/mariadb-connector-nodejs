//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

const base = require('../../base');
const { assert } = require('chai');

describe('boolean type', () => {
  it('boolean escape', async function () {
    const buf = true;
    assert.equal(shareConn.escape(buf), 'true');
    assert.equal(shareConn.escape(false), 'false');

    let rows = await shareConn.query({
      sql: ' SELECT ' + shareConn.escape(buf) + ' t',
      bigIntAsNumber: true
    });
    assert.equal(rows[0].t, 1);

    rows = await shareConn.query("SELECT '1' t");
    assert.equal(rows[0].t, '1');
  });

  it('boolean escape binary', async function () {
    const buf = true;
    assert.equal(shareConn.escape(buf), 'true');
    assert.equal(shareConn.escape(false), 'false');
    const rows = await shareConn.execute(' SELECT ? t', [buf]);
    assert.isTrue(rows[0].t === 1 || rows[0].t === 1n);
  });
});
