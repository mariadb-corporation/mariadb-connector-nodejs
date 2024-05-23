//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

const FieldType = require('../../const/field-type');
const Errors = require('../../misc/errors');

module.exports.newRow = function (packet, columns) {
  packet.skip(1); // skip 0x00 header.
  const len = ~~((columns.length + 9) / 8);
  const nullBitMap = new Array(len);
  for (let i = 0; i < len; i++) nullBitMap[i] = packet.readUInt8();
  return nullBitMap;
};
module.exports.castWrapper = function (column, packet, opts, nullBitmap, index) {
  column.string = () => (isNullBitmap(index, nullBitmap) ? null : packet.readStringLengthEncoded());
  column.buffer = () => (isNullBitmap(index, nullBitmap) ? null : packet.readBufferLengthEncoded());
  column.float = () => (isNullBitmap(index, nullBitmap) ? null : packet.readFloat());
  column.tiny = () =>
    isNullBitmap(index, nullBitmap) ? null : column.signed() ? packet.readInt8() : packet.readUInt8();
  column.short = () =>
    isNullBitmap(index, nullBitmap) ? null : column.signed() ? packet.readInt16() : packet.readUInt16();
  column.int = () => (isNullBitmap(index, nullBitmap) ? null : packet.readInt32());
  column.long = () => (isNullBitmap(index, nullBitmap) ? null : packet.readBigInt64());
  column.decimal = () => (isNullBitmap(index, nullBitmap) ? null : packet.readDecimalLengthEncoded());
  column.date = () => (isNullBitmap(index, nullBitmap) ? null : packet.readBinaryDate(opts));
  column.datetime = () => (isNullBitmap(index, nullBitmap) ? null : packet.readBinaryDateTime());

  column.geometry = () => {
    let defaultVal = null;
    if (column.dataTypeName) {
      switch (column.dataTypeName) {
        case 'point':
          defaultVal = { type: 'Point' };
          break;
        case 'linestring':
          defaultVal = { type: 'LineString' };
          break;
        case 'polygon':
          defaultVal = { type: 'Polygon' };
          break;
        case 'multipoint':
          defaultVal = { type: 'MultiPoint' };
          break;
        case 'multilinestring':
          defaultVal = { type: 'MultiLineString' };
          break;
        case 'multipolygon':
          defaultVal = { type: 'MultiPolygon' };
          break;
        default:
          defaultVal = { type: column.dataTypeName };
          break;
      }
    }

    if (isNullBitmap(index, nullBitmap)) {
      return defaultVal;
    }
    return packet.readGeometry(defaultVal);
  };
};
module.exports.parser = function (col, opts) {
  // set reader function read(col, packet, index, nullBitmap, opts, throwUnexpectedError)
  // this permit for multi-row result-set to avoid resolving type parsing each data.

  // return constant parser (function not depending on column info other than type)
  const defaultParser = col.signed()
    ? DEFAULT_SIGNED_PARSER_TYPE[col.columnType]
    : DEFAULT_UNSIGNED_PARSER_TYPE[col.columnType];
  if (defaultParser) return defaultParser;

  // parser depending on column info
  switch (col.columnType) {
    case FieldType.BIGINT:
      if (col.signed()) {
        return opts.bigIntAsNumber || opts.supportBigNumbers ? readBigintAsIntBinarySigned : readBigintBinarySigned;
      }
      return opts.bigIntAsNumber || opts.supportBigNumbers ? readBigintAsIntBinaryUnsigned : readBigintBinaryUnsigned;

    case FieldType.DATETIME:
    case FieldType.TIMESTAMP:
      return opts.dateStrings ? readTimestampStringBinary.bind(null, col.scale) : readTimestampBinary;

    case FieldType.DECIMAL:
    case FieldType.NEWDECIMAL:
      return col.scale === 0 ? readDecimalAsIntBinary : readDecimalBinary;

    case FieldType.GEOMETRY:
      let defaultVal = col.__getDefaultGeomVal();
      return readGeometryBinary.bind(null, defaultVal);

    case FieldType.BIT:
      if (col.columnLength === 1 && opts.bitOneIsBoolean) {
        return readBitBinaryBoolean;
      }
      return readBinaryBuffer;

    default:
      if (col.dataTypeFormat && col.dataTypeFormat === 'json' && opts.autoJsonMap) {
        return readJsonBinary;
      }
      if (col.collation.index === 63) {
        return readBinaryBuffer;
      }
      if (col.isSet()) {
        return readBinarySet;
      }
      return readStringBinary;
  }
};

const isNullBitmap = (index, nullBitmap) => {
  return (nullBitmap[~~((index + 2) / 8)] & (1 << (index + 2) % 8)) > 0;
};

const readTinyBinarySigned = (packet, opts, throwUnexpectedError, nullBitmap, index) =>
  isNullBitmap(index, nullBitmap) ? null : packet.readInt8();
const readTinyBinaryUnsigned = (packet, opts, throwUnexpectedError, nullBitmap, index) =>
  isNullBitmap(index, nullBitmap) ? null : packet.readUInt8();
const readShortBinarySigned = (packet, opts, throwUnexpectedError, nullBitmap, index) =>
  isNullBitmap(index, nullBitmap) ? null : packet.readInt16();
const readShortBinaryUnsigned = (packet, opts, throwUnexpectedError, nullBitmap, index) =>
  isNullBitmap(index, nullBitmap) ? null : packet.readUInt16();
const readMediumBinarySigned = (packet, opts, throwUnexpectedError, nullBitmap, index) => {
  if (isNullBitmap(index, nullBitmap)) {
    return null;
  }
  const result = packet.readInt24();
  packet.skip(1); // MEDIUMINT is encoded on 4 bytes in exchanges !
  return result;
};
const readMediumBinaryUnsigned = (packet, opts, throwUnexpectedError, nullBitmap, index) => {
  if (isNullBitmap(index, nullBitmap)) {
    return null;
  }
  const result = packet.readUInt24();
  packet.skip(1); // MEDIUMINT is encoded on 4 bytes in exchanges !
  return result;
};
const readIntBinarySigned = (packet, opts, throwUnexpectedError, nullBitmap, index) =>
  isNullBitmap(index, nullBitmap) ? null : packet.readInt32();
const readIntBinaryUnsigned = (packet, opts, throwUnexpectedError, nullBitmap, index) =>
  isNullBitmap(index, nullBitmap) ? null : packet.readUInt32();
const readFloatBinary = (packet, opts, throwUnexpectedError, nullBitmap, index) =>
  isNullBitmap(index, nullBitmap) ? null : packet.readFloat();
const readDoubleBinary = (packet, opts, throwUnexpectedError, nullBitmap, index) =>
  isNullBitmap(index, nullBitmap) ? null : packet.readDouble();
const readBigintBinaryUnsigned = function (packet, opts, throwUnexpectedError, nullBitmap, index) {
  if (isNullBitmap(index, nullBitmap)) return null;
  return packet.readBigUInt64();
};
const readBigintBinarySigned = function (packet, opts, throwUnexpectedError, nullBitmap, index) {
  if (isNullBitmap(index, nullBitmap)) return null;
  return packet.readBigInt64();
};

const readBigintAsIntBinaryUnsigned = function (packet, opts, throwUnexpectedError, nullBitmap, index) {
  if (isNullBitmap(index, nullBitmap)) return null;
  const val = packet.readBigUInt64();
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
};

const readBigintAsIntBinarySigned = function (packet, opts, throwUnexpectedError, nullBitmap, index) {
  if (isNullBitmap(index, nullBitmap)) return null;
  const val = packet.readBigInt64();
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
};

const readGeometryBinary = (defaultVal, packet, opts, throwUnexpectedError, nullBitmap, index) => {
  if (isNullBitmap(index, nullBitmap)) {
    return defaultVal;
  }
  return packet.readGeometry(defaultVal);
};
const readDateBinary = (packet, opts, throwUnexpectedError, nullBitmap, index) =>
  isNullBitmap(index, nullBitmap) ? null : packet.readBinaryDate(opts);
const readTimestampBinary = (packet, opts, throwUnexpectedError, nullBitmap, index) =>
  isNullBitmap(index, nullBitmap) ? null : packet.readBinaryDateTime();
const readTimestampStringBinary = (scale, packet, opts, throwUnexpectedError, nullBitmap, index) =>
  isNullBitmap(index, nullBitmap) ? null : packet.readBinaryDateTimeAsString(scale);
const readTimeBinary = (packet, opts, throwUnexpectedError, nullBitmap, index) =>
  isNullBitmap(index, nullBitmap) ? null : packet.readBinaryTime();
const readDecimalAsIntBinary = (packet, opts, throwUnexpectedError, nullBitmap, index) => {
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
      return valDec;
    }
    return Number(valDec);
  }
  return valDec;
};
const readDecimalBinary = (packet, opts, throwUnexpectedError, nullBitmap, index) => {
  if (isNullBitmap(index, nullBitmap)) return null;
  const valDec = packet.readDecimalLengthEncoded();
  if (valDec != null && (opts.decimalAsNumber || opts.supportBigNumbers)) {
    const numberValue = Number(valDec);
    if (
      opts.supportBigNumbers &&
      (opts.bigNumberStrings || (Number.isInteger(numberValue) && !Number.isSafeInteger(numberValue)))
    ) {
      return valDec;
    }
    return numberValue;
  }
  return valDec;
};
const readJsonBinary = (packet, opts, throwUnexpectedError, nullBitmap, index) =>
  isNullBitmap(index, nullBitmap) ? null : JSON.parse(packet.readStringLengthEncoded());
const readBitBinaryBoolean = (packet, opts, throwUnexpectedError, nullBitmap, index) =>
  isNullBitmap(index, nullBitmap) ? null : packet.readBufferLengthEncoded()[0] === 1;
const readBinaryBuffer = (packet, opts, throwUnexpectedError, nullBitmap, index) =>
  isNullBitmap(index, nullBitmap) ? null : packet.readBufferLengthEncoded();
const readBinarySet = (packet, opts, throwUnexpectedError, nullBitmap, index) => {
  if (isNullBitmap(index, nullBitmap)) return null;
  const string = packet.readStringLengthEncoded();
  return string == null ? null : string === '' ? [] : string.split(',');
};
const readStringBinary = (packet, opts, throwUnexpectedError, nullBitmap, index) =>
  isNullBitmap(index, nullBitmap) ? null : packet.readStringLengthEncoded();

const DEFAULT_SIGNED_PARSER_TYPE = Array(256);
DEFAULT_SIGNED_PARSER_TYPE[FieldType.TINY] = readTinyBinarySigned;
DEFAULT_SIGNED_PARSER_TYPE[FieldType.YEAR] = readShortBinarySigned;
DEFAULT_SIGNED_PARSER_TYPE[FieldType.SHORT] = readShortBinarySigned;
DEFAULT_SIGNED_PARSER_TYPE[FieldType.INT24] = readMediumBinarySigned;
DEFAULT_SIGNED_PARSER_TYPE[FieldType.INT] = readIntBinarySigned;
DEFAULT_SIGNED_PARSER_TYPE[FieldType.FLOAT] = readFloatBinary;
DEFAULT_SIGNED_PARSER_TYPE[FieldType.DOUBLE] = readDoubleBinary;
DEFAULT_SIGNED_PARSER_TYPE[FieldType.DATE] = readDateBinary;
DEFAULT_SIGNED_PARSER_TYPE[FieldType.TIME] = readTimeBinary;
DEFAULT_SIGNED_PARSER_TYPE[FieldType.JSON] = readJsonBinary;

const DEFAULT_UNSIGNED_PARSER_TYPE = Array(256);
DEFAULT_UNSIGNED_PARSER_TYPE[FieldType.TINY] = readTinyBinaryUnsigned;
DEFAULT_UNSIGNED_PARSER_TYPE[FieldType.YEAR] = readShortBinaryUnsigned;
DEFAULT_UNSIGNED_PARSER_TYPE[FieldType.SHORT] = readShortBinaryUnsigned;
DEFAULT_UNSIGNED_PARSER_TYPE[FieldType.INT24] = readMediumBinaryUnsigned;
DEFAULT_UNSIGNED_PARSER_TYPE[FieldType.INT] = readIntBinaryUnsigned;
DEFAULT_UNSIGNED_PARSER_TYPE[FieldType.FLOAT] = readFloatBinary;
DEFAULT_UNSIGNED_PARSER_TYPE[FieldType.DOUBLE] = readDoubleBinary;
DEFAULT_UNSIGNED_PARSER_TYPE[FieldType.DATE] = readDateBinary;
DEFAULT_UNSIGNED_PARSER_TYPE[FieldType.TIME] = readTimeBinary;
DEFAULT_UNSIGNED_PARSER_TYPE[FieldType.JSON] = readJsonBinary;
