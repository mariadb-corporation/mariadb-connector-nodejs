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
  constructor(packet, info) {
    this._stringParser = new StringParser(packet);
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

  __parser(binary, opts) {
    // set reader function read(packet, index, nullBitmap, opts)
    // this permit for multi-row result-set to avoid resolving type parsing each data.
    if (binary) {
      switch (this.columnType) {
        case FieldType.TINY:
          if (this.signed()) {
            return (packet, index, nullBitmap, opts) => (isNullBitmap(index, nullBitmap) ? null : packet.readInt8());
          } else {
            return (packet, index, nullBitmap, opts) => (isNullBitmap(index, nullBitmap) ? null : packet.readUInt8());
          }

        case FieldType.YEAR:
        case FieldType.SHORT:
          if (this.signed()) {
            return (packet, index, nullBitmap, opts) => (isNullBitmap(index, nullBitmap) ? null : packet.readInt16());
          } else {
            return (packet, index, nullBitmap, opts) => (isNullBitmap(index, nullBitmap) ? null : packet.readUInt16());
          }

        case FieldType.INT24:
          if (this.signed()) {
            return (packet, index, nullBitmap, opts) => {
              if (isNullBitmap(index, nullBitmap)) {
                return null;
              }
              const result = packet.readInt24();
              packet.skip(1); // MEDIUMINT is encoded on 4 bytes in exchanges !
              return result;
            };
          } else {
            return (packet, index, nullBitmap, opts) => {
              if (isNullBitmap(index, nullBitmap)) {
                return null;
              }
              const result = packet.readUInt24();
              packet.skip(1); // MEDIUMINT is encoded on 4 bytes in exchanges !
              return result;
            };
          }

        case FieldType.INT:
          if (this.signed()) {
            return (packet, index, nullBitmap, opts) => (isNullBitmap(index, nullBitmap) ? null : packet.readInt32());
          } else {
            return (packet, index, nullBitmap, opts) => (isNullBitmap(index, nullBitmap) ? null : packet.readUInt32());
          }

        case FieldType.FLOAT:
          return (packet, index, nullBitmap, opts) => (isNullBitmap(index, nullBitmap) ? null : packet.readFloat());

        case FieldType.DOUBLE:
          return (packet, index, nullBitmap, opts) => (isNullBitmap(index, nullBitmap) ? null : packet.readDouble());

        case FieldType.BIGINT:
          return (packet, index, nullBitmap, opts) => {
            if (isNullBitmap(index, nullBitmap)) return null;
            const val = this.signed() ? packet.readBigInt64() : packet.readBigUInt64();
            if (val != null && (opts.bigIntAsNumber || opts.supportBigNumbers)) {
              if (opts.supportBigNumbers && (opts.bigNumberStrings || !Number.isSafeInteger(Number(val)))) {
                return val.toString();
              }
              return Number(val);
            }
            return val;
          };

        case FieldType.DATE:
          return (packet, index, nullBitmap, opts) =>
            isNullBitmap(index, nullBitmap) ? null : packet.readBinaryDate(opts);

        case FieldType.DATETIME:
        case FieldType.TIMESTAMP:
          return (packet, index, nullBitmap, opts) =>
            isNullBitmap(index, nullBitmap) ? null : packet.readBinaryDateTime(opts, this);

        case FieldType.TIME:
          return (packet, index, nullBitmap, opts) =>
            isNullBitmap(index, nullBitmap) ? null : packet.readBinaryTime();

        case FieldType.DECIMAL:
        case FieldType.NEWDECIMAL:
          return (packet, index, nullBitmap, opts) => {
            if (isNullBitmap(index, nullBitmap)) return null;
            const valDec = packet.readDecimalLengthEncoded();
            if (valDec != null && (opts.decimalAsNumber || opts.supportBigNumbers)) {
              if (opts.supportBigNumbers && (opts.bigNumberStrings || !Number.isSafeInteger(Number(valDec)))) {
                return valDec.toString();
              }
              return Number(valDec);
            }
            return valDec;
          };

        case FieldType.GEOMETRY:
          let defaultVal = this.__getDefaultGeomVal();
          return (packet, index, nullBitmap, opts) => {
            if (isNullBitmap(index, nullBitmap)) {
              return defaultVal;
            }
            return packet.readGeometry(defaultVal);
          };

        case FieldType.JSON:
          //for mysql only => parse string as JSON object
          return (packet, index, nullBitmap, opts) =>
            isNullBitmap(index, nullBitmap) ? null : JSON.parse(packet.readStringLengthEncoded());

        case FieldType.BIT:
          if (this.columnLength === 1 && opts.bitOneIsBoolean) {
            return (packet, index, nullBitmap, opts) =>
              isNullBitmap(index, nullBitmap) ? null : packet.readBufferLengthEncoded()[0] === 1;
          }
          return (packet, index, nullBitmap, opts) =>
            isNullBitmap(index, nullBitmap) ? null : packet.readBufferLengthEncoded();

        default:
          if (this.dataTypeFormat && this.dataTypeFormat === 'json' && opts.autoJsonMap) {
            return (packet, index, nullBitmap, opts) =>
              isNullBitmap(index, nullBitmap) ? null : JSON.parse(packet.readStringLengthEncoded());
          }

          if (this.collation.index === 63) {
            return (packet, index, nullBitmap, opts) =>
              isNullBitmap(index, nullBitmap) ? null : packet.readBufferLengthEncoded();
          }

          if (this.isSet()) {
            return (packet, index, nullBitmap, opts) => {
              if (isNullBitmap(index, nullBitmap)) return null;
              const string = packet.readStringLengthEncoded();
              return string == null ? null : string === '' ? [] : string.split(',');
            };
          }
          return (packet, index, nullBitmap, opts) =>
            isNullBitmap(index, nullBitmap) ? null : packet.readStringLengthEncoded();
      }
    } else {
      switch (this.columnType) {
        case FieldType.TINY:
        case FieldType.SHORT:
        case FieldType.INT:
        case FieldType.INT24:
        case FieldType.YEAR:
          return (packet, index, nullBitmap, opts) => packet.readIntLengthEncoded();

        case FieldType.FLOAT:
        case FieldType.DOUBLE:
          return (packet, index, nullBitmap, opts) => packet.readFloatLengthCoded();

        case FieldType.BIGINT:
          return (packet, index, nullBitmap, opts) => {
            const val = packet.readBigIntLengthEncoded();
            if (val != null && (opts.bigIntAsNumber || opts.supportBigNumbers)) {
              if (opts.supportBigNumbers && (opts.bigNumberStrings || !Number.isSafeInteger(Number(val)))) {
                return val.toString();
              }
              return Number(val);
            }
            return val;
          };

        case FieldType.DECIMAL:
        case FieldType.NEWDECIMAL:
          return (packet, index, nullBitmap, opts) => {
            const valDec = packet.readDecimalLengthEncoded();
            if (valDec != null && (opts.decimalAsNumber || opts.supportBigNumbers)) {
              if (opts.supportBigNumbers && (opts.bigNumberStrings || !Number.isSafeInteger(Number(valDec)))) {
                return valDec.toString();
              }
              return Number(valDec);
            }
            return valDec;
          };

        case FieldType.DATE:
          return (packet, index, nullBitmap, opts) => {
            if (opts.dateStrings) {
              return packet.readAsciiStringLengthEncoded();
            }
            return packet.readDate();
          };

        case FieldType.DATETIME:
        case FieldType.TIMESTAMP:
          return (packet, index, nullBitmap, opts) => {
            if (opts.dateStrings) {
              return packet.readAsciiStringLengthEncoded();
            }
            return packet.readDateTime(opts);
          };

        case FieldType.TIME:
          return (packet, index, nullBitmap, opts) => packet.readAsciiStringLengthEncoded();

        case FieldType.GEOMETRY:
          let defaultVal = this.__getDefaultGeomVal();
          return (packet, index, nullBitmap, opts) => packet.readGeometry(defaultVal);

        case FieldType.JSON:
          //for mysql only => parse string as JSON object
          return (packet, index, nullBitmap, opts) => JSON.parse(packet.readStringLengthEncoded());

        case FieldType.BIT:
          if (this.columnLength === 1 && opts.bitOneIsBoolean) {
            return (packet, index, nullBitmap, opts) => {
              const val = packet.readBufferLengthEncoded();
              return val == null ? null : val[0] === 1;
            };
          }
          return (packet, index, nullBitmap, opts) => packet.readBufferLengthEncoded();

        default:
          if (this.dataTypeFormat && this.dataTypeFormat === 'json' && opts.autoJsonMap) {
            return (packet, index, nullBitmap, opts) => JSON.parse(packet.readStringLengthEncoded());
          }

          if (this.collation.index === 63) {
            return (packet, index, nullBitmap, opts) => packet.readBufferLengthEncoded();
          }

          if (this.isSet()) {
            return (packet, index, nullBitmap, opts) => {
              const string = packet.readStringLengthEncoded();
              return string == null ? null : string === '' ? [] : string.split(',');
            };
          }
          return (packet, index, nullBitmap, opts) => packet.readStringLengthEncoded();
      }
    }
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
    return this._stringParser.packet.readString(this._stringParser.dbOffset, this._stringParser.dbLength);
  }

  schema() {
    return this._stringParser.packet.readString(this._stringParser.dbOffset, this._stringParser.dbLength);
  }

  table() {
    return this._stringParser.packet.readString(this._stringParser.tableOffset, this._stringParser.tableLength);
  }

  orgTable() {
    return this._stringParser.packet.readString(this._stringParser.orgTableOffset, this._stringParser.orgTableLength);
  }

  name() {
    return this._stringParser.packet.readString(this._stringParser.nameOffset, this._stringParser.nameLength);
  }

  orgName() {
    return this._stringParser.packet.readString(this._stringParser.orgNameOffset, this._stringParser.orgNameLength);
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
