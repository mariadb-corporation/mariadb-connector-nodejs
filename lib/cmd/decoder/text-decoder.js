'use strict';

const FieldType = require('../../const/field-type');

class TextDecoder {
  static newRow(packet, columns) {
    return null;
  }

  /**
   * Read row data.
   *
   * @param index     current data index in row
   * @param column    associate metadata
   * @param opts   query options
   * @param connOpts  connection options
   * @param packet    row packet
   * @param nullBitmap null bitmap
   * @returns {*}     data
   */
  static readRowData(index, column, opts, connOpts, packet, nullBitmap) {
    switch (column.columnType) {
      case FieldType.TINY:
      case FieldType.SHORT:
      case FieldType.INT:
      case FieldType.INT24:
      case FieldType.YEAR:
        return packet.readIntLengthEncoded();
      case FieldType.FLOAT:
      case FieldType.DOUBLE:
        return packet.readFloatLengthCoded();
      case FieldType.BIGINT:
        const val = packet.readBigIntLengthEncoded();
        if (opts.bigIntAsNumber && val != null) {
          return Number(val);
        }
        return val;
      case FieldType.DECIMAL:
      case FieldType.NEWDECIMAL:
        const valDec = packet.readDecimalLengthEncoded();
        if (opts.decimalAsNumber && valDec != null) {
          return Number(valDec);
        }
        return valDec;
      case FieldType.DATE:
        if (opts.dateStrings) {
          return packet.readAsciiStringLengthEncoded();
        }
        return packet.readDate();
      case FieldType.DATETIME:
      case FieldType.TIMESTAMP:
        if (opts.dateStrings) {
          return packet.readAsciiStringLengthEncoded();
        }
        return packet.readDateTime(opts);
      case FieldType.TIME:
        return packet.readAsciiStringLengthEncoded();
      case FieldType.GEOMETRY:
        return packet.readGeometry(column.dataTypeName);
      case FieldType.JSON:
        //for mysql only => parse string as JSON object
        return JSON.parse(packet.readStringLengthEncoded('utf8'));

      default:
        if (column.dataTypeFormat && column.dataTypeFormat === 'json' && opts.autoJsonMap) {
          return JSON.parse(packet.readStringLengthEncoded('utf8'));
        }

        if (column.collation.index === 63) {
          return packet.readBufferLengthEncoded();
        }
        const string = packet.readStringLength();
        if (column.isSet()) {
          return string == null ? null : string === '' ? [] : string.split(',');
        }
        return string;
    }
  }

  static castWrapper(index, column, opts, connOpts, packet, nullBitmap) {
    column.string = () => packet.readStringLength();
    column.buffer = () => packet.readBufferLengthEncoded();
    column.float = () => packet.readFloatLengthCoded();
    column.int = () => packet.readIntLengthEncoded();
    column.long = () => packet.readBigIntLengthEncoded();
    column.decimal = () => packet.readDecimalLengthEncoded();
    column.date = () => packet.readDateTime(opts);
    column.geometry = () => {
      return column.readGeometry();
    };
  }
}

module.exports = TextDecoder;
