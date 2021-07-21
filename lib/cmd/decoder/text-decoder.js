'use strict';

class TextDecoder {
  static castWrapper(column, packet, index, nullBitmap, opts) {
    column.string = () => packet.readStringLength();
    column.buffer = () => packet.readBufferLengthEncoded();
    column.float = () => packet.readFloatLengthCoded();
    column.tiny = () => packet.readIntLengthEncoded();
    column.short = () => packet.readIntLengthEncoded();
    column.int = () => packet.readIntLengthEncoded();
    column.long = () => packet.readBigIntLengthEncoded();
    column.decimal = () => packet.readDecimalLengthEncoded();
    column.date = () => packet.readDate(opts);
    column.datetime = () => packet.readDateTime(opts);
    column.geometry = () => column.readGeometry();
  }
}

module.exports = TextDecoder;
