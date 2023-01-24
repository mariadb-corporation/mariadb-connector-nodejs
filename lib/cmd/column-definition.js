'use strict';

const Collations = require('../const/collations.js');
const FieldType = require('../const/field-type');
const FieldDetails = require('../const/field-detail');
const Capabilities = require('../const/capabilities');

// noinspection JSBitwiseOperatorUsage
/**
 * Column definition
 * see https://mariadb.com/kb/en/library/resultset/#column-definition-packet
 */
class ColumnDef {
  #stringParser;
  constructor(packet, info, skipName) {
    this.#stringParser = skipName ? new StringParser(packet) : new StringParserWithName(packet);
    if (info.serverCapabilities & Capabilities.MARIADB_CLIENT_EXTENDED_TYPE_INFO) {
      const len = packet.readUnsignedLength();
      if (len > 0) {
        const subPacket = packet.subPacketLengthEncoded(len);
        while (subPacket.remaining()) {
          switch (subPacket.readUInt8()) {
            case 0:
              this.dataTypeName = subPacket.readAsciiStringLengthEncoded();
              break;

            case 1:
              this.dataTypeFormat = subPacket.readAsciiStringLengthEncoded();
              break;

            default:
              subPacket.skip(subPacket.readUnsignedLength());
              break;
          }
        }
      }
    }

    packet.skip(1); // length of fixed fields
    this.collation = Collations.fromIndex(packet.readUInt16());
    this.columnLength = packet.readUInt32();
    this.columnType = packet.readUInt8();
    this.flags = packet.readUInt16();
    this.scale = packet.readUInt8();
    this.type = FieldType.TYPES[this.columnType];
  }

  __getDefaultGeomVal() {
    if (this.dataTypeName) {
      switch (this.dataTypeName) {
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
          return { type: this.dataTypeName };
      }
    }
    return null;
  }

  db() {
    return this.#stringParser.db();
  }

  schema() {
    return this.#stringParser.schema();
  }

  table() {
    return this.#stringParser.table();
  }

  orgTable() {
    return this.#stringParser.orgTable();
  }

  name() {
    return this.#stringParser.name();
  }

  orgName() {
    return this.#stringParser.orgName();
  }

  signed() {
    return (this.flags & FieldDetails.UNSIGNED) === 0;
  }

  isSet() {
    return (this.flags & FieldDetails.SET) !== 0;
  }
}

/**
 * String parser.
 * This object permits to avoid listing all private information to metadata object.
 */

class BaseStringParser {
  constructor(readFct, saveBuf) {
    this.buf = saveBuf;
    this.readString = readFct;
  }

  #readIdentifier(skip) {
    let pos = 0;
    while (skip-- > 0) {
      const type = this.buf[pos++] & 0xff;
      if (type < 0xfb) {
        pos += type;
      } else {
        switch (type) {
          case 0xfb:
            break;
          case 0xfc:
            pos += this.buf[pos++] + this.buf[pos++] * 2 ** 8;
            break;
          default:
            pos += this.buf[pos++] + this.buf[pos++] * 2 ** 8 + this.buf[pos++] * 2 ** 16;
        }
      }
    }

    let len;
    const type = this.buf[pos++] & 0xff;
    if (type < 0xfb) {
      len = type;
    } else {
      switch (type) {
        case 0xfb:
          len = pos;
          break;
        case 0xfc:
          len = this.buf[pos++] + this.buf[pos++] * 2 ** 8;
          break;
        default:
          len = this.buf[pos++] + this.buf[pos++] * 2 ** 8 + this.buf[pos++] * 2 ** 16;
          break;
      }
    }

    return this.readString(this.buf, pos, len);
  }

  name() {
    return this.#readIdentifier(3);
  }

  db() {
    return this.#readIdentifier(0);
  }

  schema() {
    return this.db();
  }

  table() {
    return this.#readIdentifier(1);
  }

  orgTable() {
    return this.#readIdentifier(2);
  }

  orgName() {
    return this.#readIdentifier(4);
  }
}

class StringParser extends BaseStringParser {
  constructor(packet) {
    packet.skip(4); // skip 'def'
    const initPos = packet.pos;
    packet.skip(packet.readUnsignedLength()); //schema
    packet.skip(packet.readUnsignedLength()); //table alias
    packet.skip(packet.readUnsignedLength()); //table
    packet.skip(packet.readUnsignedLength()); //column alias
    packet.skip(packet.readUnsignedLength()); //column

    const saveBuf = packet.buf.subarray(initPos, packet.pos);
    super(packet.readString.bind(packet), saveBuf);
  }
}

/**
 * String parser.
 * This object permits to avoid listing all private information to metadata object.
 */
class StringParserWithName extends BaseStringParser {
  colName;
  constructor(packet) {
    packet.skip(4); // skip 'def'
    const initPos = packet.pos;
    packet.skip(packet.readUnsignedLength()); //schema
    packet.skip(packet.readUnsignedLength()); //table alias
    packet.skip(packet.readUnsignedLength()); //table
    const colName = packet.readStringLengthEncoded(); //column alias
    packet.skip(packet.readUnsignedLength()); //column

    const saveBuf = packet.buf.subarray(initPos, packet.pos);
    super(packet.readString.bind(packet), saveBuf);
    this.colName = colName;
  }

  name() {
    return this.colName;
  }
}

module.exports = ColumnDef;
