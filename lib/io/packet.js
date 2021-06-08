'use strict';

const Errors = require('../misc/errors');
const Iconv = require('iconv-lite');
const Long = require('long');
const moment = require('moment-timezone');

/**
 * Object to easily parse buffer.
 *
 */
class Packet {
  constructor(buf, pos, end) {
    this.buf = buf;
    this.pos = pos;
    this.end = end;
  }

  skip(n) {
    this.pos += n;
  }

  readGeometry(dataTypeName) {
    const geoBuf = this.readBufferLengthEncoded();
    if (geoBuf === null || geoBuf.length === 0) {
      if (dataTypeName) {
        switch (dataTypeName) {
          case 'point':
            return { type: 'Point' };
          case 'linestring':
            return { type: 'LineString' };
          case 'polygon':
            return { type: 'Polygon' };
          case 'multipoint':
            return { type: 'MultiPoint' };
          case 'multilinestring':
            return { type: 'MultiLineString' };
          case 'multipolygon':
            return { type: 'MultiPolygon' };
          default:
            return { type: dataTypeName };
        }
      }
      return null;
    }
    let geoPos = 4;
    return readGeometryObject(false);

    function parseCoordinates(byteOrder) {
      geoPos += 16;
      const x = byteOrder ? geoBuf.readDoubleLE(geoPos - 16) : geoBuf.readDoubleBE(geoPos - 16);
      const y = byteOrder ? geoBuf.readDoubleLE(geoPos - 8) : geoBuf.readDoubleBE(geoPos - 8);
      return [x, y];
    }

    function readGeometryObject(inner) {
      const byteOrder = geoBuf[geoPos++];
      const wkbType = byteOrder ? geoBuf.readInt32LE(geoPos) : geoBuf.readInt32BE(geoPos);
      geoPos += 4;
      switch (wkbType) {
        case 1: //wkbPoint
          const coords = parseCoordinates(byteOrder);

          if (inner) return coords;
          return {
            type: 'Point',
            coordinates: coords
          };

        case 2: //wkbLineString
          const pointNumber = byteOrder ? geoBuf.readInt32LE(geoPos) : geoBuf.readInt32BE(geoPos);
          geoPos += 4;
          let coordinates = [];
          for (let i = 0; i < pointNumber; i++) {
            coordinates.push(parseCoordinates(byteOrder));
          }
          if (inner) return coordinates;
          return {
            type: 'LineString',
            coordinates: coordinates
          };

        case 3: //wkbPolygon
          let polygonCoordinates = [];
          const numRings = byteOrder ? geoBuf.readInt32LE(geoPos) : geoBuf.readInt32BE(geoPos);
          geoPos += 4;
          for (let ring = 0; ring < numRings; ring++) {
            const pointNumber = byteOrder ? geoBuf.readInt32LE(geoPos) : geoBuf.readInt32BE(geoPos);
            geoPos += 4;
            let linesCoordinates = [];
            for (let i = 0; i < pointNumber; i++) {
              linesCoordinates.push(parseCoordinates(byteOrder));
            }
            polygonCoordinates.push(linesCoordinates);
          }

          if (inner) return polygonCoordinates;
          return {
            type: 'Polygon',
            coordinates: polygonCoordinates
          };

        case 4: //wkbMultiPoint
          return {
            type: 'MultiPoint',
            coordinates: parseGeomArray(byteOrder, true)
          };

        case 5: //wkbMultiLineString
          return {
            type: 'MultiLineString',
            coordinates: parseGeomArray(byteOrder, true)
          };
        case 6: //wkbMultiPolygon
          return {
            type: 'MultiPolygon',
            coordinates: parseGeomArray(byteOrder, true)
          };
        case 7: //wkbGeometryCollection
          return {
            type: 'GeometryCollection',
            geometries: parseGeomArray(byteOrder, false)
          };
      }
      return null;
    }

    function parseGeomArray(byteOrder, inner) {
      let coordinates = [];
      const number = byteOrder ? geoBuf.readInt32LE(geoPos) : geoBuf.readInt32BE(geoPos);
      geoPos += 4;
      for (let i = 0; i < number; i++) {
        coordinates.push(readGeometryObject(inner));
      }
      return coordinates;
    }
  }

  peek() {
    return this.buf[this.pos];
  }

  remaining() {
    return this.end - this.pos > 0;
  }

  readUInt8() {
    return this.buf[this.pos++];
  }

  readUInt16() {
    return this.buf[this.pos++] + (this.buf[this.pos++] << 8);
  }

  readUInt24() {
    return this.buf[this.pos++] + (this.buf[this.pos++] << 8) + (this.buf[this.pos++] << 16);
  }

  readUInt32() {
    return (
      this.buf[this.pos++] +
      (this.buf[this.pos++] << 8) +
      (this.buf[this.pos++] << 16) +
      this.buf[this.pos++] * 0x1000000
    );
  }

  readInt32() {
    return (
      this.buf[this.pos++] +
      (this.buf[this.pos++] << 8) +
      (this.buf[this.pos++] << 16) +
      (this.buf[this.pos++] << 24)
    );
  }

  readInt32LE() {
    return (
      (this.buf[this.pos++] << 24) +
      (this.buf[this.pos++] << 16) +
      (this.buf[this.pos++] << 8) +
      this.buf[this.pos++]
    );
  }

  readInt64() {
    // could use readBigInt64LE when support would be 10.20+
    const val =
      this.buf[this.pos + 4] +
      this.buf[this.pos + 5] * 2 ** 8 +
      this.buf[this.pos + 6] * 2 ** 16 +
      (this.buf[this.pos + 7] << 24);
    const vv =
      (BigInt(val) << BigInt(32)) +
      BigInt(
        this.buf[this.pos] +
          this.buf[this.pos + 1] * 2 ** 8 +
          this.buf[this.pos + 2] * 2 ** 16 +
          this.buf[this.pos + 3] * 2 ** 24
      );
    this.pos += 8;
    return vv;
  }

  readUnsignedLength() {
    const type = this.buf[this.pos++] & 0xff;
    switch (type) {
      case 0xfb:
        return null;
      case 0xfc:
        return this.readUInt16();
      case 0xfd:
        return this.readUInt24();
      case 0xfe:
        // limitation to BigInt signed value
        return Number(this.readInt64());
      default:
        return type;
    }
  }

  readBuffer(len) {
    this.pos += len;
    return this.buf.slice(this.pos - len, this.pos);
  }

  readBufferRemaining() {
    let b = this.buf.slice(this.pos, this.end);
    this.pos = this.end;
    return b;
  }

  readBufferLengthEncoded() {
    const len = this.readUnsignedLength();
    if (len === null) return null;
    this.pos += len;
    return this.buf.slice(this.pos - len, this.pos);
  }

  readStringNullEnded() {
    let initialPosition = this.pos;
    let cnt = 0;
    while (this.remaining() > 0 && this.buf[this.pos++] !== 0) {
      cnt++;
    }
    return this.buf.toString('utf8', initialPosition, initialPosition + cnt);
  }

  readSignedLength() {
    const type = this.buf[this.pos++];
    switch (type) {
      case 0xfb:
        return null;
      case 0xfc:
        return this.readUInt16();
      case 0xfd:
        return this.readUInt24();
      case 0xfe:
        return Number(this.readInt64());
      default:
        return type;
    }
  }

  readSignedLengthBigInt() {
    const type = this.buf[this.pos++];
    switch (type) {
      case 0xfb:
        return null;
      case 0xfc:
        return BigInt(this.readUInt16());
      case 0xfd:
        return BigInt(this.readUInt24());
      case 0xfe:
        return this.readInt64();
      default:
        return BigInt(type);
    }
  }

  readAsciiStringLengthEncoded() {
    const len = this.readUnsignedLength();
    if (len === null) return null;
    this.pos += len;
    return this.buf.toString('ascii', this.pos - len, this.pos);
  }

  readStringLengthEncoded(encoding) {
    const len = this.readUnsignedLength();
    if (len === null) return null;

    this.pos += len;
    if (Buffer.isEncoding(encoding)) {
      return this.buf.toString(encoding, this.pos - len, this.pos);
    }
    return Iconv.decode(this.buf.slice(this.pos - len, this.pos), encoding);
  }

  readLongLengthEncoded(supportBigInt, supportBigNumbers, bigNumberStrings, unsigned) {
    const len = this.readUnsignedLength();
    if (len === null) return null;

    if (supportBigInt) {
      const str = this.buf.toString('ascii', this.pos, this.pos + len);
      this.pos += len;
      return BigInt(str);
    }

    let result = 0;
    let negate = false;
    let begin = this.pos;

    //minus sign
    if (len > 0 && this.buf[begin] === 45) {
      negate = true;
      begin++;
    }
    for (; begin < this.pos + len; begin++) {
      result = result * 10 + (this.buf[begin] - 48);
    }

    let val = negate ? -1 * result : result;
    this.pos += len;

    if (!Number.isSafeInteger(val)) {
      const str = this.buf.toString('ascii', this.pos - len, this.pos);
      if (bigNumberStrings) return str;
      if (supportBigNumbers) {
        return Long.fromString(str, unsigned, 10);
      }
    }
    return val;
  }

  readDecimalLengthEncoded(bigNumberStrings) {
    const len = this.readUnsignedLength();
    if (len === null) return null;

    this.pos += len;
    let str = this.buf.toString('ascii', this.pos - len, this.pos);
    return bigNumberStrings ? str : +str;
  }

  readDate() {
    const len = this.readUnsignedLength();
    if (len === null) return null;

    let res = [];
    let value = 0;
    let initPos = this.pos;
    this.pos += len;
    while (initPos < this.pos) {
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

  readDateTime(opts) {
    const len = this.readUnsignedLength();
    if (len === null) return null;
    this.pos += len;
    const str = this.buf.toString('ascii', this.pos - len, this.pos);
    if (str.startsWith('0000-00-00 00:00:00')) return null;

    if (opts.tz) {
      return new Date(
        moment.tz(str, opts.tz).clone().tz(opts._localTz).format('YYYY-MM-DD HH:mm:ss.SSSSSS')
      );
    }
    return new Date(str);
  }

  readIntLengthEncoded() {
    const len = this.readUnsignedLength();
    if (len === null) return null;

    let result = 0;
    let negate = false;
    let begin = this.pos;

    if (len > 0 && this.buf[begin] === 45) {
      //minus sign
      negate = true;
      begin++;
    }
    for (; begin < this.pos + len; begin++) {
      result = result * 10 + (this.buf[begin] - 48);
    }
    this.pos += len;
    return negate ? -1 * result : result;
  }

  readFloatLengthCoded() {
    const len = this.readUnsignedLength();
    if (len === null) return null;
    this.pos += len;
    return +this.buf.toString('ascii', this.pos - len, this.pos);
  }

  skipLengthCodedNumber() {
    const type = this.buf[this.pos++] & 0xff;
    switch (type) {
      case 251:
        return;
      case 252:
        this.pos +=
          2 + (0xffff & ((this.buf[this.pos] & 0xff) + ((this.buf[this.pos + 1] & 0xff) << 8)));
        return;
      case 253:
        this.pos +=
          3 +
          (0xffffff &
            ((this.buf[this.pos] & 0xff) +
              ((this.buf[this.pos + 1] & 0xff) << 8) +
              ((this.buf[this.pos + 2] & 0xff) << 16)));
        return;
      case 254:
        this.pos +=
          8 +
          ((this.buf[this.pos] & 0xff) +
            ((this.buf[this.pos + 1] & 0xff) << 8) +
            ((this.buf[this.pos + 2] & 0xff) << 16) +
            ((this.buf[this.pos + 3] & 0xff) << 24) +
            ((this.buf[this.pos + 4] & 0xff) << 32) +
            ((this.buf[this.pos + 5] & 0xff) << 40) +
            ((this.buf[this.pos + 6] & 0xff) << 48) +
            ((this.buf[this.pos + 7] & 0xff) << 56));
        return;
      default:
        this.pos += type;
        return;
    }
  }

  positionFromEnd(num) {
    this.pos = this.end - num;
  }

  /**
   * For testing purpose only
   */
  _toBuf() {
    return this.buf.slice(this.pos, this.end);
  }

  forceOffset(off) {
    this.pos = off;
  }

  length() {
    return this.end - this.pos;
  }

  subPacketLengthEncoded() {
    const len = this.readUnsignedLength();
    this.skip(len);
    return new Packet(this.buf, this.pos - len, this.pos);
  }

  /**
   * Parse ERR_Packet : https://mariadb.com/kb/en/library/err_packet/
   *
   * @param info              current connection info
   * @param sql               command sql
   * @param stack             additional stack trace
   * @returns {Error}
   */
  readError(info, sql, stack) {
    this.skip(1);
    let errorCode = this.readUInt16();
    let sqlState = '';

    if (this.peek() === 0x23) {
      this.skip(6);
      sqlState = this.buf.toString('utf8', this.pos - 5, this.pos);
    }

    let msg = this.buf.toString('utf8', this.pos, this.end);
    let fatal = sqlState.startsWith('08') || sqlState === '70100';
    if (fatal) {
      const packetMsgs = info.getLastPackets();
      if (packetMsgs !== '')
        return Errors.createError(
          msg + '\nlast received packets:\n' + packetMsgs,
          sql,
          fatal,
          info,
          sqlState,
          errorCode,
          stack
        );
    }
    return Errors.createError(msg, sql, fatal, info, sqlState, errorCode, stack);
  }
}

module.exports = Packet;
