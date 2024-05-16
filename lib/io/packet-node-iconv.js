//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

const Packet = require('./packet');
const Iconv = require('iconv-lite');

class PacketIconvEncoded extends Packet {
  constructor(encoding) {
    super();
    this.encoding = encoding;
  }

  readStringLengthEncoded() {
    const len = this.readUnsignedLength();
    if (len === null) return null;

    this.pos += len;
    return Iconv.decode(this.buf.subarray(this.pos - len, this.pos), this.encoding);
  }

  static readString(encoding, buf, beg, len) {
    return Iconv.decode(buf.subarray(beg, beg + len), encoding);
  }

  subPacketLengthEncoded(len) {
    this.skip(len);
    return new PacketIconvEncoded(this.encoding).update(this.buf, this.pos - len, this.pos);
  }

  readStringRemaining() {
    const str = Iconv.decode(this.buf.subarray(this.pos, this.end), this.encoding);
    this.pos = this.end;
    return str;
  }
}

module.exports = PacketIconvEncoded;
