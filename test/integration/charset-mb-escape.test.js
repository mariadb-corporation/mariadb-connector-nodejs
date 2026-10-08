//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB plc

'use strict';

import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import { createConnection, isMaxscale } from '../base.js';
import Conf from '../conf.js';

// Under big5, a Buffer with lead byte 0xFA-0xFE (not a head for the server, CONJS-379) could end
// the string literal: a statement naming only mbEscapeUsers must never return a mbEscapeVault row.
describe('multibyte charset escaping', () => {
  let shareConn;
  const INJECTION = "' UNION SELECT id, secret FROM mbEscapeVault -- ";
  const withLead = (lead) =>
    Buffer.concat([Buffer.from([lead, 0x5c, 0x27]), Buffer.from(INJECTION.slice(1), 'latin1')]);

  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
    await shareConn.query('DROP TABLE IF EXISTS mbEscapeUsers');
    await shareConn.query('DROP TABLE IF EXISTS mbEscapeVault');
    await shareConn.query('CREATE TABLE mbEscapeUsers (id INT, name VARCHAR(64), avatar BLOB)');
    await shareConn.query("INSERT INTO mbEscapeUsers VALUES (1,'alice',NULL),(2,'bob',NULL)");
    await shareConn.query('CREATE TABLE mbEscapeVault (id INT, secret VARCHAR(64))');
    await shareConn.query("INSERT INTO mbEscapeVault VALUES (99,'must not leak')");
  });

  afterAll(async () => {
    await shareConn.query('DROP TABLE IF EXISTS mbEscapeUsers');
    await shareConn.query('DROP TABLE IF EXISTS mbEscapeVault');
    await shareConn.end();
  });

  test('big5: Buffer parameter stays inside the literal whatever its lead byte', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const conn = await createConnection({ charset: 'big5' });
    try {
      const sql = 'SELECT id, name FROM mbEscapeUsers WHERE avatar = ?';
      for (const lead of [0xa1, 0xf9, 0xfa, 0xfb, 0xfe]) {
        assert.deepEqual(await conn.query(sql, [withLead(lead)]), [], `Buffer lead 0x${lead.toString(16)}`);
      }
      // valid big5 characters are not altered
      const rows = await conn.query('SELECT ? AS v', [Buffer.from([0xa4, 0x40, 0x27, 0xf9, 0x5c])]);
      assert.deepEqual([...rows[0].v], [0xa4, 0x40, 0x27, 0xf9, 0x5c]);
    } finally {
      await conn.end();
    }
  });
});
