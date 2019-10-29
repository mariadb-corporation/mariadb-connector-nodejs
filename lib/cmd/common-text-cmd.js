'use strict';

const ResultSet = require('./resultset');
const FieldDetail = require('../const/field-detail');
const FieldType = require('../const/field-type');
const Long = require('long');
const QUOTE = 0x27;

class CommonText extends ResultSet {
  constructor(resolve, reject, cmdOpts, connOpts, sql, values) {
    super(resolve, reject);
    this.configAssign(connOpts, cmdOpts);
    this.sql = sql;
    this.initialValues = values;
    this.getDateQuote = this.opts.tz ? CommonText.getTimezoneDate : CommonText.getLocalDate;
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
      case 'boolean':
        out.writeStringAscii(value ? 'true' : 'false');
        break;
      case 'number':
        out.writeStringAscii('' + value);
        break;
      case 'object':
        if (Object.prototype.toString.call(value) === '[object Date]') {
          out.writeStringAscii(this.getDateQuote(value, opts));
        } else if (Buffer.isBuffer(value)) {
          out.writeStringAscii("_BINARY '");
          out.writeBufferEscape(value);
          out.writeInt8(QUOTE);
        } else if (typeof value.toSqlString === 'function') {
          out.writeStringEscapeQuote(String(value.toSqlString()));
        } else if (Long.isLong(value)) {
          out.writeStringAscii(value.toString());
        } else if (Array.isArray(value)) {
          out.writeStringAscii('(');
          for (let i = 0; i < value.length; i++) {
            if (i !== 0) out.writeStringAscii(',');
            this.writeParam(out, value[i], opts, info);
          }
          out.writeStringAscii(')');
        } else {
          if (
            value.type != null &&
            [
              'Point',
              'LineString',
              'Polygon',
              'MultiPoint',
              'MultiLineString',
              'MultiPolygon',
              'GeometryCollection'
            ].includes(value.type)
          ) {
            //GeoJSON format.
            let prefix =
              (info.isMariaDB() && info.hasMinVersion(10, 1, 4)) ||
              (!info.isMariaDB() && info.hasMinVersion(5, 7, 6))
                ? 'ST_'
                : '';
            switch (value.type) {
              case 'Point':
                out.writeStringAscii(
                  prefix +
                    "PointFromText('POINT(" +
                    CommonText.geoPointToString(value.coordinates) +
                    ")')"
                );
                break;

              case 'LineString':
                out.writeStringAscii(
                  prefix +
                    "LineFromText('LINESTRING(" +
                    CommonText.geoArrayPointToString(value.coordinates) +
                    ")')"
                );
                break;

              case 'Polygon':
                out.writeStringAscii(
                  prefix +
                    "PolygonFromText('POLYGON(" +
                    CommonText.geoMultiArrayPointToString(value.coordinates) +
                    ")')"
                );
                break;

              case 'MultiPoint':
                out.writeStringAscii(
                  prefix +
                    "MULTIPOINTFROMTEXT('MULTIPOINT(" +
                    CommonText.geoArrayPointToString(value.coordinates) +
                    ")')"
                );
                break;

              case 'MultiLineString':
                out.writeStringAscii(
                  prefix +
                    "MLineFromText('MULTILINESTRING(" +
                    CommonText.geoMultiArrayPointToString(value.coordinates) +
                    ")')"
                );
                break;

              case 'MultiPolygon':
                out.writeStringAscii(
                  prefix +
                    "MPolyFromText('MULTIPOLYGON(" +
                    CommonText.geoMultiPolygonToString(value.coordinates) +
                    ")')"
                );
                break;

              case 'GeometryCollection':
                out.writeStringAscii(
                  prefix +
                    "GeomCollFromText('GEOMETRYCOLLECTION(" +
                    CommonText.geometricCollectionToString(value.geometries) +
                    ")')"
                );
                break;
            }
          } else {
            if (opts.permitSetMultiParamEntries) {
              let first = true;
              for (let key in value) {
                const val = value[key];
                if (typeof val === 'function') continue;
                if (first) {
                  first = false;
                } else {
                  out.writeStringAscii(',');
                }
                out.writeString('`' + key + '`');
                out.writeStringAscii('=');
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

  static geometricCollectionToString(geo) {
    if (!geo) return '';
    let st = '';
    for (let i = 0; i < geo.length; i++) {
      //GeoJSON format.
      st += i !== 0 ? ',' : '';
      switch (geo[i].type) {
        case 'Point':
          st += 'POINT(' + CommonText.geoPointToString(geo[i].coordinates) + ')';
          break;

        case 'LineString':
          st += 'LINESTRING(' + CommonText.geoArrayPointToString(geo[i].coordinates) + ')';
          break;

        case 'Polygon':
          st += 'POLYGON(' + CommonText.geoMultiArrayPointToString(geo[i].coordinates) + ')';
          break;

        case 'MultiPoint':
          st += 'MULTIPOINT(' + CommonText.geoArrayPointToString(geo[i].coordinates) + ')';
          break;

        case 'MultiLineString':
          st +=
            'MULTILINESTRING(' + CommonText.geoMultiArrayPointToString(geo[i].coordinates) + ')';
          break;

        case 'MultiPolygon':
          st += 'MULTIPOLYGON(' + CommonText.geoMultiPolygonToString(geo[i].coordinates) + ')';
          break;
      }
    }
    return st;
  }

  static geoMultiPolygonToString(coords) {
    if (!coords) return '';
    let st = '';
    for (let i = 0; i < coords.length; i++) {
      st += (i !== 0 ? ',(' : '(') + CommonText.geoMultiArrayPointToString(coords[i]) + ')';
    }
    return st;
  }

  static geoMultiArrayPointToString(coords) {
    if (!coords) return '';
    let st = '';
    for (let i = 0; i < coords.length; i++) {
      st += (i !== 0 ? ',(' : '(') + CommonText.geoArrayPointToString(coords[i]) + ')';
    }
    return st;
  }

  static geoArrayPointToString(coords) {
    if (!coords) return '';
    let st = '';
    for (let i = 0; i < coords.length; i++) {
      st += (i !== 0 ? ',' : '') + CommonText.geoPointToString(coords[i]);
    }
    return st;
  }

  static geoPointToString(coords) {
    if (!coords) return '';
    return (isNaN(coords[0]) ? '' : coords[0]) + ' ' + (isNaN(coords[1]) ? '' : coords[1]);
  }

  parseRowAsArray(columns, packet, connOpts) {
    const row = new Array(this._columnCount);
    for (let i = 0; i < this._columnCount; i++) {
      row[i] = this._getValue(i, columns[i], this.opts, connOpts, packet);
    }
    return row;
  }

  parseRowNested(columns, packet, connOpts) {
    const row = {};
    for (let i = 0; i < this._columnCount; i++) {
      if (!row[this.tableHeader[i][0]]) row[this.tableHeader[i][0]] = {};
      row[this.tableHeader[i][0]][this.tableHeader[i][1]] = this._getValue(
        i,
        columns[i],
        this.opts,
        connOpts,
        packet
      );
    }
    return row;
  }

  parseRowStd(columns, packet, connOpts) {
    const row = {};
    for (let i = 0; i < this._columnCount; i++) {
      row[this.tableHeader[i]] = this._getValue(i, columns[i], this.opts, connOpts, packet);
    }
    return row;
  }

  castTextWrapper(column, opts, connOpts, packet) {
    column.string = () => packet.readStringLength();
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
    column.date = () => packet.readDateTime(opts);
    column.geometry = () => {
      return column.readGeometry();
    };
  }

  readCastValue(index, column, opts, connOpts, packet) {
    this.castTextWrapper(column, opts, connOpts, packet);
    return opts.typeCast(
      column,
      this.readRowData.bind(this, index, column, opts, connOpts, packet)
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
        return packet.readDateTime(opts);
      case FieldType.TIME:
        return packet.readAsciiStringLengthEncoded();
      case FieldType.GEOMETRY:
        return packet.readGeometry();
      case FieldType.JSON:
        //for mysql only => parse string as JSON object
        return JSON.parse(packet.readStringLengthEncoded('utf8'));

      default:
        if (column.collation.index === 63) {
          return packet.readBufferLengthEncoded();
        }
        const string = packet.readStringLength();
        if (column.flags & 2048) {
          //SET
          return string == null ? null : string === '' ? [] : string.split(',');
        }
        return string;
    }
  }
}

function getDatePartQuote(year, mon, day, hour, min, sec, ms) {
  //return 'YYYY-MM-DD HH:MM:SS' datetime format
  //see https://mariadb.com/kb/en/library/datetime/
  return (
    "'" +
    (year > 999 ? year : year > 99 ? '0' + year : year > 9 ? '00' + year : '000' + year) +
    '-' +
    (mon < 10 ? '0' : '') +
    mon +
    '-' +
    (day < 10 ? '0' : '') +
    day +
    ' ' +
    (hour < 10 ? '0' : '') +
    hour +
    ':' +
    (min < 10 ? '0' : '') +
    min +
    ':' +
    (sec < 10 ? '0' : '') +
    sec +
    '.' +
    (ms > 99 ? ms : ms > 9 ? '0' + ms : '00' + ms) +
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
  if (date.getMilliseconds() != 0) {
    return opts.tz(date).format("'YYYY-MM-DD HH:mm:ss.SSS'");
  }
  return opts.tz(date).format("'YYYY-MM-DD HH:mm:ss'");
}

module.exports = CommonText;
module.exports.getTimezoneDate = getTimezoneDate;
module.exports.getLocalDate = getLocalDate;
