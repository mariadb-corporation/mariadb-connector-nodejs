'use strict';

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

      if (isNullBitmap(index, nullBitmap)) {
        return defaultVal;
      }
      return column.readGeometry(defaultVal);
    };
  }
}

module.exports = TextDecoder;
