"use strict";

const Collations = require("../const/collations.js");
const FieldType = require("../const/field-type");

/**
 * Column definition
 * see https://mariadb.com/kb/en/library/resultset/#column-definition-packet
 */

module.exports.parseColumn = function(packet, clientEncoding) {
  const initial = packet.pos + 4; //skip 'def'
  packet.positionFromEnd(12); //fixed length field

  const collation = Collations.fromIndex(packet.readUInt16());
  const columnLength = packet.readUInt32();
  const columnType = packet.readUInt8();
  const flags = packet.readUInt16();
  const scale = packet.readUInt8();

  return {
    collation: collation,
    columnLength: columnLength,
    columnType: columnType,
    scale: scale,
    type: FieldType.TYPES[columnType],
    flags: flags,
    db: getStringProperty.bind(this, packet, initial, clientEncoding, 0),
    schema: getStringProperty.bind(this, packet, initial, clientEncoding, 0),
    table: getStringProperty.bind(this, packet, initial, clientEncoding, 1),
    orgTable: getStringProperty.bind(this, packet, initial, clientEncoding, 2),
    name: getStringProperty.bind(this, packet, initial, clientEncoding, 3),
    orgName: getStringProperty.bind(this, packet, initial, clientEncoding, 4)
  };
};

function getStringProperty(packet, initial, clientEncoding, index) {
  packet.forceOffset(initial);
  for (let j = 0; j < index; j++) packet.skipLengthCodedNumber();
  return packet.readStringLengthEncoded(clientEncoding);
}
