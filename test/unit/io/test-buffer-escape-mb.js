//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB Corporation Ab

'use strict';

const EventEmitter = require('events');
const { assert } = require('chai');
const PacketOutputStream = require('../../../lib/io/packet-output-stream');
const Collations = require('../../../lib/const/collations');
const { getMbRecognizer } = require('../../../lib/misc/charset-mb');

// Regression for the SQL injection vector:
// under big5 / gbk / sjis / cp932 / gb18030 character_set_client, a byte-wise
// escape that inserts 0x5C ('\\') before 0x27 ('\'') can produce a wire
// sequence whose server-side lexer reads the inserted 0x5C as the trail byte
// of a multi-byte character, leaving 0x27 as a bare quote that closes the
// string literal.

const QUOTE = 0x27;
const SLASH = 0x5c;

function makeOut(charset) {
  const opts = Object.assign(new EventEmitter(), {
    collation: Collations.fromCharset(charset),
    debug: false,
    maxAllowedPacket: 16777216
  });
  const info = { threadId: 0 };
  const out = new PacketOutputStream(opts, info);
  // Drive the bytes into a fresh slot so .pos at start of escape is known.
  out.pos = 4;
  return out;
}

function escapedBytes(out, buf) {
  const start = out.pos;
  out.writeBufferEscape(buf);
  return Buffer.from(out.buf.subarray(start, out.pos));
}

// Reproduce the server's mb-aware lexer pass: walk the wire bytes, consuming
// a multi-byte char when isHead+length matches, otherwise interpreting an
// unescaped 0x27 as the closing quote. Returns true if a bare quote is found
// (i.e. the attacker successfully broke out of the string literal).
function lexerEscapesQuote(wire, mb) {
  let i = 0;
  while (i < wire.length) {
    const b = wire[i];
    if (mb.isHead(b)) {
      const mbLen = mb.length(wire, i, wire.length);
      if (mbLen >= 2) {
        i += mbLen;
        continue;
      }
      // server treats lone head + next byte as one bad char; but the key
      // question is whether 0x5C-then-0x27 forms a valid mb char.
      // Fall through and treat as single byte.
    }
    if (b === SLASH) {
      // escape: consume next byte literally (no quote-close possible)
      i += 2;
      continue;
    }
    if (b === QUOTE) {
      return true;
    }
    i++;
  }
  return false;
}

describe('writeBufferEscape mb-aware', () => {
  for (const charset of ['big5', 'gbk', 'sjis', 'cp932', 'gb18030']) {
    it(`${charset}: lone head + quote does not break out of string`, () => {
      // Pick a head byte that's valid for every listed charset (0xA1).
      // Trail 0x27 is not valid in any of them, so this is the canonical
      // attack input: a lone head byte followed by a quote.
      const attack = Buffer.from([0xa1, QUOTE, 0x20, 0x4f, 0x52, 0x20, 0x31, 0x3d, 0x31]); // A1 ' OR 1=1
      const out = makeOut(charset);
      const wire = escapedBytes(out, attack);
      const mb = getMbRecognizer(charset);
      assert.isFalse(
        lexerEscapesQuote(wire, mb),
        `${charset}: wire ${wire.toString('hex')} still allows quote to close string`
      );
    });

    it(`${charset}: valid mb char is preserved verbatim, not escaped`, () => {
      // Pick a definitely-valid mb char for each charset.
      let mbChar;
      switch (charset) {
        case 'big5':
          mbChar = Buffer.from([0xa1, 0x40]); // valid big5
          break;
        case 'gbk':
          mbChar = Buffer.from([0x81, 0x40]); // valid gbk
          break;
        case 'sjis':
        case 'cp932':
          mbChar = Buffer.from([0x81, 0x40]); // valid sjis/cp932
          break;
        case 'gb18030':
          mbChar = Buffer.from([0x81, 0x40]); // valid 2-byte gb18030
          break;
      }
      const out = makeOut(charset);
      const wire = escapedBytes(out, mbChar);
      // No escape was inserted; the two bytes pass through.
      assert.equal(wire.length, 2);
      assert.equal(wire[0], mbChar[0]);
      assert.equal(wire[1], mbChar[1]);
    });

    it(`${charset}: 0x5C inside a valid mb char trail is not double-escaped`, () => {
      // Charsets where 0x5C is a valid trail byte: a real mb char like
      // (head, 0x5C) must survive escape untouched.
      let mbChar;
      switch (charset) {
        case 'big5':
          mbChar = Buffer.from([0xa1, 0x5c]); // valid big5 trail (0x40-0x7E)
          break;
        case 'gbk':
        case 'sjis':
        case 'cp932':
        case 'gb18030':
          mbChar = Buffer.from([0x81, 0x5c]); // valid trail in all of them
          break;
      }
      const out = makeOut(charset);
      const wire = escapedBytes(out, mbChar);
      assert.deepEqual([...wire], [...mbChar], `${charset}: 0x5C trail was unnecessarily escaped`);
    });
  }

  it('utf8mb4: still uses fast path (no charset-aware loop)', () => {
    const out = makeOut('utf8mb4');
    // Plain quote should still be escaped; 0xC2 0xA1 (¡ in utf-8) is irrelevant
    // — utf8 trail bytes are 0x80-0xBF, never 0x5C, so the fast path is safe.
    const wire = escapedBytes(out, Buffer.from([0xc2, 0xa1, QUOTE]));
    assert.deepEqual([...wire], [0xc2, 0xa1, SLASH, QUOTE]);
  });

  it('big5: trailing lone head byte at end of buffer is escaped', () => {
    const out = makeOut('big5');
    const wire = escapedBytes(out, Buffer.from([0xa1]));
    // 0xA1 alone has no trail — must be escaped so it can't combine with
    // whatever the caller writes next (e.g. the closing quote of _BINARY '...').
    assert.deepEqual([...wire], [SLASH, 0xa1]);
  });
});
