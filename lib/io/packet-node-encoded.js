'use strict';

const Packet = require('./packet');

class PacketNodeEncoded extends Packet {
  constructor(buf, pos, end, encoding) {
    super(buf, pos, end);
    this.encoding = encoding;
  }

  readStringLength() {
    const len = this.readUnsignedLength();
    if (len === null) return null;

    this.pos += len;
    return this.buf.toString(this.encoding, this.pos - len, this.pos);
  }

  readString(beg, len) {
    return this.buf.toString(this.encoding, beg, beg + len);
  }

  subPacketLengthEncoded() {
    const len = this.readUnsignedLength();
    this.skip(len);
    return new PacketNodeEncoded(this.buf, this.pos - len, this.pos, this.encoding);
  }

  readStringRemaining() {
    const str = this.buf.toString(this.encoding, this.pos, this.end);
    this.pos = this.end;
    return str;
  }
}

module.exports = PacketNodeEncoded;
