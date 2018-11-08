"use strict";

const ResultSet = require("./resultset");

class CommonBinary extends ResultSet {
  constructor(resolve, reject, cmdOpts, connOpts, sql, values) {
    super(resolve, reject);
    this.configAssign(connOpts, cmdOpts);
    this.sql = sql;
    this.initialValues = values;
  }

  /**
   * Write (and escape) current parameter value to output writer
   *
   * @param out     output writer
   * @param value   current parameter
   * @param opts    connection options
   * @param info    connection information
   */
  writeParam(out, value, opts, info) {
    out.writeInt8(0x00);
    switch (typeof value) {
      case "boolean":
        out.writeInt8(value ? 0x01 : 0x00);
        break;
      case "number":
        out.writeLengthStringAscii("" + value);
        break;
      case "object":
        if (Object.prototype.toString.call(value) === "[object Date]") {
          out.writeBinaryDate(value, opts);
        } else if (Buffer.isBuffer(value)) {
          out.writeLengthEncodedBuffer(value);
        } else if (typeof value.toSqlString === "function") {
          out.writeStringEscapeQuote(String(value.toSqlString()));
        } else {
          if (
            value.type != null &&
            [
              "Point",
              "LineString",
              "Polygon",
              "MultiPoint",
              "MultiLineString",
              "MultiPolygon",
              "GeometryCollection"
            ].includes(value.type)
          ) {
            //TODO implement geometry binary format.
          } else {
            //TODO check if permitSetMultiParamEntries is needed !?
            out.writeLengthEncodedString(JSON.stringify(value));
          }
        }
        break;
      default:
        out.writeLengthEncodedString(value);
    }
  }

  /**
   * Read text result-set row
   *
   * see: https://mariadb.com/kb/en/library/resultset-row/#text-resultset-row
   * data are created according to their type.
   *
   * @param columns     columns metadata
   * @param packet      current row packet
   * @param connOpts    connection options
   * @returns {*}       row data
   */
  parseRow(columns, packet, connOpts) {
    throw new Error("not implemented");
  }
}

module.exports = CommonBinary;
