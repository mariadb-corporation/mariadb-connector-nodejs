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
  constructor(packet, info, opts, binary) {
    this._parse = new StringParser(packet);
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

    // set reader function read(packet, index, nullBitmap, opts)
    // this permit for multi-row result-set to avoid resolving type parsing each data.
    if (binary) {
      switch (this.columnType) {
        case FieldType.TINY:
          if (this.signed()) {
            this._read = (packet, index, nullBitmap) =>
              isNullBitmap(index, nullBitmap) ? null : packet.readInt8();
          } else {
            this._read = (packet, index, nullBitmap) =>
              isNullBitmap(index, nullBitmap) ? null : packet.readUInt8();
          }
          break;

        case FieldType.YEAR:
        case FieldType.SHORT:
          if (this.signed()) {
            this._read = (packet, index, nullBitmap) =>
              isNullBitmap(index, nullBitmap) ? null : packet.readInt16();
          } else {
            this._read = (packet, index, nullBitmap) =>
              isNullBitmap(index, nullBitmap) ? null : packet.readUInt16();
          }
          break;

        case FieldType.INT24:
          if (this.signed()) {
            this._read = (packet, index, nullBitmap) => {
              if (isNullBitmap(index, nullBitmap)) {
                return null;
              }
              const result = packet.readInt24();
              packet.skip(1); // MEDIUMINT is encoded on 4 bytes in exchanges !
              return result;
            };
          } else {
            this._read = (packet, index, nullBitmap) => {
              if (isNullBitmap(index, nullBitmap)) {
                return null;
              }
              const result = packet.readUInt24();
              packet.skip(1); // MEDIUMINT is encoded on 4 bytes in exchanges !
              return result;
            };
          }
          break;

        case FieldType.INT:
          if (this.signed()) {
            this._read = (packet, index, nullBitmap) =>
              isNullBitmap(index, nullBitmap) ? null : packet.readInt32();
          } else {
            this._read = (packet, index, nullBitmap) =>
              isNullBitmap(index, nullBitmap) ? null : packet.readUInt32();
          }
          break;

        case FieldType.FLOAT:
          this._read = (packet, index, nullBitmap) =>
            isNullBitmap(index, nullBitmap) ? null : packet.readFloat();
          break;

        case FieldType.DOUBLE:
          this._read = (packet, index, nullBitmap) =>
            isNullBitmap(index, nullBitmap) ? null : packet.readDouble();
          break;

        case FieldType.BIGINT:
          this._read = (packet, index, nullBitmap, opts) => {
            if (isNullBitmap(index, nullBitmap)) return null;
            const val = this.signed() ? packet.readBigInt64() : packet.readBigUInt64();
            if (val != null && (opts.bigIntAsNumber || opts.supportBigNumbers)) {
              if (
                opts.supportBigNumbers &&
                (opts.bigNumberStrings || !Number.isSafeInteger(Number(val)))
              ) {
                return val.toString();
              }
              return Number(val);
            }
            return val;
          };
          break;

        case FieldType.DECIMAL:
        case FieldType.NEWDECIMAL:
          this._read = (packet, index, nullBitmap, opts) => {
            if (isNullBitmap(index, nullBitmap)) return null;
            const valDec = packet.readDecimalLengthEncoded();
            if (valDec != null && (opts.decimalAsNumber || opts.supportBigNumbers)) {
              if (
                opts.supportBigNumbers &&
                (opts.bigNumberStrings || !Number.isSafeInteger(Number(valDec)))
              ) {
                return valDec.toString();
              }
              return Number(valDec);
            }
            return valDec;
          };
          break;

        case FieldType.DATE:
          this._read = (packet, index, nullBitmap, opts) =>
            isNullBitmap(index, nullBitmap) ? null : packet.readBinaryDate(opts);
          break;

        case FieldType.DATETIME:
        case FieldType.TIMESTAMP:
          this._read = (packet, index, nullBitmap, opts) =>
            isNullBitmap(index, nullBitmap) ? null : packet.readBinaryDateTime(opts, this);
          break;

        case FieldType.TIME:
          this._read = (packet, index, nullBitmap) =>
            isNullBitmap(index, nullBitmap) ? null : packet.readBinaryTime();
          break;

        case FieldType.GEOMETRY:
          this._read = (packet, index, nullBitmap) => {
            if (isNullBitmap(index, nullBitmap)) {
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
            return packet.readGeometry(this.dataTypeName);
          };
          break;

        case FieldType.JSON:
          //for mysql only => parse string as JSON object
          this._read = (packet, index, nullBitmap) =>
            isNullBitmap(index, nullBitmap) ? null : JSON.parse(packet.readStringLength());
          break;

        default:
          if (this.dataTypeFormat && this.dataTypeFormat === 'json' && opts.autoJsonMap) {
            this._read = (packet, index, nullBitmap) =>
              isNullBitmap(index, nullBitmap) ? null : JSON.parse(packet.readStringLength());
            break;
          }

          if (this.collation.index === 63) {
            this._read = (packet, index, nullBitmap) =>
              isNullBitmap(index, nullBitmap) ? null : packet.readBufferLengthEncoded();
            break;
          }

          if (this.isSet()) {
            this._read = (packet, index, nullBitmap) => {
              if (isNullBitmap(index, nullBitmap)) return null;
              const string = packet.readStringLength();
              return string == null ? null : string === '' ? [] : string.split(',');
            };
            break;
          }
          this._read = (packet, index, nullBitmap) =>
            isNullBitmap(index, nullBitmap) ? null : packet.readStringLength();
          break;
      }
    } else {
      switch (this.columnType) {
        case FieldType.TINY:
        case FieldType.SHORT:
        case FieldType.INT:
        case FieldType.INT24:
        case FieldType.YEAR:
          this._read = (packet) => packet.readIntLengthEncoded();
          break;

        case FieldType.FLOAT:
        case FieldType.DOUBLE:
          this._read = (packet) => packet.readFloatLengthCoded();
          break;

        case FieldType.BIGINT:
          this._read = (packet, index, nullBitmap, opts) => {
            const val = packet.readBigIntLengthEncoded();
            if (val != null && (opts.bigIntAsNumber || opts.supportBigNumbers)) {
              if (
                opts.supportBigNumbers &&
                (opts.bigNumberStrings || !Number.isSafeInteger(Number(val)))
              ) {
                return val.toString();
              }
              return Number(val);
            }
            return val;
          };
          break;

        case FieldType.DECIMAL:
        case FieldType.NEWDECIMAL:
          this._read = (packet, index, nullBitmap, opts) => {
            const valDec = packet.readDecimalLengthEncoded();
            if (valDec != null && (opts.decimalAsNumber || opts.supportBigNumbers)) {
              if (
                opts.supportBigNumbers &&
                (opts.bigNumberStrings || !Number.isSafeInteger(Number(valDec)))
              ) {
                return valDec.toString();
              }
              return Number(valDec);
            }
            return valDec;
          };
          break;

        case FieldType.DATE:
          this._read = (packet, index, nullBitmap, opts) => {
            if (opts.dateStrings) {
              return packet.readAsciiStringLengthEncoded();
            }
            return packet.readDate();
          };
          break;

        case FieldType.DATETIME:
        case FieldType.TIMESTAMP:
          this._read = (packet, index, nullBitmap, opts) => {
            if (opts.dateStrings) {
              return packet.readAsciiStringLengthEncoded();
            }
            return packet.readDateTime(opts);
          };
          break;

        case FieldType.TIME:
          this._read = (packet) => packet.readAsciiStringLengthEncoded();
          break;

        case FieldType.GEOMETRY:
          this._read = (packet) => packet.readGeometry(this.dataTypeName);
          break;

        case FieldType.JSON:
          //for mysql only => parse string as JSON object
          this._read = (packet) => JSON.parse(packet.readStringLength());
          break;

        default:
          if (this.dataTypeFormat && this.dataTypeFormat === 'json' && opts.autoJsonMap) {
            this._read = (packet) => JSON.parse(packet.readStringLength());
            break;
          }

          if (this.collation.index === 63) {
            this._read = (packet) => packet.readBufferLengthEncoded();
            break;
          }

          if (this.isSet()) {
            this._read = (packet) => {
              const string = packet.readStringLength();
              return string == null ? null : string === '' ? [] : string.split(',');
            };
            break;
          }
          this._read = (packet) => packet.readStringLength();
      }
    }
  }

  db() {
    return this._parse.packet.readString(this._parse.dbOffset, this._parse.dbLength);
  }

  schema() {
    return this._parse.packet.readString(this._parse.dbOffset, this._parse.dbLength);
  }

  table() {
    return this._parse.packet.readString(this._parse.tableOffset, this._parse.tableLength);
  }

  orgTable() {
    return this._parse.packet.readString(this._parse.orgTableOffset, this._parse.orgTableLength);
  }

  name() {
    return this._parse.packet.readString(this._parse.nameOffset, this._parse.nameLength);
  }

  orgName() {
    return this._parse.packet.readString(this._parse.orgNameOffset, this._parse.orgNameLength);
  }

  signed() {
    return (this.flags & FieldDetails.UNSIGNED) === 0;
  }

  isSet() {
    return (this.flags & FieldDetails.SET) !== 0;
  }
}

const isNullBitmap = (index, nullBitmap) => {
  return (nullBitmap[Math.floor((index + 2) / 8)] & (1 << (index + 2) % 8)) > 0;
};

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
}

module.exports = ColumnDef;
