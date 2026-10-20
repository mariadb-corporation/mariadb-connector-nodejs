//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB plc

'use strict';

// Per-charset multibyte recognizers used by PacketOutputStream#writeBufferEscape
// to avoid splitting a valid multibyte character with an inserted escape byte.
//
// Only charsets whose trail-byte range overlaps the ASCII escape character (0x5C)
// are listed here. For them, a naïve byte-wise escape that inserts 0x5C before a
// quote/backslash inside arbitrary binary input can produce a wire sequence where
// the server lexer eats the inserted 0x5C as the trail byte of a multibyte
// character, leaving a bare quote that closes the string literal (SQL injection).
//
// See for the C reference :
// https://github.com/mariadb-corporation/mariadb-connector-c/blob/3.4/libmariadb/ma_charset.c
//

// head range stops at 0xF9 like the server (strings/ctype-big5.c) and Connector/C:
// 0xFA-0xFE are read by the server as single bytes (CONJS-379)
const big5 = {
  isHead: (b) => b >= 0xa1 && b <= 0xf9,
  length: (buf, i, n) => {
    if (i + 1 >= n) return 0;
    const t = buf[i + 1];
    return (t >= 0x40 && t <= 0x7e) || (t >= 0xa1 && t <= 0xfe) ? 2 : 0;
  }
};

const gbk = {
  isHead: (b) => b >= 0x81 && b <= 0xfe,
  length: (buf, i, n) => {
    if (i + 1 >= n) return 0;
    const t = buf[i + 1];
    return (t >= 0x40 && t <= 0x7e) || (t >= 0x80 && t <= 0xfe) ? 2 : 0;
  }
};

const sjis = {
  isHead: (b) => (b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xfc),
  length: (buf, i, n) => {
    if (i + 1 >= n) return 0;
    const t = buf[i + 1];
    return (t >= 0x40 && t <= 0x7e) || (t >= 0x80 && t <= 0xfc) ? 2 : 0;
  }
};

// cp932 shares sjis ranges
const cp932 = sjis;

const gbOdd = (b) => b >= 0x81 && b <= 0xfe;
const gbEven2 = (b) => (b >= 0x40 && b <= 0x7e) || (b >= 0x80 && b <= 0xfe);
const gbEven4 = (b) => b >= 0x30 && b <= 0x39;

const gb18030 = {
  isHead: gbOdd,
  length: (buf, i, n) => {
    if (i + 1 >= n) return 0;
    if (gbEven2(buf[i + 1])) return 2;
    if (i + 3 < n && gbEven4(buf[i + 1]) && gbOdd(buf[i + 2]) && gbEven4(buf[i + 3])) {
      return 4;
    }
    return 0;
  }
};

const recognizers = {
  big5: big5,
  gbk: gbk,
  sjis: sjis,
  cp932: cp932,
  gb18030: gb18030
};

export const getMbRecognizer = (encoding) => recognizers[encoding] || null;

const QUOTE = 0x27;
const SLASH = 0x5c;
const DBL_QUOTE = 0x22;
const ZERO_BYTE = 0x00;

/**
 * Charset-aware escape of bytes for a string literal (backslash mode): a valid multibyte
 * character is copied verbatim, a lone head byte is escaped so that it cannot absorb the next
 * byte, the quote, double quote, backslash and NUL are backslash-escaped.
 * Same algorithm as PacketOutputStream#writeBufferEscapeMb, for callers needing a Buffer.
 *
 * @param mb  recognizer of the charset
 * @param val bytes to escape
 * @returns {Buffer} escaped bytes
 */
export const escapeMb = (mb, val) => {
  const valLen = val.length;
  const out = Buffer.allocUnsafe(valLen * 2);
  let pos = 0;
  let i = 0;
  while (i < valLen) {
    const b = val[i];
    if (mb.isHead(b)) {
      const mbLen = mb.length(val, i, valLen);
      if (mbLen >= 2) {
        for (let j = 0; j < mbLen; j++) out[pos++] = val[i + j];
        i += mbLen;
        continue;
      }
      out[pos++] = SLASH;
      out[pos++] = b;
      i++;
      continue;
    }
    if (b === QUOTE || b === SLASH || b === DBL_QUOTE || b === ZERO_BYTE) out[pos++] = SLASH;
    out[pos++] = b;
    i++;
  }
  return out.subarray(0, pos);
};
