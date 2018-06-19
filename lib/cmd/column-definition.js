"use strict";

const Collations = require("../const/collations.js");
const FieldDetail = require("../const/field-detail");
const FieldType = require("../const/field-type");

/**
 * Column definition
 * see https://mariadb.com/kb/en/library/resultset/#column-definition-packet
 */
class ColumnDefinition {
  constructor(packet, clientEncoding) {
    this._packet = packet;
    this._initial = packet.pos + 4; //skip 'def'
    packet.positionFromEnd(12); //fixed length field
    this.collation = Collations.fromIndex(packet.readUInt16());
    this.columnLength = packet.readUInt32();
    this.columnType = packet.readUInt8();
    this._flags = packet.readUInt16();
    this.scale = packet.readUInt8();
    this._clientEncoding = clientEncoding;
  }

  isUnsigned() {
    return (this._flags & FieldDetail.UNSIGNED) > 0;
  }

  canBeNull() {
    return (this._flags & FieldDetail.NOT_NULL) === 0;
  }

  isPrimaryKey() {
    return (this._flags & FieldDetail.PRIMARY_KEY) > 0;
  }

  isUniqueKey() {
    return (this._flags & FieldDetail.UNIQUE_KEY) > 0;
  }

  isMultipleKey() {
    return (this._flags & FieldDetail.MULTIPLE_KEY) > 0;
  }

  isBlob() {
    return (this._flags & FieldDetail.BLOB) > 0;
  }

  isZeroFill() {
    return (this._flags & FieldDetail.ZEROFILL_FLAG) > 0;
  }

  isBinary() {
    // doesn't use & BINARY_COLLATION bit filter,
    // because char binary and varchar binary are not binary (handle like string), but have the binary flag
    return this.collation.index === 63;
  }
  isAutoIncrement() {
    return (this._flags & FieldDetail.AUTO_INCREMENT) > 0;
  }

  /**
   * Return metadata precision.
   * For example, the number 123.45 has a precision of 5 and a scale of 2.
   *
   * @returns {*}
   */
  getPrecision() {
    switch (this.columnType) {
      case FieldType.NEWDECIMAL:
      case FieldType.DECIMAL:
        //DECIMAL and NEWDECIMAL are "exact" fixed-point number.
        //so :
        // - if can be signed, 1 byte is saved for sign
        // - if decimal > 0, one byte more for dot
        if (this.isUnsigned()) {
          return this.columnLength - (this.scale > 0 ? 1 : 0);
        } else {
          return this.columnLength - (this.scale > 0 ? 2 : 1);
        }
      default:
        return this.columnLength;
    }
  }

  /**
   * Return scale.
   * For example, the number 123.45 has a precision of 5 and a scale of 2.
   *
   * @returns {*}
   */
  getScale() {
    return this.scale;
  }

  /**
   * Get column max displayed size.
   */
  getDisplaySize() {
    switch (this.columnType) {
      case FieldType.VARCHAR:
      case FieldType.ENUM:
      case FieldType.SET:
      case FieldType.VAR_STRING:
      case FieldType.STRING:
        return this.columnLength / this.collation.maxlen;
    }
    return this.columnLength;
  }
}

const addProperty = (name, index) => {
  Object.defineProperty(ColumnDefinition.prototype, name, {
    get() {
      this._packet.forceOffset(this._initial);
      for (let j = 0; j < index; j++) this._packet.skipLengthCodedNumber();
      return this._packet.readStringLengthEncoded(this._clientEncoding);
    }
  });
};

const props = ["db", "table", "orgTable", "name", "orgName"];
for (let i = 0; i < props.length; i++) {
  addProperty(props[i], i);
}
//add alias for mysql2 compatibility
addProperty("schema", 0);

//add alias for option "typecast" wrapper
Object.defineProperty(ColumnDefinition.prototype, "length", {
  get() {
    return this.columnLength;
  }
});
Object.defineProperty(ColumnDefinition.prototype, "type", {
  get() {
    return FieldType.TYPES[this.columnType];
  }
});

module.exports = ColumnDefinition;
