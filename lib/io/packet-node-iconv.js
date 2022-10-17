'use strict';

const Packet = require('./packet');
const Iconv = require('iconv-lite');

class PacketIconvEncoded extends Packet {
  constructor(encoding) {
    super();
    this.encoding = encoding;
  }

  clone() {
    return new PacketIconvEncoded(this.encoding).update(this.buf, this.pos, this.end);
  }

  readStringLengthEncoded() {
    const len = this.readUnsignedLength();
    if (len === null) return null;

    this.pos += len;
    return Iconv.decode(this.buf.slice(this.pos - len, this.pos), this.encoding);
  }

  readString(buf, beg, len) {
    return Iconv.decode(buf.slice(beg, beg + len), this.encoding);
  }

  subPacketLengthEncoded() {
    const len = this.readUnsignedLength();
    this.skip(len);
    return new PacketIconvEncoded(this.encoding).update(this.buf, this.pos - len, this.pos);
  }

  readStringRemaining() {
    const str = Iconv.decode(this.buf.slice(this.pos, this.end), this.encoding);
    this.pos = this.end;
    return str;
  }
}

module.exports = PacketIconvEncoded;
