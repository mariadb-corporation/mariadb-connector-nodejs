'use strict';

const Packet = require('./packet');
const Iconv = require('iconv-lite');

class PacketIconvEncoded extends Packet {
  constructor(buf, pos, end, encoding) {
    super(buf, pos, end);
    this.encoding = encoding;
  }

  readStringLength() {
    const len = this.readUnsignedLength();
    if (len === null) return null;

    this.pos += len;
    return Iconv.decode(this.buf.slice(this.pos - len, this.pos), this.encoding);
  }

  readString(beg, len) {
    return Iconv.decode(this.buf.slice(beg, beg + len), this.encoding);
  }

  subPacketLengthEncoded() {
    const len = this.readUnsignedLength();
    this.skip(len);
    return new PacketIconvEncoded(this.buf, this.pos - len, this.pos, this.encoding);
  }

  readStringRemaining() {
    const str = Iconv.decode(this.buf.slice(this.pos, this.end), this.encoding);
    this.pos = this.end;
    return str;
  }
}

module.exports = PacketIconvEncoded;
