//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB plc

'use strict';

import { assert, describe, test } from 'vitest';
import EventEmitter from 'node:events';
import PacketOutputStream from '../../../lib/io/packet-output-stream.js';
import Collations from '../../../lib/const/collations.js';
import { getMbRecognizer } from '../../../lib/misc/charset-mb.js';

// Escaping under big5 / gbk / sjis / cp932 / gb18030, checked against the SERVER's definition
// of the charsets (strings/ctype-*.c), not the connector's recognizer: a lead byte the
// connector takes for a head but the server reads alone (big5 0xFA-0xFE, CONJS-379) lets an
// inserted 0x5C be eaten as an escape and a bare quote end the literal.

const QUOTE = 0x27;
const SLASH = 0x5c;

// server-side lexer definitions (strings/ctype-big5.c, ctype-gbk.c, ctype-sjis.c, ctype-cp932.c;
// gb18030 as in MySQL ctype-gb18030.cc)
const SERVER = {
  big5: {
    head: (b) => b >= 0xa1 && b <= 0xf9,
    len: (w, i) => ((w[i + 1] >= 0x40 && w[i + 1] <= 0x7e) || (w[i + 1] >= 0xa1 && w[i + 1] <= 0xfe) ? 2 : 1)
  },
  gbk: {
    head: (b) => b >= 0x81 && b <= 0xfe,
    len: (w, i) => ((w[i + 1] >= 0x40 && w[i + 1] <= 0x7e) || (w[i + 1] >= 0x80 && w[i + 1] <= 0xfe) ? 2 : 1)
  },
  sjis: {
    head: (b) => (b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xfc),
    len: (w, i) => ((w[i + 1] >= 0x40 && w[i + 1] <= 0x7e) || (w[i + 1] >= 0x80 && w[i + 1] <= 0xfc) ? 2 : 1)
  },
  gb18030: {
    head: (b) => b >= 0x81 && b <= 0xfe,
    len: (w, i) => {
      const t = w[i + 1];
      if ((t >= 0x40 && t <= 0x7e) || (t >= 0x80 && t <= 0xfe)) return 2;
      if (t >= 0x30 && t <= 0x39 && w[i + 2] >= 0x81 && w[i + 2] <= 0xfe && w[i + 3] >= 0x30 && w[i + 3] <= 0x39)
        return 4;
      return 1;
    }
  }
};
SERVER.cp932 = SERVER.sjis;

/** true when the server lexer meets a quote that ends the literal before the end of wire */
export function serverFindsBareQuote(wire, charset) {
  const lex = SERVER[charset];
  let i = 0;
  while (i < wire.length) {
    const b = wire[i];
    if (lex.head(b) && i + 1 < wire.length) {
      i += lex.len(wire, i);
      continue;
    }
    if (b === SLASH) {
      i += 2;
      continue;
    }
    if (b === QUOTE) return true;
    i++;
  }
  return false;
}

export function makeOut(charset) {
  const opts = Object.assign(new EventEmitter(), {
    collation: Collations.fromCharset(charset),
    debug: false,
    maxAllowedPacket: 16777216
  });
  const out = new PacketOutputStream(opts, { threadId: 0, status: 0 });
  out.pos = 4;
  return out;
}

export const wireOf = (out, write) => {
  const start = out.pos;
  write();
  return Buffer.from(out.buf.subarray(start, out.pos));
};

export const CHARSETS = ['big5', 'gbk', 'sjis', 'cp932', 'gb18030'];
const TAIL = Buffer.from(' OR 1=1 -- ', 'latin1');

describe('multibyte charset escaping against the server lexer', () => {
  for (const charset of CHARSETS) {
    test(`${charset}: every lead byte followed by 0x5C 0x27 stays inside the literal (Buffer)`, () => {
      const out = makeOut(charset);
      const bad = [];
      for (let lead = 0x80; lead <= 0xff; lead++) {
        const attack = Buffer.concat([Buffer.from([lead, SLASH, QUOTE]), TAIL]);
        const wire = wireOf(out, () => out.writeBufferEscape(attack));
        if (serverFindsBareQuote(wire, charset)) bad.push(lead.toString(16));
        out.pos = 4;
      }
      assert.deepEqual(bad, [], `${charset}: injecting lead bytes`);
    });

    test(`${charset}: every lead byte followed by 0x27 stays inside the literal (Buffer)`, () => {
      const out = makeOut(charset);
      const bad = [];
      for (let lead = 0x80; lead <= 0xff; lead++) {
        const wire = wireOf(out, () => out.writeBufferEscape(Buffer.concat([Buffer.from([lead, QUOTE]), TAIL])));
        if (serverFindsBareQuote(wire, charset)) bad.push(lead.toString(16));
        out.pos = 4;
      }
      assert.deepEqual(bad, [], `${charset}: injecting lead bytes`);
    });
  }

  test('big5: lead bytes 0xFA-0xFE are single bytes, as for the server', () => {
    const mb = getMbRecognizer('big5');
    for (let lead = 0xfa; lead <= 0xfe; lead++) assert.isFalse(mb.isHead(lead), lead.toString(16));
    assert.isTrue(mb.isHead(0xf9));
    assert.isTrue(mb.isHead(0xa1));
  });
});
