//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB plc

'use strict';

import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import { createConnection, isMaxscale } from '../base.js';
import Conf from '../conf.js';

// Under big5, a Buffer with lead byte 0xFA-0xFE (not a head for the server, CONJS-379) or a
// string with a character iconv-lite encodes as Big5-HKSCS (U+56ED -> FB 5C, CONJS-380) could end
// the string literal: a statement naming only mbEscapeUsers must never return a mbEscapeVault row.
// gb18030 is unknown to MariaDB (CONJS-381): the server silently stayed on utf8mb4 while the
// connector escaped for gb18030.
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

  test('big5: string parameter and escape() stay inside the literal', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const conn = await createConnection({ charset: 'big5' });
    try {
      const sql = 'SELECT id, name FROM mbEscapeUsers WHERE avatar = ?';
      for (const ch of ['\u56ed', '\u6a9d', '\u011a', '\u4e00']) {
        assert.deepEqual(await conn.query(sql, [ch + INJECTION]), [], `string ${ch}`);
        assert.deepEqual(
          await conn.query('SELECT id, name FROM mbEscapeUsers WHERE avatar = ' + conn.escape(ch + INJECTION)),
          [],
          `escape(${ch})`
        );
      }
      // values are not altered
      const rows = await conn.query('SELECT ? AS v, ? AS w', ["\u4e00'x\\y", conn.escape("\u4e00'z")]);
      assert.equal(rows[0].v, "\u4e00'x\\y");
      assert.equal(rows[0].w, "'\u4e00\\'z'");
    } finally {
      await conn.end();
    }
  });

  test('gb18030: refused by a server that does not support it', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    let conn;
    try {
      conn = await createConnection({ charset: 'gb18030' });
    } catch (err) {
      // MariaDB: SET NAMES gb18030 is refused by the server
      assert.isTrue(shareConn.info.isMariaDB(), err.message);
      assert.equal(err.errno, 1115, err.message);
      assert.include(err.message, "Unknown character set: 'gb18030'");
      return;
    }
    assert.isFalse(shareConn.info.isMariaDB(), 'gb18030 must be refused on MariaDB');
    try {
      // MySQL supports it: the session must really use it
      const rows = await conn.query('SELECT @@character_set_client AS cs');
      assert.equal(rows[0].cs, 'gb18030');
      assert.deepEqual(await conn.query('SELECT id, name FROM mbEscapeUsers WHERE avatar = ?', [withLead(0x81)]), []);
    } finally {
      await conn.end();
    }
  });

  test('gb18030: SET NAMES is refused by MariaDB', async ({ skip }) => {
    if (isMaxscale(shareConn) || !shareConn.info.isMariaDB()) return skip();
    // the handshake never reports an unknown collation: SET NAMES is what makes the server answer
    const conn = await createConnection();
    try {
      await conn.query('SET NAMES gb18030');
      throw new Error('must have thrown an error');
    } catch (err) {
      assert.equal(err.errno, 1115, err.message);
      assert.include(err.message, "Unknown character set: 'gb18030'");
    } finally {
      await conn.end();
    }
    // the session is unchanged after the refused SET NAMES
    const conn2 = await createConnection();
    try {
      await conn2.query('SET NAMES gb18030').catch(() => {});
      const rows = await conn2.query('SELECT @@character_set_client AS cs');
      assert.equal(rows[0].cs, 'utf8mb4');
    } finally {
      await conn2.end();
    }
  });

  test('requested charset is confirmed by the server', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    for (const charset of ['big5', 'latin1']) {
      const conn = await createConnection({ charset });
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
