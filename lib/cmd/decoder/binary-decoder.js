'use strict';

class BinaryDecoder {
  static newRow(packet, columns) {
    packet.skip(1); // skip 0x00 header.
    return packet.readBuffer(Math.floor((columns.length + 9) / 8));
  }

  static castWrapper(column, packet, index, nullBitmap, opts) {
    column.string = () => (isNullBitmap(index, nullBitmap) ? null : packet.readStringLength());
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
    column.datetime = () => (isNullBitmap(index, nullBitmap) ? null : packet.readBinaryDateTime(opts));

    column.geometry = () => {
      if (isNullBitmap(index, nullBitmap)) {
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
const isNullBitmap = (index, nullBitmap) => {
  return (nullBitmap[Math.floor((index + 2) / 8)] & (1 << (index + 2) % 8)) > 0;
};
module.exports = BinaryDecoder;
