"use strict";

const Utils = require("../misc/utils");
const Iconv = require("iconv-lite");
const Long = require("long");

/**
 * Object to easily parse buffer.
 *
 */
class Packet {
  constructor(buf, off, end) {
    this.buf = buf;
    this.off = off;
    this.end = end;
  }

  skip(n) {
    this.off += n;
  }

  peek() {
    return this.buf[this.off];
  }

  remaining() {
    return this.end - this.off > 0;
  }

  readInt8() {
    return this.buf[this.off++];
  }

  readUInt8() {
    return this.buf[this.off++] & 0xff;
  }

  readUInt16() {
    this.off += 2;
    return this.buf.readUInt16LE(this.off - 2, true);
  }

  readUInt24() {
    return (
      (this.buf[this.off++] & 0xff) +
      ((this.buf[this.off++] & 0xff) << 8) +
      ((this.buf[this.off++] & 0xff) << 16)
    );
  }

  readUInt32() {
    this.off += 4;
    return this.buf.readUInt32LE(this.off - 4, true);
  }

  readUInt64(signed) {
    const first = this.readUInt32();
    const second = this.readUInt32();
    if (second >= 0x00200000) {
      //more than than 2^53-1
      return new Long(first, second, !signed);
    }
    //do not use Left shift!
    return first + second * 0x100000000;
  }

  readBuffer(len) {
    this.off += len;
    return this.buf.slice(this.off - len, this.off);
  }

  readBufferRemaining() {
    let b = this.buf.slice(this.off, this.end);
    this.off = this.end;
    return b;
  }

  readBufferNullEnded() {
    let initialPosition = this.off;
    let cnt = 0;
    while (this.remaining() > 0 && this.buf[this.off++] != 0) {
      cnt++;
    }
    return this.buf.slice(initialPosition, cnt);
  }

  readBufferLengthEncoded() {
    const len = this.readLength(false);
    if (len === null) return null;
    this.off += len;
    return this.buf.slice(this.off - len, this.off);
  }

  readStringNullEnded() {
    let initialPosition = this.off;
    let cnt = 0;
    while (this.remaining() > 0 && this.buf[this.off++] != 0) {
      cnt++;
    }

    return this.buf.toString("utf8", initialPosition, initialPosition + cnt);
  }

  readLength(signed) {
    const type = this.readUInt8();
    switch (type) {
      case 0xfb:
        return null;
      case 0xfc:
        return this.readUInt16();
      case 0xfd:
        return this.readUInt24();
      case 0xfe:
        return this.readUInt64(signed);
      default:
        return type;
    }
  }

  readStringLengthEncoded(encoding) {
    const len = this.readLength(false);
    if (len === null) return null;

    this.off += len;
    if (Buffer.isEncoding(encoding)) {
      return this.buf.toString(encoding, this.off - len, this.off);
    }
    return Iconv.decode(this.buf.slice(this.off - len, this.off), encoding);
  }

  readLongLengthEncoded(supportBigNumbers, bigNumberStrings, unsigned) {
    const len = this.readLength(false);
    if (len === null) return null;

    if (bigNumberStrings) {
      //return as string
      this.off += len;
      return this.buf.toString("ascii", this.off - len, this.off);
    }

    let result = 0;
    let negate = false;
    let begin = this.off;

    //minus sign
    if (len > 0 && this.buf[begin] === 45) {
      negate = true;
      begin++;
    }
    for (; begin < this.off + len; begin++) {
      result = result * 10 + (this.buf[begin] - 48);
    }

    let val = negate ? -1 * result : result;
    this.off += len;

    if (!Number.isSafeInteger(val) && supportBigNumbers) {
      const str = this.buf.toString("ascii", this.off - len, this.off);
      return Long.fromString(str, unsigned, 10);
    } else {
      return val;
    }
  }

  readDecimalLengthEncoded(supportBigNumbers, bigNumberStrings) {
    const len = this.readLength(false);
    if (len === null) return null;

    this.off += len;
    let str = this.buf.toString("ascii", this.off - len, this.off);
    return bigNumberStrings ? str : parseFloat(str);
  }

  readDate() {
    const len = this.readLength(false);
    if (len === null) return null;

    let res = [];
    let value = 0;
    let initPos = this.off;
    this.off += len;
    while (initPos < this.off) {
      const char = this.buf[initPos++];
      if (char === 45) {
        //minus separator
        res.push(value);
        value = 0;
      } else {
        value = value * 10 + char - 48;
      }
    }
    res.push(value);

    //handle zero-date as null
    if (res[0] === 0 && res[1] === 0 && res[2] === 0) return null;

    return new Date(res[0], res[1] - 1, res[2]);
  }

  readDateTime() {
    const len = this.readLength(false);
    if (len === null) return null;
    this.off += len;
    const str = this.buf.toString("ascii", this.off - len, this.off);
    if (str.startsWith("0000-00-00 00:00:00")) return null;
    return new Date(str);
  }

  readIntLengthEncoded() {
    const len = this.readLength(false);
    if (len === null) return null;

    let result = 0;
    let negate = false;
    let begin = this.off;

    if (len > 0 && this.buf[begin] === 45) {
      //minus sign
      negate = true;
      begin++;
    }
    for (; begin < this.off + len; begin++) {
      result = result * 10 + (this.buf[begin] - 48);
    }
    this.off += len;
    return negate ? -1 * result : result;
  }

  readFloatLengthCoded() {
    const len = this.readLength(false);

    if (len === 0 || !len) {
      return len;
    }

    let result = 0;
    let end = this.off + len;
    let factor = 1;
    let dotfactor = 1;
    let resultDot = 0;
    let charCode = 0;

    //-
    if (this.buf[this.off] === 45) {
      this.off++;
      factor = -1;
    }

    //+
    if (this.buf[this.off] === 43) {
      this.off++; // just ignore
    }

    while (this.off < end) {
      charCode = this.buf[this.off];
      if (charCode === 46) {
        //dot
        this.off++;

        dotfactor = 1;
        while (this.off < end) {
          dotfactor *= 10;
          resultDot *= 10;
          resultDot += this.buf[this.off++] - 48;
        }
      } else {
        result *= 10;
        result += this.buf[this.off++] - 48;
      }
    }

    return factor * (result + resultDot / dotfactor);
  }

  skipLengthCodedNumber() {
    var type = this.buf[this.off++] & 0xff;
    switch (type) {
      case 251:
        return;
      case 252:
        this.off +=
          2 + (0xffff & ((this.buf[this.off] & 0xff) + ((this.buf[this.off + 1] & 0xff) << 8)));
      case 253:
        this.off +=
          3 +
          (0xffffff &
            ((this.buf[this.off] & 0xff) +
              ((this.buf[this.off + 1] & 0xff) << 8) +
              ((this.buf[this.off + 2] & 0xff) << 16)));
      case 254:
        this.off +=
          8 +
          ((this.buf[this.off] & 0xff) +
            ((this.buf[this.off + 1] & 0xff) << 8) +
            ((this.buf[this.off + 2] & 0xff) << 16) +
            ((this.buf[this.off + 3] & 0xff) << 24) +
            ((this.buf[this.off + 4] & 0xff) << 32) +
            ((this.buf[this.off + 5] & 0xff) << 40) +
            ((this.buf[this.off + 6] & 0xff) << 48) +
            ((this.buf[this.off + 7] & 0xff) << 56));
      default:
        this.off += type & 0xff;
        return;
    }
  }

  positionFromEnd(num) {
    this.off = this.end - num;
  }

  /**
   * For testing purpose only
   */
  _toBuf() {
    return this.buf.slice(this.off, this.end);
  }

  forceOffset(off) {
    this.off = off;
  }

  length() {
    return this.end - this.off;
  }

  subPacketLengthEncoded() {
    const len = this.readLength(false);
    this.skip(len);
    return new Packet(this.buf, this.off - len, this.off);
  }

  /**
   * Parse ERR_Packet : https://mariadb.com/kb/en/library/err_packet/
   *
   * @param info  current connection info
   * @param sql   command sql
   * @returns {Error}
   */
  readError(info, sql) {
    this.skip(1);
    let errorCode = this.readUInt16();
    let sqlState = "";

    if (this.peek() === 0x23) {
      this.skip(6);
      sqlState = this.buf.toString("utf8", this.off - 5, this.off);
    }

    let msg = this.buf.toString("utf8", this.off);
    if (sql) msg += "\n" + sql;
    let fatal = sqlState.startsWith("08") || sqlState === "70100";
    return Utils.createError(msg, fatal, info, errorCode, sqlState);
  }
}

module.exports = Packet;
