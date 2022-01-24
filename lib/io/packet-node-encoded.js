'use strict';

const Packet = require('./packet');

class PacketNodeEncoded extends Packet {
  constructor(encoding) {
    super();
    // using undefined for utf8 permit to avoid node.js searching
    // for charset, using directly utf8 default one.
    this.encoding = encoding === 'utf8' ? undefined : encoding;
  }

  clone() {
    return new PacketNodeEncoded(this.encoding).update(this.buf, this.pos, this.end);
  }

  readStringLengthEncoded() {
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
    return new PacketNodeEncoded(this.encoding).update(this.buf, this.pos - len, this.pos);
  }

  readStringRemaining() {
    const str = this.buf.toString(this.encoding, this.pos, this.end);
    this.pos = this.end;
    return str;
  }
}

module.exports = PacketNodeEncoded;
