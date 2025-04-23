//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

const QUOTE = 0x27;

// Cache common GeoJSON types
const GEO_TYPES = new Set([
  'Point',
  'LineString',
  'Polygon',
  'MultiPoint',
  'MultiLineString',
  'MultiPolygon',
  'GeometryCollection'
]);

// Optimized function to pad numbers with leading zeros
const formatDigit = function (val, significantDigit) {
  const str = `${val}`;
  return str.length < significantDigit ? '0'.repeat(significantDigit - str.length) + str : str;
};

class TextEncoder {
  /**
   * Write (and escape) current parameter value to output writer
   *
   * @param out     output writer
   * @param value   current parameter. Expected to be non-null
   * @param opts    connection options
   * @param info    connection information
   */
  static writeParam(out, value, opts, info) {
    switch (typeof value) {
      case 'boolean':
        out.writeStringAscii(value ? 'true' : 'false');
        break;
      case 'bigint':
      case 'number':
        out.writeStringAscii(`${value}`);
        break;
      case 'string':
        out.writeStringEscapeQuote(value);
        break;
      case 'object':
        if (Object.prototype.toString.call(value) === '[object Date]') {
          out.writeStringAscii(TextEncoder.getLocalDate(value));
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
            if (value[i] == null) {
              out.writeStringAscii('NULL');
            } else TextEncoder.writeParam(out, value[i], opts, info);
          }

          if (opts.arrayParenthesis) {
            out.writeStringAscii(')');
          }
        } else {
          if (value.type != null && GEO_TYPES.has(value.type)) {
            //GeoJSON format.
            const isMariaDb = info.isMariaDB();
            const prefix =
              (isMariaDb && info.hasMinVersion(10, 1, 4)) || (!isMariaDb && info.hasMinVersion(5, 7, 6)) ? 'ST_' : '';

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
          } else if (String === value.constructor) {
            out.writeStringEscapeQuote(value);
            break;
          } else {
            if (opts.permitSetMultiParamEntries) {
              let first = true;
              for (const key in value) {
                const val = value[key];
                if (typeof val === 'function') continue;

                if (first) {
                  first = false;
                } else {
                  out.writeStringAscii(',');
                }

                out.writeString('`' + key + '`');

                if (val == null) {
                  out.writeStringAscii('=NULL');
                } else {
                  out.writeStringAscii('=');
                  TextEncoder.writeParam(out, val, opts, info);
                }
              }
              if (first) out.writeStringEscapeQuote(JSON.stringify(value));
            } else {
              out.writeStringEscapeQuote(JSON.stringify(value));
            }
          }
        }
        break;
    }
  }

  static geometricCollectionToString(geo) {
    if (!geo) return '';

    const len = geo.length;
    let st = '';

    for (let i = 0; i < len; i++) {
      const item = geo[i];
      //GeoJSON format.
      if (i !== 0) st += ',';

      switch (item.type) {
        case 'Point':
          st += `POINT(${TextEncoder.geoPointToString(item.coordinates)})`;
          break;

        case 'LineString':
          st += `LINESTRING(${TextEncoder.geoArrayPointToString(item.coordinates)})`;
          break;

        case 'Polygon':
          st += `POLYGON(${TextEncoder.geoMultiArrayPointToString(item.coordinates)})`;
          break;

        case 'MultiPoint':
          st += `MULTIPOINT(${TextEncoder.geoArrayPointToString(item.coordinates)})`;
          break;

        case 'MultiLineString':
          st += `MULTILINESTRING(${TextEncoder.geoMultiArrayPointToString(item.coordinates)})`;
          break;

        case 'MultiPolygon':
          st += `MULTIPOLYGON(${TextEncoder.geoMultiPolygonToString(item.coordinates)})`;
          break;
      }
    }
    return st;
  }

  static geoMultiPolygonToString(coords) {
    if (!coords) return '';

    const len = coords.length;
    if (len === 0) return '';

    let st = '(';

    for (let i = 0; i < len; i++) {
      if (i !== 0) st += ',(';
      st += TextEncoder.geoMultiArrayPointToString(coords[i]) + ')';
    }

    return st;
  }

  static geoMultiArrayPointToString(coords) {
    if (!coords) return '';

    const len = coords.length;
    if (len === 0) return '';

    let st = '(';

    for (let i = 0; i < len; i++) {
      if (i !== 0) st += ',(';
      st += TextEncoder.geoArrayPointToString(coords[i]) + ')';
    }

    return st;
  }

  static geoArrayPointToString(coords) {
    if (!coords) return '';

    const len = coords.length;
    if (len === 0) return '';

    let st = '';

    for (let i = 0; i < len; i++) {
      if (i !== 0) st += ',';
      st += TextEncoder.geoPointToString(coords[i]);
    }

    return st;
  }

  static geoPointToString(coords) {
    if (!coords) return '';
    const x = isNaN(coords[0]) ? '' : coords[0];
    const y = isNaN(coords[1]) ? '' : coords[1];
    return x + ' ' + y;
  }

  static getLocalDate(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const ms = date.getMilliseconds();

    const d = "'" + year + '-' + month + '-' + day + ' ' + hours + ':' + minutes + ':' + seconds;

    if (ms === 0) return d + "'";

    return d + '.' + (ms < 10 ? '00' : ms < 100 ? '0' : '') + ms + "'";
  }

  static getFixedFormatDate(date) {
    const year = date.getFullYear();
    const mon = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const min = date.getMinutes();
    const sec = date.getSeconds();
    const ms = date.getMilliseconds();

    let result =
      "'" +
      formatDigit(year, 4) +
      '-' +
      formatDigit(mon, 2) +
      '-' +
      formatDigit(day, 2) +
      ' ' +
      formatDigit(hour, 2) +
      ':' +
      formatDigit(min, 2) +
      ':' +
      formatDigit(sec, 2);

    if (ms > 0) {
      result += '.' + formatDigit(ms, 3);
    }

    return result + "'";
  }
}

module.exports = TextEncoder;
