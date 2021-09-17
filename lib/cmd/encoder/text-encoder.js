'use strict';

const moment = require('moment-timezone');
const QUOTE = 0x27;

class TextEncoder {
  constructor(opts) {
    this.getDateQuote = opts.tz
      ? opts.tz === 'Etc/UTC'
        ? TextEncoder.getUtcDate
        : TextEncoder.getTimezoneDate
      : TextEncoder.getLocalDate;
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
      case 'bigint':
      case 'number':
        out.writeStringAscii('' + value);
        break;
      case 'object':
        if (value === null) {
          out.writeStringAscii('NULL');
        } else if (Object.prototype.toString.call(value) === '[object Date]') {
          out.writeStringAscii(this.getDateQuote(value, opts));
        } else if (Buffer.isBuffer(value)) {
          out.writeStringAscii("_BINARY '");
          out.writeBufferEscape(value);
          out.writeInt8(QUOTE);
        } else if (typeof value.toSqlString === 'function') {
          out.writeStringEscapeQuote(String(value.toSqlString()));
        } else if (Array.isArray(value)) {
          if (opts.arrayParenthesis) {
            out.writeStringAscii('(');
          }
          for (let i = 0; i < value.length; i++) {
            if (i !== 0) out.writeStringAscii(',');
            this.writeParam(out, value[i], opts, info);
          }
          if (opts.arrayParenthesis) {
            out.writeStringAscii(')');
          }
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
              (info.isMariaDB() && info.hasMinVersion(10, 1, 4)) || (!info.isMariaDB() && info.hasMinVersion(5, 7, 6))
                ? 'ST_'
                : '';
            switch (value.type) {
              case 'Point':
                out.writeStringAscii(
                  prefix + "PointFromText('POINT(" + TextEncoder.geoPointToString(value.coordinates) + ")')"
                );
                break;

              case 'LineString':
                out.writeStringAscii(
                  prefix + "LineFromText('LINESTRING(" + TextEncoder.geoArrayPointToString(value.coordinates) + ")')"
                );
                break;

              case 'Polygon':
                out.writeStringAscii(
                  prefix +
                    "PolygonFromText('POLYGON(" +
                    TextEncoder.geoMultiArrayPointToString(value.coordinates) +
                    ")')"
                );
                break;

              case 'MultiPoint':
                out.writeStringAscii(
                  prefix +
                    "MULTIPOINTFROMTEXT('MULTIPOINT(" +
                    TextEncoder.geoArrayPointToString(value.coordinates) +
                    ")')"
                );
                break;

              case 'MultiLineString':
                out.writeStringAscii(
                  prefix +
                    "MLineFromText('MULTILINESTRING(" +
                    TextEncoder.geoMultiArrayPointToString(value.coordinates) +
                    ")')"
                );
                break;

              case 'MultiPolygon':
                out.writeStringAscii(
                  prefix +
                    "MPolyFromText('MULTIPOLYGON(" +
                    TextEncoder.geoMultiPolygonToString(value.coordinates) +
                    ")')"
                );
                break;

              case 'GeometryCollection':
                out.writeStringAscii(
                  prefix +
                    "GeomCollFromText('GEOMETRYCOLLECTION(" +
                    TextEncoder.geometricCollectionToString(value.geometries) +
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
          st += `POINT(${TextEncoder.geoPointToString(geo[i].coordinates)})`;
          break;

        case 'LineString':
          st += `LINESTRING(${TextEncoder.geoArrayPointToString(geo[i].coordinates)})`;
          break;

        case 'Polygon':
          st += `POLYGON(${TextEncoder.geoMultiArrayPointToString(geo[i].coordinates)})`;
          break;

        case 'MultiPoint':
          st += `MULTIPOINT(${TextEncoder.geoArrayPointToString(geo[i].coordinates)})`;
          break;

        case 'MultiLineString':
          st += `MULTILINESTRING(${TextEncoder.geoMultiArrayPointToString(geo[i].coordinates)})`;
          break;

        case 'MultiPolygon':
          st += `MULTIPOLYGON(${TextEncoder.geoMultiPolygonToString(geo[i].coordinates)})`;
          break;
      }
    }
    return st;
  }

  static geoMultiPolygonToString(coords) {
    if (!coords) return '';
    let st = '';
    for (let i = 0; i < coords.length; i++) {
      st += (i !== 0 ? ',(' : '(') + TextEncoder.geoMultiArrayPointToString(coords[i]) + ')';
    }
    return st;
  }

  static geoMultiArrayPointToString(coords) {
    if (!coords) return '';
    let st = '';
    for (let i = 0; i < coords.length; i++) {
      st += (i !== 0 ? ',(' : '(') + TextEncoder.geoArrayPointToString(coords[i]) + ')';
    }
    return st;
  }

  static geoArrayPointToString(coords) {
    if (!coords) return '';
    let st = '';
    for (let i = 0; i < coords.length; i++) {
      st += (i !== 0 ? ',' : '') + TextEncoder.geoPointToString(coords[i]);
    }
    return st;
  }

  static geoPointToString(coords) {
    if (!coords) return '';
    return (isNaN(coords[0]) ? '' : coords[0]) + ' ' + (isNaN(coords[1]) ? '' : coords[1]);
  }

  static getLocalDate(date, opts) {
    const year = date.getFullYear();
    const mon = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const min = date.getMinutes();
    const sec = date.getSeconds();
    const ms = date.getMilliseconds();
    return TextEncoder.getDatePartQuote(year, mon, day, hour, min, sec, ms);
  }

  static getUtcDate(date, opts) {
    const year = date.getUTCFullYear();
    const mon = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const hour = date.getUTCHours();
    const min = date.getUTCMinutes();
    const sec = date.getUTCSeconds();
    const ms = date.getUTCMilliseconds();
    return TextEncoder.getDatePartQuote(year, mon, day, hour, min, sec, ms);
  }

  static getDatePartQuote(year, mon, day, hour, min, sec, ms) {
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

  static getTimezoneDate(date, opts) {
    if (date.getMilliseconds() !== 0) {
      return moment.tz(date, opts.tz).format("'YYYY-MM-DD HH:mm:ss.SSS'");
    }
    return moment.tz(date, opts.tz).format("'YYYY-MM-DD HH:mm:ss'");
  }
}

module.exports = TextEncoder;
