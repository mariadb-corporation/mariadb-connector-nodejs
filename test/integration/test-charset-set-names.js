//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB plc

'use strict';

const base = require('../base.js');
const { assert } = require('chai');

// The handshake never reports an unknown collation: the server silently keeps utf8mb4 while the
// connector encodes and escapes for the requested charset (CONJS-381). A configured collation is
// now always sent with SET NAMES, so an unsupported charset is refused by the server.
describe('charset confirmed with SET NAMES', () => {
  it('gb18030: refused by a server that does not support it', async function () {
    if (base.isMaxscale()) this.skip();
    let conn;
    try {
      conn = await base.createConnection({ charset: 'gb18030' });
    } catch (err) {
      // MariaDB: SET NAMES gb18030 is refused by the server
      assert.isTrue(shareConn.info.isMariaDB(), err.message);
      assert.equal(err.errno, 1115, err.message);
      assert.include(err.message, "Unknown character set: 'gb18030'");
      return;
    }
    try {
      assert.isFalse(shareConn.info.isMariaDB(), 'gb18030 must be refused on MariaDB');
      // MySQL supports it: the session must really use it
      const rows = await conn.query('SELECT @@character_set_client AS cs');
      assert.equal(rows[0].cs, 'gb18030');
    } finally {
      await conn.end();
    }
  });

  it('gb18030: SET NAMES is refused by MariaDB', async function () {
    if (base.isMaxscale() || !shareConn.info.isMariaDB()) this.skip();
    const conn = await base.createConnection();
    try {
      await conn.query('SET NAMES gb18030');
      throw new Error('must have thrown an error');
    } catch (err) {
      assert.equal(err.errno, 1115, err.message);
      assert.include(err.message, "Unknown character set: 'gb18030'");
      // the session is unchanged after the refused SET NAMES
      const rows = await conn.query('SELECT @@character_set_client AS cs');
      assert.equal(rows[0].cs, 'utf8mb4');
    } finally {
      await conn.end();
    }
  });

  it('requested charset is confirmed by the server', async function () {
    if (base.isMaxscale()) this.skip();
    for (const charset of ['big5', 'latin1']) {
      const conn = await base.createConnection({ charset });
      try {
        const rows = await conn.query('SELECT @@character_set_client AS cs, @@collation_connection AS col');
        assert.equal(rows[0].cs, charset);
        assert.equal(rows[0].col, conn.info.collation.name.toLowerCase());
      } finally {
        await conn.end();
      }
    }
  });
});
