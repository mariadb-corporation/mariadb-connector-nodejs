//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import Collations from '../const/collations.js';
import * as FieldType from '../const/field-type.js';
import * as FieldDetails from '../const/field-detail.js';
import * as Capabilities from '../const/capabilities.js';

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
              this.dataTypeName = subPacket.readAsciiStringLengthEncoded();
              break;

            case 1:
              this.dataTypeFormat = subPacket.readAsciiStringLengthEncoded();
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
      pos += type < 0xfb ? type : 2 + this.buf[pos] + this.buf[pos + 1] * 2 ** 8;
    }

    const type = this.buf[pos++];
    const len = type < 0xfb ? type : this.buf[pos++] + this.buf[pos++] * 2 ** 8;

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
    const len = type < 0xfb ? type : this.buf[pos++] + this.buf[pos++] * 2 ** 8;
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
