//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB plc

'use strict';

import { assert, describe, test } from 'vitest';
import { createConnection } from '../base.js';

// A string parameter of 32 chars or more with nothing to escape is written by the native encoder,
// the others by the escaping loop: the server must receive the same value either way, in both
// escape modes. The double quote is no longer escaped inside the literal.
describe('string parameter escaping', () => {
  const ascii = (n) => 'abcdefghij'.repeat(Math.ceil(n / 10)).slice(0, n);
  // whole characters only: slicing a surrogate pair would make an invalid string
  const unicode = (n) => Array.from('héllo wörld 日本語 🎤🥂 '.repeat(n)).slice(0, n).join('');
  const obj = { stg: ascii(50), quote: 'a"b', apos: "it's", n: 1, nested: { arr: [1, 'x\\y'] } };

  const VALUES = [
    '',
    'a',
    ascii(31),
    ascii(32),
    ascii(33),
    ascii(100),
    // beyond the initial 256-byte buffer, then beyond the 16k and 128k buffers
    ascii(300),
    ascii(20000),
    ascii(200000),
    unicode(40),
    unicode(5000),
    ascii(31) + "'",
    ascii(32) + "'",
    "'" + ascii(40),
    ascii(40) + '\\',
    ascii(40) + '\0',
    ascii(40) + '\u001a',
    'a"b',
    ascii(40) + '"' + ascii(40),
    '{"id":2,"val":"t\'est"}',
    JSON.stringify(obj),
    ascii(40) + '\n\r\t',
    "x' OR 1=1 -- " + ascii(40),
    ascii(40) + " OR '1'='1"
  ];

  for (const mode of ['', 'NO_BACKSLASH_ESCAPES']) {
    test(`text protocol round-trips identically to binary protocol (sql_mode='${mode}')`, async () => {
      const conn = await createConnection();
      try {
        await conn.query(`SET SESSION sql_mode='${mode}'`);
        await conn.query('DROP TABLE IF EXISTS strEscapeFastPath');
        await conn.query('CREATE TABLE strEscapeFastPath (id INT, v LONGTEXT) CHARSET utf8mb4');
        for (let i = 0; i < VALUES.length; i++) {
          await conn.query('INSERT INTO strEscapeFastPath VALUES (?, ?)', [i, VALUES[i]]);
        }
        await conn.query('INSERT INTO strEscapeFastPath VALUES (?, ?)', [VALUES.length, obj]);

        const rows = await conn.execute('SELECT id, v FROM strEscapeFastPath ORDER BY id');
        assert.equal(rows.length, VALUES.length + 1);
        for (let i = 0; i < VALUES.length; i++) {
          assert.equal(rows[i].v, VALUES[i], `value ${i}`);
        }
        assert.equal(rows[VALUES.length].v, JSON.stringify(obj));

        // the escaped text parameter selects exactly what the binary parameter does
        for (let i = 0; i < VALUES.length; i++) {
          const text = await conn.query('SELECT id FROM strEscapeFastPath WHERE v = ? ORDER BY id', [VALUES[i]]);
          const binary = await conn.execute('SELECT id FROM strEscapeFastPath WHERE v = ? ORDER BY id', [VALUES[i]]);
          assert.deepEqual(
            text.map((r) => r.id),
            binary.map((r) => r.id),
            `value ${i}`
          );
          assert.include(
            text.map((r) => r.id),
            i,
            `value ${i}`
          );
        }
        await conn.query('DROP TABLE strEscapeFastPath');
      } finally {
        await conn.end();
      }
    });
  }
});
