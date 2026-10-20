//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB plc

'use strict';

import { assert, describe, test } from 'vitest';
import EventEmitter from 'node:events';
import PacketOutputStream from '../../../lib/io/packet-output-stream.js';
import Collations from '../../../lib/const/collations.js';
import * as ServerStatus from '../../../lib/const/server-status.js';

// A string parameter of 32 chars or more with nothing to escape is written by the native encoder,
// the others by the escaping loop: the bytes must be the same either way, in both escape modes.
// The double quote is not escaped: it has no meaning inside a single-quoted literal.

const BACKSLASH_MODE = 0;
const NBE_MODE = ServerStatus.STATUS_NO_BACKSLASH_ESCAPES;

const makeOut = (status) => {
  const opts = Object.assign(new EventEmitter(), {
    collation: Collations.fromIndex(224),
    debug: false,
    maxAllowedPacket: 16777216
  });
  const out = new PacketOutputStream(opts, { threadId: 0, status });
  out.pos = 4;
  return out;
};

const wireOf = (out, write) => {
  const start = out.pos;
  write();
  return Buffer.from(out.buf.subarray(start, out.pos));
};

/** what the server lexer expects, written independently of the connector */
const expected = (status, str) =>
  "'" + (status === NBE_MODE ? str.replace(/'/g, "''") : str.replace(/['\\\0]/g, (c) => '\\' + c)) + "'";

const ascii = (n) => 'abcdefghij'.repeat(Math.ceil(n / 10)).slice(0, n);
const unicode = (n) => Array.from('héllo wörld 日本語 🎤🥂 '.repeat(n)).slice(0, n).join('');

const VALUES = [
  '',
  'a',
  ascii(31),
  ascii(32),
  ascii(33),
  ascii(100),
  // beyond the initial 256-byte buffer, then beyond the 16k buffer
  ascii(300),
  ascii(20000),
  unicode(31),
  unicode(32),
  unicode(5000),
  'a"b',
  ascii(40) + '"' + ascii(40),
  '{"id":2,"val":"t\'est"}',
  JSON.stringify({ stg: ascii(50), quote: 'a"b', n: 1, nested: { arr: [1, 'x\\y'] } }),
  ascii(40) + '\n\r\t\u001a\b',
  "x' OR 1=1 -- " + ascii(40)
];
for (const n of [31, 32, 33]) {
  for (const special of ["'", '\\', '\0']) {
    VALUES.push(special + ascii(n - 1), ascii(n - 1) + special, ascii(15) + special + ascii(n - 16));
  }
}

describe('string parameter escaping', () => {
  for (const [name, status] of [
    ['backslash escapes', BACKSLASH_MODE],
    ['NO_BACKSLASH_ESCAPES', NBE_MODE]
  ]) {
    test(`${name}: same bytes from the native encoder and the escaping loop`, () => {
      for (const str of VALUES) {
        const out = makeOut(status);
        const wire = wireOf(out, () => out.writeStringEscapeQuote(str));
        assert.equal(wire.toString('utf8'), expected(status, str), JSON.stringify(str.slice(0, 50)));
      }
    });

    test(`${name}: the native encoder is used with nothing to escape, from 32 chars with backslash escapes`, () => {
      const nativeCalls = (str) => {
        const out = makeOut(status);
        let calls = 0;
        const original = out.writeDefaultBufferString;
        out.writeDefaultBufferString = function (s) {
          calls++;
          return original.call(this, s);
        };
        out.writeStringEscapeQuote(str);
        return calls;
      };
      // with NO_BACKSLASH_ESCAPES the native encoder wins at every length
      assert.equal(nativeCalls(''), status === NBE_MODE ? 1 : 0);
      assert.equal(nativeCalls(ascii(31)), status === NBE_MODE ? 1 : 0);
      assert.equal(nativeCalls(ascii(32)), 1);
      assert.equal(nativeCalls(unicode(32)), 1);
      assert.equal(nativeCalls(ascii(32) + '"'), 1);
      assert.equal(nativeCalls(ascii(32) + "'"), 0);
      // with NO_BACKSLASH_ESCAPES, the backslash and NUL are ordinary characters
      assert.equal(nativeCalls(ascii(32) + '\\'), status === NBE_MODE ? 1 : 0);
      assert.equal(nativeCalls(ascii(32) + '\0'), status === NBE_MODE ? 1 : 0);
    });

    test(`${name}: the double quote is not escaped, for a string or a Buffer`, () => {
      const out = makeOut(status);
      assert.equal(wireOf(out, () => out.writeStringEscapeQuote('a"b')).toString(), "'a\"b'");
      assert.equal(wireOf(out, () => out.writeBufferEscape(Buffer.from('a"b'))).toString(), 'a"b');
    });
  }
});
