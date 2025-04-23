//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

const FieldType = require('../../const/field-type');
const Errors = require('../../misc/errors');

module.exports.parser = function (col, opts) {
  // Fast path: For most types, we can directly return the default parser
  // This avoids the cost of the switch statement for common types
  const defaultParser = DEFAULT_PARSER_TYPE[col.columnType];
  if (defaultParser) return defaultParser;

  // Parser depending on column info
  switch (col.columnType) {
    case FieldType.DECIMAL:
    case FieldType.NEWDECIMAL:
      return col.scale === 0 ? readDecimalAsIntLengthCoded : readDecimalLengthCoded;

    case FieldType.BIGINT:
      if (opts.bigIntAsNumber || opts.supportBigNumbers) return readBigIntAsNumberLengthCoded;
      return readBigIntLengthCoded;

    case FieldType.GEOMETRY:
      const defaultVal = col.__getDefaultGeomVal();
      return function (packet, opts, throwUnexpectedError) {
        return packet.readGeometry(defaultVal);
      };

    case FieldType.BIT:
      if (col.columnLength === 1 && opts.bitOneIsBoolean) {
        return readBitAsBoolean;
      }
      return readBufferLengthEncoded;

    case FieldType.JSON:
      return opts.jsonStrings ? readStringLengthEncoded : readJson;

    default:
      if (col.dataTypeFormat === 'json' && opts.autoJsonMap) {
        return readJson;
      }
      if (col.collation.index === 63) {
        return readBufferLengthEncoded;
      }
      if (col.isSet()) {
        return readSet;
      }
      return readStringLengthEncoded;
  }
};

module.exports.castWrapper = function (column, packet, opts, nullBitmap, index) {
  const p = packet;

  column.string = () => p.readStringLengthEncoded();
  column.buffer = () => p.readBufferLengthEncoded();
  column.float = () => p.readFloatLengthCoded();
  column.tiny = column.short = column.int = () => p.readIntLengthEncoded();
  column.long = () => p.readBigIntLengthEncoded();
  column.decimal = () => p.readDecimalLengthEncoded();
  column.date = () => p.readDate(opts);
  column.datetime = () => p.readDateTime();

  // Only define geometry method if needed (likely less common)
  // Inline the geometry switch case for better performance
  column.geometry = () => {
    let defaultVal = null;

    if (column.dataTypeName) {
      // Use object lookup instead of switch for better performance
      const geoTypes = {
        point: { type: 'Point' },
        linestring: { type: 'LineString' },
        polygon: { type: 'Polygon' },
        multipoint: { type: 'MultiPoint' },
        multilinestring: { type: 'MultiLineString' },
        multipolygon: { type: 'MultiPolygon' }
      };

      defaultVal = geoTypes[column.dataTypeName] || { type: column.dataTypeName };
    }

    return p.readGeometry(defaultVal);
  };
};

const readIntLengthEncoded = (packet, opts, throwUnexpectedError) => packet.readIntLengthEncoded();
const readStringLengthEncoded = (packet, opts, throwUnexpectedError) => packet.readStringLengthEncoded();
const readFloatLengthCoded = (packet, opts, throwUnexpectedError) => packet.readFloatLengthCoded();
const readBigIntLengthCoded = (packet, opts, throwUnexpectedError) => packet.readBigIntLengthEncoded();
const readAsciiStringLengthEncoded = (packet, opts, throwUnexpectedError) => packet.readAsciiStringLengthEncoded();
const readBitAsBoolean = (packet, opts, throwUnexpectedError) => {
  const val = packet.readBufferLengthEncoded();
  return val == null ? null : val[0] === 1;
};
const readBufferLengthEncoded = (packet, opts, throwUnexpectedError) => packet.readBufferLengthEncoded();

const readJson = (packet, opts, throwUnexpectedError) => {
  const jsonStr = packet.readStringLengthEncoded();
  return jsonStr === null ? null : JSON.parse(jsonStr);
};

const readSet = (packet, opts, throwUnexpectedError) => {
  const string = packet.readStringLengthEncoded();
  return string == null ? null : string === '' ? [] : string.split(',');
};

const readDate = (packet, opts, throwUnexpectedError) =>
  opts.dateStrings ? packet.readAsciiStringLengthEncoded() : packet.readDate();

const readTimestamp = (packet, opts, throwUnexpectedError) =>
  opts.dateStrings ? packet.readAsciiStringLengthEncoded() : packet.readDateTime();

// Initialize the DEFAULT_PARSER_TYPE array with frequently used types
// Use a typed array for performance when accessing elements
const DEFAULT_PARSER_TYPE = new Array(256);
DEFAULT_PARSER_TYPE[FieldType.TINY] = readIntLengthEncoded;
DEFAULT_PARSER_TYPE[FieldType.SHORT] = readIntLengthEncoded;
DEFAULT_PARSER_TYPE[FieldType.INT] = readIntLengthEncoded;
DEFAULT_PARSER_TYPE[FieldType.INT24] = readIntLengthEncoded;
DEFAULT_PARSER_TYPE[FieldType.YEAR] = readIntLengthEncoded;
DEFAULT_PARSER_TYPE[FieldType.FLOAT] = readFloatLengthCoded;
DEFAULT_PARSER_TYPE[FieldType.DOUBLE] = readFloatLengthCoded;
DEFAULT_PARSER_TYPE[FieldType.DATE] = readDate;
DEFAULT_PARSER_TYPE[FieldType.DATETIME] = readTimestamp;
DEFAULT_PARSER_TYPE[FieldType.TIMESTAMP] = readTimestamp;
DEFAULT_PARSER_TYPE[FieldType.TIME] = readAsciiStringLengthEncoded;

const readBigIntAsNumberLengthCoded = (packet, opts, throwUnexpectedError) => {
  const len = packet.readUnsignedLength();
  if (len === null) return null;

  // Fast path for small integers
  if (len < 16) {
    const val = packet._atoi(len);
    // We know we're here because either bigIntAsNumber or supportBigNumbers is true
    if (opts.supportBigNumbers && opts.bigNumberStrings) {
      return `${val}`;
    }
    return val;
  }

  const val = packet.readBigIntFromLen(len);
  if (opts.bigIntAsNumber && opts.checkNumberRange && !Number.isSafeInteger(Number(val))) {
    return throwUnexpectedError(
      `value ${val} can't safely be converted to number`,
      false,
      null,
      '42000',
      Errors.ER_PARSING_PRECISION
    );
  }
  const numVal = Number(val);
  if (opts.supportBigNumbers && (opts.bigNumberStrings || !Number.isSafeInteger(numVal))) {
    return val.toString();
  }

  return numVal;
};

const readDecimalAsIntLengthCoded = (packet, opts, throwUnexpectedError) => {
  const valDec = packet.readDecimalLengthEncoded();
  if (valDec === null) return null;

  // Only perform conversions if needed based on options
  if (!(opts.decimalAsNumber || opts.supportBigNumbers)) return valDec;

  // Convert once
  const numValue = Number(valDec);

  // Check number range if required
  if (opts.decimalAsNumber && opts.checkNumberRange && !Number.isSafeInteger(numValue)) {
    return throwUnexpectedError(
      `value ${valDec} can't safely be converted to number`,
      false,
      null,
      '42000',
      Errors.ER_PARSING_PRECISION
    );
  }

  // Return string representation for big numbers if needed
  if (opts.supportBigNumbers && (opts.bigNumberStrings || !Number.isSafeInteger(numValue))) {
    return valDec;
  }

  return numValue;
};

const readDecimalLengthCoded = (packet, opts, throwUnexpectedError) => {
  const valDec = packet.readDecimalLengthEncoded();
  if (valDec === null) return null;

  // Only perform conversions if needed based on options
  if (!(opts.decimalAsNumber || opts.supportBigNumbers)) return valDec;

  const numberValue = Number(valDec);

  // Handle big numbers specifically
  if (
    opts.supportBigNumbers &&
    (opts.bigNumberStrings || (Number.isInteger(numberValue) && !Number.isSafeInteger(numberValue)))
  ) {
    return valDec;
  }

  return numberValue;
};
