//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB Corporation Ab

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

const big5 = {
  isHead: (b) => b >= 0xa1 && b <= 0xfe,
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
