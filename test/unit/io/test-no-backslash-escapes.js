//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB Corporation Ab

'use strict';

const { assert } = require('chai');
const EventEmitter = require('node:events');
const PacketOutputStream = require('../../../lib/io/packet-output-stream');
const Collations = require('../../../lib/const/collations');
const Utils = require('../../../lib/misc/utils');
const ServerStatus = require('../../../lib/const/server-status');
const ConnOptions = require('../../../lib/config/connection-options');
const ConnectionInformation = require('../../../lib/misc/connection-information');

// When the session runs with NO_BACKSLASH_ESCAPES, backslash is an ordinary
// character server-side. Escaping a quote as \' therefore leaves the quote
// closing the string literal, and any text-protocol parameter becomes
// injectable. The quote must be doubled instead, as Connector/C and
// Connector/J do (CONJS-368).

const NBE = ServerStatus.STATUS_NO_BACKSLASH_ESCAPES;

function makeOut(charset, status) {
  const opts = Object.assign(new EventEmitter(), {
    collation: Collations.fromCharset(charset),
    debug: false,
    maxAllowedPacket: 16777216
  });
  const out = new PacketOutputStream(opts, { threadId: 0, status });
  out.pos = 4;
  return out;
}

function escapedString(charset, status, str) {
  const out = makeOut(charset, status);
  const start = out.pos;
  out.writeStringEscapeQuote(str);
  return out.buf.subarray(start, out.pos).toString('latin1');
}

function escapedBuffer(charset, status, buf) {
  const out = makeOut(charset, status);
  const start = out.pos;
  out.writeBufferEscape(buf);
  return out.buf.subarray(start, out.pos).toString('latin1');
}

describe('NO_BACKSLASH_ESCAPES escaping', () => {
  // utf8 uses writeUtf8StringEscapeQuote, latin1 writeDefaultStringEscapeQuote
  ['utf8mb4', 'latin1'].forEach((charset) => {
    it(`${charset}: quote is doubled, backslash left alone`, () => {
      assert.equal(escapedString(charset, NBE, "a'b"), "'a''b'");
      assert.equal(escapedString(charset, NBE, 'a\\b'), "'a\\b'");
      assert.equal(escapedString(charset, NBE, "a\\'b"), "'a\\''b'");
    });

    it(`${charset}: default mode still escapes with backslash`, () => {
      assert.equal(escapedString(charset, 0, "a'b"), "'a\\'b'");
      assert.equal(escapedString(charset, 0, 'a\\b'), "'a\\\\b'");
    });

    it(`${charset}: injection payload cannot close the literal`, () => {
      // a bare quote would end the literal and let "OR 1=1 --" be parsed as SQL
      const escaped = escapedString(charset, NBE, "x' OR 1=1 -- ");
      assert.equal(escaped, "'x'' OR 1=1 -- '");
      // every quote inside the literal body must be part of a doubled pair
      const body = escaped.slice(1, -1);
      assert.notMatch(body, /(^|[^'])'([^']|$)/);
    });
  });

  it('long string (buffer path) is escaped with doubled quotes', () => {
    const long = "z'".repeat(5000);
    const escaped = escapedString('utf8mb4', NBE, long);
    assert.equal(escaped.indexOf("''"), 2);
    assert.notInclude(escaped, "\\'");
  });

  it('buffer parameter: quote doubled, backslash untouched', () => {
    assert.equal(escapedBuffer('latin1', NBE, Buffer.from("a'b\\c")), "a''b\\c");
    assert.equal(escapedBuffer('latin1', 0, Buffer.from("a'b\\c")), "a\\'b\\\\c");
  });

  it('multi-byte charset: no backslash emitted, quote doubled', () => {
    // 0xa4 is a big5 head byte; 0x5c would be its trail. No escape byte may be
    // inserted, and the following quote must be doubled.
    const escaped = escapedBuffer('big5', NBE, Buffer.from([0xa4, 0x27, 0x41]));
    assert.notInclude(escaped, '\\');
    assert.equal(escaped, "¤''A");
  });

  it('conn.escape() honours the flag', () => {
    const opts = new ConnOptions({});
    const info = new ConnectionInformation(opts);

    info.status = 0;
    assert.equal(Utils.escape(opts, info, "x' OR 1=1 -- "), "'x\\' OR 1=1 -- '");

    info.status = NBE;
    assert.equal(Utils.escape(opts, info, "x' OR 1=1 -- "), "'x'' OR 1=1 -- '");
    assert.equal(Utils.escape(opts, info, 'a\\b'), "'a\\b'");
  });

  it('escape() tolerates a missing info (pool with no connection yet)', () => {
    const opts = new ConnOptions({});
    assert.equal(Utils.escape(opts, null, "a'b"), "'a\\'b'");
    assert.equal(Utils.escape(opts, {}, "a'b"), "'a\\'b'");
  });
});
