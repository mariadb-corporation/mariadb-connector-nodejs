//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import Collations from '../const/collations.js';
import * as FieldType from '../const/field-type.js';
import * as FieldDetails from '../const/field-detail.js';
import * as Capabilities from '../const/capabilities.js';

// Pre-computed byte constants for dataTypeName comparisons (ASCII lowercase)
const B_POINT = Buffer.from('point');
const B_LINESTRING = Buffer.from('linestring');
const B_POLYGON = Buffer.from('polygon');
const B_MULTIPOINT = Buffer.from('multipoint');
const B_MULTILINESTRING = Buffer.from('multilinestring');
const B_MULTIPOLYGON = Buffer.from('multipolygon');
const B_JSON = Buffer.from('json');

const GEO_DEFAULT_POINT = { type: 'Point' };
const GEO_DEFAULT_LINESTRING = { type: 'LineString' };
const GEO_DEFAULT_POLYGON = { type: 'Polygon' };
const GEO_DEFAULT_MULTIPOINT = { type: 'MultiPoint' };
const GEO_DEFAULT_MULTILINESTRING = { type: 'MultiLineString' };
const GEO_DEFAULT_MULTIPOLYGON = { type: 'MultiPolygon' };

// noinspection JSBitwiseOperatorUsage
/**
 * Column definition
 * see https://mariadb.com/kb/en/library/resultset/#column-definition-packet
 */
class ColumnDef {
  #stringParser;
  constructor(packet, info, skipName) {
    this.#stringParser = skipName ? new StringParser(packet) : new StringParserWithName(packet);
    if (info.clientCapabilities & Capabilities.MARIADB_CLIENT_EXTENDED_METADATA) {
      const len = packet.readUnsignedLength();
      if (len > 0) {
        const subPacket = packet.subPacketLengthEncoded(len);
        while (subPacket.remaining()) {
          switch (subPacket.readUInt8()) {
            case 0:
              this._dataTypeName = subPacket.readBufferLengthEncodedCopy();
              break;

            case 1:
              this._dataTypeFormat = subPacket.readBufferLengthEncodedCopy();
              break;

            default:
              subPacket.skip(subPacket.readUnsignedLength());
              break;
          }
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

  __getDefaultGeomVal() {
    const buf = this._dataTypeName;
    if (buf) {
      if (Buffer.compare(buf, B_POINT) === 0) return GEO_DEFAULT_POINT;
      if (Buffer.compare(buf, B_LINESTRING) === 0) return GEO_DEFAULT_LINESTRING;
      if (Buffer.compare(buf, B_POLYGON) === 0) return GEO_DEFAULT_POLYGON;
      if (Buffer.compare(buf, B_MULTIPOINT) === 0) return GEO_DEFAULT_MULTIPOINT;
      if (Buffer.compare(buf, B_MULTILINESTRING) === 0) return GEO_DEFAULT_MULTILINESTRING;
      if (Buffer.compare(buf, B_MULTIPOLYGON) === 0) return GEO_DEFAULT_MULTIPOLYGON;
      return { type: buf.toString('ascii') };
    }
    return null;
  }

  isDataTypeFormatJson() {
    return this._dataTypeFormat != null && Buffer.compare(this._dataTypeFormat, B_JSON) === 0;
  }

  get dataTypeName() {
    return this._dataTypeName ? this._dataTypeName.toString('ascii') : undefined;
  }

  db() {
    return this.#stringParser.db();
  }

  schema() {
    return this.#stringParser.schema();
  }

  table() {
    return this.#stringParser.table();
  }

  orgTable() {
    return this.#stringParser.orgTable();
  }

  name() {
    return this.#stringParser.name();
  }

  orgName() {
    return this.#stringParser.orgName();
  }

  signed() {
    return (this.flags & FieldDetails.UNSIGNED) === 0;
  }

  isSet() {
    return (this.flags & FieldDetails.SET) !== 0;
  }
}

/**
 * String parser.
 * This object permits avoiding listing all private information to a metadata object.
 */

class BaseStringParser {
  constructor(encoding, readFct, saveBuf, initialPos) {
    this.buf = saveBuf;
    this.encoding = encoding;
    this.readString = readFct;
    this.initialPos = initialPos;
  }

  _readIdentifier(skip) {
    let pos = this.initialPos;
    while (skip-- > 0) {
      const type = this.buf[pos++];
      pos += type < 0xfb ? type : 2 + this.buf[pos] + (this.buf[pos + 1] << 8);
    }

    const type = this.buf[pos++];
    const len = type < 0xfb ? type : this.buf[pos++] + (this.buf[pos++] << 8);

    return this.readString(this.encoding, this.buf, pos, len);
  }

  name() {
    return this._readIdentifier(3);
  }

  db() {
    let pos = this.initialPos;
    return this.readString(this.encoding, this.buf, pos + 1, this.buf[pos]);
  }

  schema() {
    return this.db();
  }

  table() {
    let pos = this.initialPos + 1 + this.buf[this.initialPos];

    const type = this.buf[pos++];
    const len = type < 0xfb ? type : this.buf[pos++] + (this.buf[pos++] << 8);
    return this.readString(this.encoding, this.buf, pos, len);
  }

  orgTable() {
    return this._readIdentifier(2);
  }

  orgName() {
    return this._readIdentifier(4);
  }
}

class StringParser extends BaseStringParser {
  constructor(packet) {
    packet.skip(packet.readUInt8()); //catalog
    const initPos = packet.pos;
    packet.skip(packet.readUInt8()); //schema
    packet.skip(packet.readMetadataLength()); //table alias
    packet.skip(packet.readUInt8()); //table
    packet.skip(packet.readMetadataLength()); //column alias
    packet.skip(packet.readUInt8()); //column

    super(packet.encoding, packet.constructor.readString, packet.buf, initPos);
  }
}

/**
 * String parser.
 * This object permits avoiding listing all private information to a metadata object.
 */
class StringParserWithName extends BaseStringParser {
  colName;
  constructor(packet) {
    packet.skip(packet.readUInt8()); //catalog
    const initPos = packet.pos;
    packet.skip(packet.readUInt8()); //schema
    packet.skip(packet.readMetadataLength()); //table alias
    packet.skip(packet.readUInt8()); //table
    const colName = packet.readStringLengthEncoded(); //column alias
    packet.skip(packet.readUInt8()); //column

    super(packet.encoding, packet.constructor.readString, packet.buf, initPos);
    this.colName = colName;
  }

  name() {
    return this.colName;
  }
}

export default ColumnDef;
