'use strict';

const FieldType = require('../../const/field-type');
const Errors = require('../../misc/errors');

class TextDecoder {
  static castWrapper(column, packet, index, nullBitmap, opts) {
    column.string = () => packet.readStringLengthEncoded();
    column.buffer = () => packet.readBufferLengthEncoded();
    column.float = () => packet.readFloatLengthCoded();
    column.tiny = () => packet.readIntLengthEncoded();
    column.short = () => packet.readIntLengthEncoded();
    column.int = () => packet.readIntLengthEncoded();
    column.long = () => packet.readBigIntLengthEncoded();
    column.decimal = () => packet.readDecimalLengthEncoded();
    column.date = () => packet.readDate(opts);
    column.datetime = () => packet.readDateTime(opts);

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

      return packet.readGeometry(defaultVal);
    };
  }
  static parser(col, opts) {
    // set reader function read(col, packet, index, nullBitmap, opts, throwUnexpectedError)
    // this permit for multi-row result-set to avoid resolving type parsing each data.

    switch (col.columnType) {
      case FieldType.TINY:
      case FieldType.SHORT:
      case FieldType.INT:
      case FieldType.INT24:
      case FieldType.YEAR:
        return readIntLengthEncoded;

      case FieldType.FLOAT:
      case FieldType.DOUBLE:
        return readFloatLengthCoded;

      case FieldType.BIGINT:
        if (opts.bigIntAsNumber || opts.supportBigNumbers) return readBigIntAsNumberLengthCoded;
        return readBigIntLengthCoded;

      case FieldType.DECIMAL:
      case FieldType.NEWDECIMAL:
        return col.scale == 0 ? readDecimalAsIntLengthCoded : readDecimalLengthCoded;

      case FieldType.DATE:
        return readDate;

      case FieldType.DATETIME:
      case FieldType.TIMESTAMP:
        return readTimestamp;

      case FieldType.TIME:
        return readAsciiStringLengthEncoded;

      case FieldType.GEOMETRY:
        return readGeometry;

      case FieldType.JSON:
        //for mysql only => parse string as JSON object
        return readJson;

      case FieldType.BIT:
        if (col.columnLength === 1 && opts.bitOneIsBoolean) {
          return readBitAsBoolean;
        }
        return readBufferLengthEncoded;

      default:
        if (col.dataTypeFormat && col.dataTypeFormat === 'json' && opts.autoJsonMap) {
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
  }
}

module.exports = TextDecoder;

const readGeometry = (col, packet, index, nullBitmap, opts, throwUnexpectedError) => {
  let defaultVal = col.__getDefaultGeomVal();
  return packet.readGeometry(defaultVal);
};
const readIntLengthEncoded = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
  packet.readIntLengthEncoded();
const readStringLengthEncoded = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
  packet.readStringLengthEncoded();
const readFloatLengthCoded = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
  packet.readFloatLengthCoded();
const readBigIntLengthCoded = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
  packet.readBigIntLengthEncoded();
const readBigIntAsNumberLengthCoded = (col, packet, index, nullBitmap, opts, throwUnexpectedError) => {
  const val = packet.readBigIntLengthEncoded();
  if (val == null) return null;
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

const readDecimalAsIntLengthCoded = (col, packet, index, nullBitmap, opts, throwUnexpectedError) => {
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
const readDecimalLengthCoded = (col, packet, index, nullBitmap, opts, throwUnexpectedError) => {
  const valDec = packet.readDecimalLengthEncoded();
  if (valDec != null && (opts.decimalAsNumber || opts.supportBigNumbers)) {
    if (opts.supportBigNumbers && (opts.bigNumberStrings || !Number.isSafeInteger(Number(valDec)))) {
      return valDec.toString();
    }
    return Number(valDec);
  }
  return valDec;
};
const readDate = (col, packet, index, nullBitmap, opts, throwUnexpectedError) => {
  if (opts.dateStrings) {
    return packet.readAsciiStringLengthEncoded();
  }
  return packet.readDate();
};
const readTimestamp = (col, packet, index, nullBitmap, opts, throwUnexpectedError) => {
  if (opts.dateStrings) {
    return packet.readAsciiStringLengthEncoded();
  }
  return packet.readDateTime(opts);
};
const readAsciiStringLengthEncoded = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
  packet.readAsciiStringLengthEncoded();
const readBitAsBoolean = (col, packet, index, nullBitmap, opts) => {
  const val = packet.readBufferLengthEncoded();
  return val == null ? null : val[0] === 1;
};
const readBufferLengthEncoded = (col, packet, index, nullBitmap, opts, throwUnexpectedError) =>
  packet.readBufferLengthEncoded();
const readJson = (col, packet, index, nullBitmap, opts) => JSON.parse(packet.readStringLengthEncoded());
const readSet = (col, packet, index, nullBitmap, opts) => {
  const string = packet.readStringLengthEncoded();
  return string == null ? null : string === '' ? [] : string.split(',');
};
