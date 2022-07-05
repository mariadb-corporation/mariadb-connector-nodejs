'use strict';

const Collations = require('../const/collations.js');
const FieldType = require('../const/field-type');
const FieldDetails = require('../const/field-detail');
const Capabilities = require('../const/capabilities');
const Errors = require('../misc/errors');

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

  static readGeometry = (col, packet, index, nullBitmap, opts, throwUnexpectedError) => {
    let defaultVal = col.__getDefaultGeomVal();
    return packet.readGeometry(defaultVal);
  };
  static readIntLengthEncoded = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    packet.readIntLengthEncoded();
  static readStringLengthEncoded = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    packet.readStringLengthEncoded();
  static readFloatLengthCoded = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    packet.readFloatLengthCoded();
  static readBigIntLengthCoded = (col, packet, index, nullBitmap, opts, throwUnexpectedError) => {
    const val = packet.readBigIntLengthEncoded();
    if (val != null && (opts.bigIntAsNumber || opts.supportBigNumbers)) {
      if (opts.bigIntAsNumber && opts.checkNumberRange && !Number.isSafeInteger(Number(val))) {
        return throwUnexpectedError(
          `value ${val} can't safely be converted to number`,
          false,
          null,
          '42000',
          Errors.ER_PARSING_PRECISION
        );
      }
      if (opts.supportBigNumbers && (opts.bigNumberStrings || !Number.isSafeInteger(Number(val)))) {
        return val.toString();
      }
      return Number(val);
    }
    return val;
  };
  static readDecimalAsIntLengthCoded = (col, packet, index, nullBitmap, opts, throwUnexpectedError) => {
    const valDec = packet.readDecimalLengthEncoded();
    if (valDec != null && (opts.decimalAsNumber || opts.supportBigNumbers)) {
      if (opts.decimalAsNumber && opts.checkNumberRange && !Number.isSafeInteger(Number(valDec))) {
        return throwUnexpectedError(
          `value ${valDec} can't safely be converted to number`,
          false,
          null,
          '42000',
          Errors.ER_PARSING_PRECISION
        );
      }
      if (opts.supportBigNumbers && (opts.bigNumberStrings || !Number.isSafeInteger(Number(valDec)))) {
        return valDec.toString();
      }
      return Number(valDec);
    }
    return valDec;
  };
  static readDecimalLengthCoded = (col, packet, index, nullBitmap, opts, throwUnexpectedError) => {
    const valDec = packet.readDecimalLengthEncoded();
    if (valDec != null && (opts.decimalAsNumber || opts.supportBigNumbers)) {
      if (opts.supportBigNumbers && (opts.bigNumberStrings || !Number.isSafeInteger(Number(valDec)))) {
        return valDec.toString();
      }
      return Number(valDec);
    }
    return valDec;
  };
  static readDate = (col, packet, index, nullBitmap, opts, throwUnexpectedError) => {
    if (opts.dateStrings) {
      return packet.readAsciiStringLengthEncoded();
    }
    return packet.readDate();
  };
  static readTimestamp = (col, packet, index, nullBitmap, opts, throwUnexpectedError) => {
    if (opts.dateStrings) {
      return packet.readAsciiStringLengthEncoded();
    }
    return packet.readDateTime(opts);
  };
  static readAsciiStringLengthEncoded = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    packet.readAsciiStringLengthEncoded();
  static readBitAsBoolean = (col, packet, index, nullBitmap, opts) => {
    const val = packet.readBufferLengthEncoded();
    return val == null ? null : val[0] === 1;
  };
  static readBufferLengthEncoded = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    packet.readBufferLengthEncoded();
  static readJson = (col, packet, index, nullBitmap, opts) => JSON.parse(packet.readStringLengthEncoded());
  static readSet = (col, packet, index, nullBitmap, opts) => {
    const string = packet.readStringLengthEncoded();
    return string == null ? null : string === '' ? [] : string.split(',');
  };
  static readTinyBinarySigned = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    isNullBitmap(index, nullBitmap) ? null : packet.readInt8();
  static readTinyBinaryUnsigned = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    isNullBitmap(index, nullBitmap) ? null : packet.readUInt8();
  static readShortBinarySigned = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    isNullBitmap(index, nullBitmap) ? null : packet.readInt16();
  static readShortBinaryUnsigned = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    isNullBitmap(index, nullBitmap) ? null : packet.readUInt16();
  static readMediumBinarySigned = (col, packet, index, nullBitmap, opts, throwUnexpectedError) => {
    if (isNullBitmap(index, nullBitmap)) {
      return null;
    }
    const result = packet.readInt24();
    packet.skip(1); // MEDIUMINT is encoded on 4 bytes in exchanges !
    return result;
  };
  static readMediumBinaryUnsigned = (col, packet, index, nullBitmap, opts, throwUnexpectedError) => {
    if (isNullBitmap(index, nullBitmap)) {
      return null;
    }
    const result = packet.readInt24();
    packet.skip(1); // MEDIUMINT is encoded on 4 bytes in exchanges !
    return result;
  };
  static readIntBinarySigned = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    isNullBitmap(index, nullBitmap) ? null : packet.readInt32();
  static readIntBinaryUnsigned = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    isNullBitmap(index, nullBitmap) ? null : packet.readUInt32();
  static readFloatBinary = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    isNullBitmap(index, nullBitmap) ? null : packet.readFloat();
  static readDoubleBinary = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    isNullBitmap(index, nullBitmap) ? null : packet.readDouble();
  static readBigintBinary = function (col, packet, index, nullBitmap, opts, throwUnexpectedError) {
    if (isNullBitmap(index, nullBitmap)) return null;
    const val = col.signed() ? packet.readBigInt64() : packet.readBigUInt64();
    if (val != null && (opts.bigIntAsNumber || opts.supportBigNumbers)) {
      if (opts.bigIntAsNumber && opts.checkNumberRange && !Number.isSafeInteger(Number(val))) {
        return throwUnexpectedError(
          `value ${val} can't safely be converted to number`,
          false,
          null,
          '42000',
          Errors.ER_PARSING_PRECISION
        );
      }
      if (opts.supportBigNumbers && (opts.bigNumberStrings || !Number.isSafeInteger(Number(val)))) {
        return val.toString();
      }
      return Number(val);
    }
    return val;
  };
  static readGeometryBinary = (col, packet, index, nullBitmap, opts, throwUnexpectedError) => {
    let defaultVal = col.__getDefaultGeomVal();
    if (isNullBitmap(index, nullBitmap)) {
      return defaultVal;
    }
    return packet.readGeometry(defaultVal);
  };
  static readDateBinary = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    isNullBitmap(index, nullBitmap) ? null : packet.readBinaryDate(opts);
  static readTimestampBinary = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    isNullBitmap(index, nullBitmap) ? null : packet.readBinaryDateTime(opts);
  static readTimestampStringBinary = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    isNullBitmap(index, nullBitmap) ? null : packet.readBinaryDateTimeAsString(col.scale);
  static readTimeBinary = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    isNullBitmap(index, nullBitmap) ? null : packet.readBinaryTime();
  static readDecimalAsIntBinary = (col, packet, index, nullBitmap, opts, throwUnexpectedError) => {
    //checkNumberRange additional check is only done when
    // resulting value is an integer
    if (isNullBitmap(index, nullBitmap)) return null;
    const valDec = packet.readDecimalLengthEncoded();
    if (valDec != null && (opts.decimalAsNumber || opts.supportBigNumbers)) {
      if (opts.decimalAsNumber && opts.checkNumberRange && !Number.isSafeInteger(Number(valDec))) {
        return throwUnexpectedError(
          `value ${valDec} can't safely be converted to number`,
          false,
          null,
          '42000',
          Errors.ER_PARSING_PRECISION
        );
      }
      if (opts.supportBigNumbers && (opts.bigNumberStrings || !Number.isSafeInteger(Number(valDec)))) {
        return valDec.toString();
      }
      return Number(valDec);
    }
    return valDec;
  };
  static readDecimalBinary = (col, packet, index, nullBitmap, opts, throwUnexpectedError) => {
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
  static readJsonBinary = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    isNullBitmap(index, nullBitmap) ? null : JSON.parse(packet.readStringLengthEncoded());
  static readBitBinaryBoolean = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    isNullBitmap(index, nullBitmap) ? null : packet.readBufferLengthEncoded()[0] === 1;
  static readBinaryBuffer = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    isNullBitmap(index, nullBitmap) ? null : packet.readBufferLengthEncoded();
  static readBinarySet = (col, packet, index, nullBitmap, opts, throwUnexpectedError) => {
    if (isNullBitmap(index, nullBitmap)) return null;
    const string = packet.readStringLengthEncoded();
    return string == null ? null : string === '' ? [] : string.split(',');
  };
  static readStringBinary = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
    isNullBitmap(index, nullBitmap) ? null : packet.readStringLengthEncoded();

  __parser(binary, opts) {
    // set reader function read(packet, index, nullBitmap, opts, throwUnexpectedError)
    // this permit for multi-row result-set to avoid resolving type parsing each data.
    if (binary) {
      switch (this.columnType) {
        case FieldType.TINY:
          return this.signed() ? ColumnDef.readTinyBinarySigned : ColumnDef.readTinyBinaryUnsigned;

        case FieldType.YEAR:
        case FieldType.SHORT:
          return this.signed() ? ColumnDef.readShortBinarySigned : ColumnDef.readShortBinaryUnsigned;

        case FieldType.INT24:
          return this.signed() ? ColumnDef.readMediumBinarySigned : ColumnDef.readMediumBinaryUnsigned;

        case FieldType.INT:
          return this.signed() ? ColumnDef.readIntBinarySigned : ColumnDef.readIntBinaryUnsigned;

        case FieldType.FLOAT:
          return ColumnDef.readFloatBinary;

        case FieldType.DOUBLE:
          return ColumnDef.readDoubleBinary;

        case FieldType.BIGINT:
          return ColumnDef.readBigintBinary;

        case FieldType.DATE:
          return ColumnDef.readDateBinary;

        case FieldType.DATETIME:
        case FieldType.TIMESTAMP:
          return opts.dateStrings ? ColumnDef.readTimestampStringBinary : ColumnDef.readTimestampBinary;

        case FieldType.TIME:
          return ColumnDef.readTimeBinary;

        case FieldType.DECIMAL:
        case FieldType.NEWDECIMAL:
          return this.scale == 0 ? ColumnDef.readDecimalAsIntBinary : ColumnDef.readDecimalBinary;

        case FieldType.GEOMETRY:
          return ColumnDef.readGeometryBinary;

        case FieldType.JSON:
          //for mysql only => parse string as JSON object
          return ColumnDef.readJsonBinary;

        case FieldType.BIT:
          if (this.columnLength === 1 && opts.bitOneIsBoolean) {
            return ColumnDef.readBitBinaryBoolean;
          }
          return ColumnDef.readBinaryBuffer;

        default:
          if (this.dataTypeFormat && this.dataTypeFormat === 'json' && opts.autoJsonMap) {
            return ColumnDef.readJsonBinary;
          }
          if (this.collation.index === 63) {
            return ColumnDef.readBinaryBuffer;
          }
          if (this.isSet()) {
            return ColumnDef.readBinarySet;
          }
          return ColumnDef.readStringBinary;
      }
    } else {
      switch (this.columnType) {
        case FieldType.TINY:
        case FieldType.SHORT:
        case FieldType.INT:
        case FieldType.INT24:
        case FieldType.YEAR:
          return ColumnDef.readIntLengthEncoded;

        case FieldType.FLOAT:
        case FieldType.DOUBLE:
          return ColumnDef.readFloatLengthCoded;

        case FieldType.BIGINT:
          return ColumnDef.readBigIntLengthCoded;

        case FieldType.DECIMAL:
        case FieldType.NEWDECIMAL:
          return this.scale == 0 ? ColumnDef.readDecimalAsIntLengthCoded : ColumnDef.readDecimalLengthCoded;

        case FieldType.DATE:
          return ColumnDef.readDate;

        case FieldType.DATETIME:
        case FieldType.TIMESTAMP:
          return ColumnDef.readTimestamp;

        case FieldType.TIME:
          return ColumnDef.readAsciiStringLengthEncoded;

        case FieldType.GEOMETRY:
          return ColumnDef.readGeometry;

        case FieldType.JSON:
          //for mysql only => parse string as JSON object
          return ColumnDef.readJson;

        case FieldType.BIT:
          if (this.columnLength === 1 && opts.bitOneIsBoolean) {
            return ColumnDef.readBitAsBoolean;
          }
          return ColumnDef.readBufferLengthEncoded;

        default:
          if (this.dataTypeFormat && this.dataTypeFormat === 'json' && opts.autoJsonMap) {
            return ColumnDef.readJson;
          }
          if (this.collation.index === 63) {
            return ColumnDef.readBufferLengthEncoded;
          }
          if (this.isSet()) {
            return ColumnDef.readSet;
          }
          return ColumnDef.readStringLengthEncoded;
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
