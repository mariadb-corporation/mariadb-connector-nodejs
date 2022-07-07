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
      const subPacket = packet.subPacketLengthEncoded();
      while (subPacket.remaining()) {
        switch (subPacket.readUInt8()) {
          case 0:
            this.dataTypeName = subPacket.readAsciiStringLengthEncoded();
            break;

          case 1:
            this.dataTypeFormat = subPacket.readAsciiStringLengthEncoded();
            break;

          default:
            // skip data
            const len = subPacket.readUnsignedLength();
            if (len) {
              subPacket.skip(len);
            }
            break;
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
    return this.#stringParser.packet.readString(this.#stringParser.dbOffset, this.#stringParser.dbLength);
  }

  schema() {
    return this.#stringParser.packet.readString(this.#stringParser.dbOffset, this.#stringParser.dbLength);
  }

  table() {
    return this.#stringParser.packet.readString(this.#stringParser.tableOffset, this.#stringParser.tableLength);
  }

  orgTable() {
    return this.#stringParser.packet.readString(this.#stringParser.orgTableOffset, this.#stringParser.orgTableLength);
  }

  name() {
    return this.#stringParser.name();
  }

  orgName() {
    return this.#stringParser.packet.readString(this.#stringParser.orgNameOffset, this.#stringParser.orgNameLength);
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
class StringParser {
  constructor(packet) {
    packet.skip(4); // skip 'def'

    this.dbLength = packet.readUnsignedLength();
    this.dbOffset = packet.pos;
    packet.skip(this.dbLength);

    this.tableLength = packet.readUnsignedLength();
    this.tableOffset = packet.pos;
    packet.skip(this.tableLength);

    this.orgTableLength = packet.readUnsignedLength();
    this.orgTableOffset = packet.pos;
    packet.skip(this.orgTableLength);

    this.nameLength = packet.readUnsignedLength();
    this.nameOffset = packet.pos;
    packet.skip(this.nameLength);

    this.orgNameLength = packet.readUnsignedLength();
    this.orgNameOffset = packet.pos;
    packet.skip(this.orgNameLength);
    this.packet = packet;
  }

  name = function () {
    return this.packet.readString(this.nameOffset, this.nameLength);
  };
}

/**
 * String parser.
 * This object permits to avoid listing all private information to metadata object.
 */
class StringParserWithName {
  constructor(packet) {
    packet.skip(4); // skip 'def'
    this.dbLength = packet.readUnsignedLength();
    this.dbOffset = packet.pos;
    packet.skip(this.dbLength);
    this.tableLength = packet.readUnsignedLength();
    this.tableOffset = packet.pos;
    packet.skip(this.tableLength);

    this.orgTableLength = packet.readUnsignedLength();
    this.orgTableOffset = packet.pos;
    packet.skip(this.orgTableLength);

    this.colName = packet.readStringLengthEncoded();

    this.orgNameLength = packet.readUnsignedLength();
    this.orgNameOffset = packet.pos;
    packet.skip(this.orgNameLength);

    this.packet = packet;
  }

  name = function () {
    return this.colName;
  };
}
module.exports = ColumnDef;
