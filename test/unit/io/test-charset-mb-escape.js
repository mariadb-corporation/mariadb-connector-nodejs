//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB plc

'use strict';

const { assert } = require('chai');
const EventEmitter = require('node:events');
const Iconv = require('iconv-lite');
const PacketOutputStream = require('../../../lib/io/packet-output-stream');
const Collations = require('../../../lib/const/collations');
const ConnOptions = require('../../../lib/config/connection-options');
const ConnectionInformation = require('../../../lib/misc/connection-information');
const Utils = require('../../../lib/misc/utils');
const { getMbRecognizer, escapeMb } = require('../../../lib/misc/charset-mb');

// Escaping under big5 / gbk / sjis / cp932 / gb18030, checked against the SERVER's definition
// of the charsets (strings/ctype-*.c), not the connector's recognizer: a lead byte the
// connector takes for a head but the server reads alone (big5 0xFA-0xFE, CONJS-379) lets an
// inserted 0x5C be eaten as an escape and a bare quote end the literal.
// Also for strings (CONJS-380): the encoder (iconv-lite's big5 is Big5-HKSCS) produces sequences
// the server reads as single bytes, so the escape must be applied to the encoded bytes.

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
function serverFindsBareQuote(wire, charset) {
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

function makeOut(charset) {
  const opts = Object.assign(new EventEmitter(), {
    collation: Collations.fromCharset(charset),
    debug: false,
    maxAllowedPacket: 16777216
  });
  const out = new PacketOutputStream(opts, { threadId: 0, status: 0 });
  out.pos = 4;
  return out;
}

const wireOf = (out, write) => {
  const start = out.pos;
  write();
  return Buffer.from(out.buf.subarray(start, out.pos));
};

const makeInfo = (charset) => {
  const info = new ConnectionInformation(new ConnOptions({}));
  info.status = 0;
  info.collation = Collations.fromCharset(charset);
  return info;
};

const CHARSETS = ['big5', 'gbk', 'sjis', 'cp932', 'gb18030'];
const TAIL = Buffer.from(' OR 1=1 -- ', 'latin1');

describe('multibyte charset escaping against the server lexer', () => {
  for (const charset of CHARSETS) {
    it(`${charset}: every lead byte followed by 0x5C 0x27 stays inside the literal (Buffer)`, () => {
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

    it(`${charset}: every lead byte followed by 0x27 stays inside the literal (Buffer)`, () => {
      const out = makeOut(charset);
      const bad = [];
      for (let lead = 0x80; lead <= 0xff; lead++) {
        const wire = wireOf(out, () => out.writeBufferEscape(Buffer.concat([Buffer.from([lead, QUOTE]), TAIL])));
        if (serverFindsBareQuote(wire, charset)) bad.push(lead.toString(16));
        out.pos = 4;
      }
      assert.deepEqual(bad, [], `${charset}: injecting lead bytes`);
    });

    it(`${charset}: every encodable character followed by a quote stays inside the literal (string)`, function () {
      this.timeout(30000);
      const out = makeOut(charset);
      const opts = new ConnOptions({});
      const info = makeInfo(charset);
      const bad = [];
      const badEscape = [];
      for (let cp = 0x80; cp < 0x10000; cp++) {
        if (cp >= 0xd800 && cp <= 0xdfff) continue;
        const ch = String.fromCharCode(cp);
        const enc = Iconv.encode(ch, charset);
        // not encodable: iconv replaces by '?'
        if (enc.length === 1 && enc[0] === 0x3f) continue;
        const str = ch + "' OR 1=1 -- ";
        // parameter of a text-protocol query: quotes included
        const wire = wireOf(out, () => out.writeStringEscapeQuote(str));
        if (serverFindsBareQuote(wire.subarray(1, wire.length - 1), charset)) bad.push(cp.toString(16));
        out.pos = 4;
        // escape(): the application sends the returned string, encoded with the session charset
        const escaped = Iconv.encode(Utils.escape(opts, info, str), charset);
        if (serverFindsBareQuote(escaped.subarray(1, escaped.length - 1), charset)) badEscape.push(cp.toString(16));
      }
      assert.deepEqual(bad, [], `${charset}: injecting code points in query parameter`);
      assert.deepEqual(badEscape, [], `${charset}: injecting code points in escape()`);
    });

    it(`${charset}: escape() gives the same bytes as the parameter escaping`, () => {
      const out = makeOut(charset);
      const opts = new ConnOptions({});
      const info = makeInfo(charset);
      for (const str of ["a'b", 'a\\b', "园'x", '一"\\\u0000z', "Ě'", "日本語の'テスト\\", 'plain']) {
        const wire = wireOf(out, () => out.writeStringEscapeQuote(str));
        out.pos = 4;
        assert.equal(Utils.escape(opts, info, str), Iconv.decode(wire, charset), JSON.stringify(str));
      }
    });
  }

  it('escapeMb(): valid multibyte character verbatim, lone head and specials escaped', () => {
    const mb = getMbRecognizer('big5');
    assert.deepEqual([...escapeMb(mb, Buffer.from([0xa1, 0x5c, QUOTE]))], [0xa1, 0x5c, SLASH, QUOTE]);
    assert.deepEqual([...escapeMb(mb, Buffer.from([0xfa, 0x5c, QUOTE]))], [0xfa, SLASH, SLASH, SLASH, QUOTE]);
    assert.deepEqual([...escapeMb(mb, Buffer.from([0xa1]))], [SLASH, 0xa1]);
    assert.deepEqual([...escapeMb(mb, Buffer.from('ab'))], [0x61, 0x62]);
  });

  it('big5: lead bytes 0xFA-0xFE are single bytes, as for the server', () => {
    const mb = getMbRecognizer('big5');
    for (let lead = 0xfa; lead <= 0xfe; lead++) assert.isFalse(mb.isHead(lead), lead.toString(16));
    assert.isTrue(mb.isHead(0xf9));
    assert.isTrue(mb.isHead(0xa1));
  });

  it('utf8mb4 and latin1: the session collation keeps the character escaping', () => {
    for (const charset of ['utf8mb4', 'latin1']) {
      const info = makeInfo(charset);
      assert.equal(Utils.escape(new ConnOptions({}), info, "一'x\\y"), "'一\\'x\\\\y'", charset);
    }
  });
});
