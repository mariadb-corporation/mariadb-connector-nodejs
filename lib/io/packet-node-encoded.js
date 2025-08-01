//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import Packet from './packet.js';

class PacketNodeEncoded extends Packet {
  constructor(encoding) {
    super();
    // using undefined for utf8 permit to avoid node.js searching
    // for charset, using directly utf8 default one.
    this.encoding = encoding === 'utf8' ? undefined : encoding;
  }

  readStringLengthEncoded() {
    const len = this.readUnsignedLength();
    if (len === null) return null;

    this.pos += len;
    return this.buf.toString(this.encoding, this.pos - len, this.pos);
  }

  static readString(encoding, buf, beg, len) {
    return buf.toString(encoding, beg, beg + len);
  }

  subPacketLengthEncoded(len) {
    this.skip(len);
    return new PacketNodeEncoded(this.encoding).update(this.buf, this.pos - len, this.pos);
  }

  readStringRemaining() {
    const str = this.buf.toString(this.encoding, this.pos, this.end);
    this.pos = this.end;
    return str;
  }
}

export default PacketNodeEncoded;
