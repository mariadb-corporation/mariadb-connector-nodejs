"use strict";

const ResultSet = require("./resultset");
const FieldDetail = require("../const/field-detail");
const FieldType = require("../const/field-type");
const QUOTE = 0x27;

class CommonText extends ResultSet {
  constructor(resolve, reject, cmdOpts, connOpts, sql, values) {
    super(resolve, reject);
    this.configAssign(connOpts, cmdOpts);
    this.sql = sql;
    this.initialValues = values;
    this.getDateQuote = this.opts.timezone === "local" ? getLocalDate : getTimezoneDate;
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
    switch (typeof value) {
      case "boolean":
        out.writeStringAscii(value ? "true" : "false");
        break;
      case "number":
        out.writeStringAscii("" + value);
        break;
      case "object":
        if (Object.prototype.toString.call(value) === "[object Date]") {
          out.writeStringAscii(this.getDateQuote(value, opts));
        } else if (Buffer.isBuffer(value)) {
          out.writeStringAscii("_BINARY '");
          out.writeBufferEscape(value);
          out.writeInt8(QUOTE);
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
            //GeoJSON format.
            let prefix =
              (info.isMariaDB() && info.hasMinVersion(10, 1, 4)) ||
              (!info.isMariaDB() && info.hasMinVersion(5, 7, 6))
                ? "ST_"
                : "";
            switch (value.type) {
              case "Point":
                out.writeStringAscii(
                  prefix +
                    "PointFromText('POINT(" +
                    this.geoPointToString(value.coordinates) +
                    ")')"
                );
                break;

              case "LineString":
                out.writeStringAscii(
                  prefix +
                    "LineFromText('LINESTRING(" +
                    this.geoArrayPointToString(value.coordinates) +
                    ")')"
                );
                break;

              case "Polygon":
                out.writeStringAscii(
                  prefix +
                    "PolygonFromText('POLYGON(" +
                    this.geoMultiArrayPointToString(value.coordinates) +
                    ")')"
                );
                break;

              case "MultiPoint":
                out.writeStringAscii(
                  prefix +
                    "MULTIPOINTFROMTEXT('MULTIPOINT(" +
                    this.geoArrayPointToString(value.coordinates) +
                    ")')"
                );
                break;

              case "MultiLineString":
                out.writeStringAscii(
                  prefix +
                    "MLineFromText('MULTILINESTRING(" +
                    this.geoMultiArrayPointToString(value.coordinates) +
                    ")')"
                );
                break;

              case "MultiPolygon":
                out.writeStringAscii(
                  prefix +
                    "MPolyFromText('MULTIPOLYGON(" +
                    this.geoMultiPolygonToString(value.coordinates) +
                    ")')"
                );
                break;

              case "GeometryCollection":
                out.writeStringAscii(
                  prefix +
                    "GeomCollFromText('GEOMETRYCOLLECTION(" +
                    this.geometricCollectionToString(value.geometries) +
                    ")')"
                );
                break;
            }
          } else {
            if (opts.permitSetMultiParamEntries) {
              let first = true;
              for (let key in value) {
                const val = value[key];
                if (typeof val === "function") continue;
                if (first) {
                  first = false;
                } else {
                  out.writeStringAscii(",");
                }
                out.writeString("`" + key + "`");
                out.writeStringAscii("=");
                this.writeParam(out, val, opts, info);
              }
              if (first) out.writeStringEscapeQuote(JSON.stringify(value));
            } else {
              out.writeStringEscapeQuote(JSON.stringify(value));
            }
          }
        }
        break;
      default:
        out.writeStringEscapeQuote(value);
    }
  }

  geometricCollectionToString(geo) {
    if (!geo) return "";
    let st = "";
    for (let i = 0; i < geo.length; i++) {
      //GeoJSON format.
      st += i != 0 ? "," : "";
      switch (geo[i].type) {
        case "Point":
          st += "POINT(" + this.geoPointToString(geo[i].coordinates) + ")";
          break;

        case "LineString":
          st += "LINESTRING(" + this.geoArrayPointToString(geo[i].coordinates) + ")";
          break;

        case "Polygon":
          st += "POLYGON(" + this.geoMultiArrayPointToString(geo[i].coordinates) + ")";
          break;

        case "MultiPoint":
          st += "MULTIPOINT(" + this.geoArrayPointToString(geo[i].coordinates) + ")";
          break;

        case "MultiLineString":
          st += "MULTILINESTRING(" + this.geoMultiArrayPointToString(geo[i].coordinates) + ")";
          break;

        case "MultiPolygon":
          st += "MULTIPOLYGON(" + this.geoMultiPolygonToString(geo[i].coordinates) + ")";
          break;
      }
    }
    return st;
  }

  geoMultiPolygonToString(coords) {
    if (!coords) return "";
    let st = "";
    for (let i = 0; i < coords.length; i++) {
      st += (i != 0 ? ",(" : "(") + this.geoMultiArrayPointToString(coords[i]) + ")";
    }
    return st;
  }

  geoMultiArrayPointToString(coords) {
    if (!coords) return "";
    let st = "";
    for (let i = 0; i < coords.length; i++) {
      st += (i != 0 ? ",(" : "(") + this.geoArrayPointToString(coords[i]) + ")";
    }
    return st;
  }

  geoArrayPointToString(coords) {
    if (!coords) return "";
    let st = "";
    for (let i = 0; i < coords.length; i++) {
      st += (i != 0 ? "," : "") + this.geoPointToString(coords[i]);
    }
    return st;
  }

  geoPointToString(coords) {
    if (!coords) return "";
    return (isNaN(coords[0]) ? "" : coords[0]) + " " + (isNaN(coords[1]) ? "" : coords[1]);
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
    let row;
    if (this.opts.rowsAsArray) {
      row = new Array(columns.length);
      for (let i = 0; i < columns.length; i++) {
        row[i] = this._getValue(i, columns[i], this.opts, connOpts, packet);
      }
    } else if (this.opts.nestTables === true) {
      row = {};
      for (let i = 0; i < columns.length; i++) {
        if (!row[this.tableHeader[i][0]]) row[this.tableHeader[i][0]] = {};
        row[this.tableHeader[i][0]][this.tableHeader[i][1]] = this._getValue(
          i,
          columns[i],
          this.opts,
          connOpts,
          packet
        );
      }
    } else {
      row = {};
      for (let i = 0; i < columns.length; i++) {
        row[this.tableHeader[i]] = this._getValue(i, columns[i], this.opts, connOpts, packet);
      }
    }

    return row;
  }

  castTextWrapper(column, opts, connOpts, packet) {
    column.string = () => packet.readStringLengthEncoded(connOpts.collation.encoding);
    column.buffer = () => packet.readBufferLengthEncoded();
    column.float = () => packet.readFloatLengthCoded();
    column.int = () => packet.readIntLengthEncoded();
    column.long = () =>
      packet.readLongLengthEncoded(
        opts.supportBigNumbers,
        opts.bigNumberStrings,
        (column.flags & FieldDetail.UNSIGNED) > 0
      );
    column.decimal = () =>
      packet.readDecimalLengthEncoded(opts.supportBigNumbers, opts.bigNumberStrings);
    column.date = () =>
      packet.readDecimalLengthEncoded(opts.supportBigNumbers, opts.bigNumberStrings);
    column.geometry = () => {
      //TODO parse geometry
      return null;
    };
  }

  readCastValue(index, column, opts, connOpts, packet) {
    this.castTextWrapper(column, opts, connOpts, packet);
    return opts.typeCast(
      column,
      function() {
        return this.readRowData(index, column, opts, connOpts, packet);
      }.bind(this)
    );
  }

  /**
   * Read row data.
   *
   * @param index     current data index in row
   * @param column    associate metadata
   * @param opts   query options
   * @param connOpts  connection options
   * @param packet    row packet
   * @returns {*}     data
   */
  readRowData(index, column, opts, connOpts, packet) {
    switch (column.columnType) {
      case FieldType.ENUM:
        //TODO handle enum field type
        return 0;
      case FieldType.TINY:
      case FieldType.SHORT:
      case FieldType.LONG:
      case FieldType.INT24:
      case FieldType.YEAR:
        return packet.readIntLengthEncoded();
      case FieldType.FLOAT:
      case FieldType.DOUBLE:
        return packet.readFloatLengthCoded();
      case FieldType.LONGLONG:
        return packet.readLongLengthEncoded(
          opts.supportBigNumbers,
          opts.bigNumberStrings,
          (column.flags & FieldDetail.UNSIGNED) > 0
        );
      case FieldType.DECIMAL:
      case FieldType.NEWDECIMAL:
        return packet.readDecimalLengthEncoded(opts.supportBigNumbers, opts.bigNumberStrings);
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
        return packet.readDateTime();
      case FieldType.TIME:
        return packet.readAsciiStringLengthEncoded();
      case FieldType.GEOMETRY:
        return packet.readGeometry();
      case FieldType.JSON:
        //for mysql only => parse string as JSON object
        return JSON.parse(packet.readStringLengthEncoded("utf8"));

      default:
        if (column.collation.index === 63) {
          return packet.readBufferLengthEncoded();
        } else {
          return packet.readStringLengthEncoded(connOpts.collation.encoding);
        }
    }
  }
}

function getDatePartQuote(year, mon, day, hour, min, sec, ms) {
  //return 'YYYY-MM-DD HH:MM:SS' datetime format
  //see https://mariadb.com/kb/en/library/datetime/
  return (
    "'" +
    (year > 999 ? year : year > 99 ? "0" + year : year > 9 ? "00" + year : "000" + year) +
    "-" +
    (mon < 10 ? "0" : "") +
    mon +
    "-" +
    (day < 10 ? "0" : "") +
    day +
    " " +
    (hour < 10 ? "0" : "") +
    hour +
    ":" +
    (min < 10 ? "0" : "") +
    min +
    ":" +
    (sec < 10 ? "0" : "") +
    sec +
    "." +
    (ms > 99 ? ms : ms > 9 ? "0" + ms : "00" + ms) +
    "'"
  );
}

function getLocalDate(date, opts) {
  const year = date.getFullYear();
  const mon = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const min = date.getMinutes();
  const sec = date.getSeconds();
  const ms = date.getMilliseconds();
  return getDatePartQuote(year, mon, day, hour, min, sec, ms);
}

function getTimezoneDate(date, opts) {
  if (opts.timezoneMillisOffset) {
    date.setTime(date.getTime() + opts.timezoneMillisOffset);
  }

  const year = date.getUTCFullYear();
  const mon = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hour = date.getUTCHours();
  const min = date.getUTCMinutes();
  const sec = date.getUTCSeconds();
  const ms = date.getUTCMilliseconds();
  return getDatePartQuote(year, mon, day, hour, min, sec, ms);
}

module.exports = CommonText;
