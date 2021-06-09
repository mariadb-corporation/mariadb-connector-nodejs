'use strict';

const FieldType = require('../../const/field-type');

class BinaryDecoder {
  static newRow(packet, columns) {
    packet.skip(1); // skip 0x00 header.
    return packet.readBuffer(Math.floor((columns.length + 9) / 8));
  }

  /**
   * Read row data.
   *
   * @param index     current data index in row
   * @param column    associate metadata
   * @param opts      query options
   * @param connOpts  connection options
   * @param packet    row packet
   * @param nullBitmap null bitmap
   * @returns {*}     data
   */
  static readRowData(index, column, opts, connOpts, packet, nullBitmap) {
    if ((nullBitmap[Math.floor((index + 2) / 8)] & (1 << (index + 2) % 8)) > 0) {
      if (column.columnType == FieldType.GEOMETRY && column.dataTypeName) {
        switch (column.dataTypeName) {
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
            return { type: column.dataTypeName };
        }
      }
      return null;
    }

    switch (column.columnType) {
      case FieldType.TINY:
        return column.signed() ? packet.readInt8() : packet.readUInt8();
      case FieldType.YEAR:
      case FieldType.SHORT:
        return column.signed() ? packet.readInt16() : packet.readUInt16();
      case FieldType.INT24:
        const result = column.signed() ? packet.readInt24() : packet.readUInt24();
        packet.skip(1); // MEDIUMINT is encoded on 4 bytes in exchanges !
        return result;
      case FieldType.INT:
        return column.signed() ? packet.readInt32() : packet.readUInt32();
      case FieldType.FLOAT:
        return packet.readFloat();
      case FieldType.DOUBLE:
        return packet.readDouble();
      case FieldType.BIGINT:
        const val = column.signed() ? packet.readBigInt64() : packet.readBigUInt64();
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
      case FieldType.DECIMAL:
      case FieldType.NEWDECIMAL:
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
      case FieldType.DATE:
        return packet.readBinaryDate(opts);
      case FieldType.DATETIME:
      case FieldType.TIMESTAMP:
        return packet.readBinaryDateTime(opts, column);
      case FieldType.TIME:
        return packet.readBinaryTime();
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
    column.string = () =>
      (nullBitmap[Math.floor((index + 2) / 8)] & (1 << (index + 2) % 8)) > 0
        ? null
        : packet.readStringLength();
    column.buffer = () =>
      (nullBitmap[Math.floor((index + 2) / 8)] & (1 << (index + 2) % 8)) > 0
        ? null
        : packet.readBufferLengthEncoded();
    column.float = () =>
      (nullBitmap[Math.floor((index + 2) / 8)] & (1 << (index + 2) % 8)) > 0
        ? null
        : packet.readFloat();
    column.tiny = () =>
      (nullBitmap[Math.floor((index + 2) / 8)] & (1 << (index + 2) % 8)) > 0
        ? null
        : column.signed()
        ? packet.readInt8()
        : packet.readUInt8();
    column.short = () =>
      (nullBitmap[Math.floor((index + 2) / 8)] & (1 << (index + 2) % 8)) > 0
        ? null
        : column.signed()
        ? packet.readInt16()
        : packet.readUInt16();
    column.int = () =>
      (nullBitmap[Math.floor((index + 2) / 8)] & (1 << (index + 2) % 8)) > 0
        ? null
        : packet.readInt32();
    column.long = () =>
      (nullBitmap[Math.floor((index + 2) / 8)] & (1 << (index + 2) % 8)) > 0
        ? null
        : packet.readBigInt64();
    column.decimal = () =>
      (nullBitmap[Math.floor((index + 2) / 8)] & (1 << (index + 2) % 8)) > 0
        ? null
        : packet.readDecimalLengthEncoded();
    column.date = () =>
      (nullBitmap[Math.floor((index + 2) / 8)] & (1 << (index + 2) % 8)) > 0
        ? null
        : packet.readBinaryDate(opts);
    column.datetime = () =>
      (nullBitmap[Math.floor((index + 2) / 8)] & (1 << (index + 2) % 8)) > 0
        ? null
        : packet.readBinaryDateTime(opts);

    column.geometry = () => {
      if ((nullBitmap[Math.floor((index + 2) / 8)] & (1 << (index + 2) % 8)) > 0) {
        if (column.dataTypeName) {
          switch (column.dataTypeName) {
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
              return { type: column.dataTypeName };
          }
        }
        return null;
      }
      return column.readGeometry();
    };
  }
}

module.exports = BinaryDecoder;
