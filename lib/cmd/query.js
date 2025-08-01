//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import Parser from './parser.js';
import * as Errors from '../misc/errors.js';
import { splitQuery, splitQueryPlaceholder } from '../misc/parse.js';
import TextEncoder from './encoder/text-encoder.js';
import { Readable } from 'node:stream';
const QUOTE = 0x27;

/**
 * Protocol COM_QUERY
 * see : https://mariadb.com/kb/en/library/com_query/
 */
class Query extends Parser {
  constructor(resolve, reject, connOpts, cmdParam) {
    super(resolve, reject, connOpts, cmdParam);
    this.binary = false;
  }

  /**
   * Send COM_QUERY
   *
   * @param out   output writer
   * @param opts  connection options
   * @param info  connection information
   */
  start(out, opts, info) {
    if (opts.logger.query) opts.logger.query(`QUERY: ${opts.logParam ? this.displaySql() : this.sql}`);
    this.onPacketReceive = this.readResponsePacket;
    if (this.initialValues === undefined) {
      //shortcut if no parameters
      out.startPacket(this);
      out.writeInt8(0x03);
      if (!this.handleTimeout(out, info)) return;
      out.writeString(this.sql);
      out.flush();
      this.emit('send_end');
      return;
    }

    this.encodedSql = out.encodeString(this.sql);

    if (this.opts.namedPlaceholders) {
      try {
        const parsed = splitQueryPlaceholder(
          this.encodedSql,
          info,
          this.initialValues,
          this.opts.logParam ? this.displaySql.bind(this) : () => this.sql
        );
        this.paramPositions = parsed.paramPositions;
        this.values = parsed.values;
      } catch (err) {
        this.emit('send_end');
        return this.throwError(err, info);
      }
    } else {
      this.paramPositions = splitQuery(this.encodedSql);
      this.values = Array.isArray(this.initialValues) ? this.initialValues : [this.initialValues];
      if (!this.validateParameters(info)) return;
    }

    out.startPacket(this);
    out.writeInt8(0x03);
    if (!this.handleTimeout(out, info)) return;

    this.paramPos = 0;
    this.sqlPos = 0;

    //********************************************
    // send params
    //********************************************
    const len = this.paramPositions.length / 2;
    for (this.valueIdx = 0; this.valueIdx < len; ) {
      out.writeBuffer(this.encodedSql, this.sqlPos, this.paramPositions[this.paramPos++] - this.sqlPos);
      this.sqlPos = this.paramPositions[this.paramPos++];

      const value = this.values[this.valueIdx++];
      if (value == null) {
        out.writeStringAscii('NULL');
        continue;
      }
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
          if (typeof value.pipe === 'function' && typeof value.read === 'function') {
            this.sending = true;
            //********************************************
            // param is stream,
            // now all params will be written by event
            //********************************************
            this.paramWritten = this._paramWritten.bind(this, out, info);
            out.writeInt8(QUOTE); //'
            value.on('data', out.writeBufferEscape.bind(out));

            value.on(
              'end',
              function () {
                out.writeInt8(QUOTE); //'
                this.paramWritten();
              }.bind(this)
            );
            return;
          }

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
            } else if (String === value.constructor) {
              out.writeStringEscapeQuote(value);
              break;
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
    out.writeBuffer(this.encodedSql, this.sqlPos, this.encodedSql.length - this.sqlPos);
    out.flush();
    this.emit('send_end');
  }

  /**
   * If timeout is set, prepend query with SET STATEMENT max_statement_time=xx FOR, or throw an error
   * @param out buffer
   * @param info server information
   * @returns {boolean} false if an error has been thrown
   */
  handleTimeout(out, info) {
    if (this.opts.timeout) {
      if (info.isMariaDB()) {
        if (info.hasMinVersion(10, 1, 2)) {
          out.writeString(`SET STATEMENT max_statement_time=${this.opts.timeout / 1000} FOR `);
          return true;
        } else {
          this.sendCancelled(
            `Cannot use timeout for xpand/MariaDB server before 10.1.2. timeout value: ${this.opts.timeout}`,
            Errors.client.ER_TIMEOUT_NOT_SUPPORTED,
            info
          );
          return false;
        }
      } else {
        //not available for MySQL
        // max_execution time exist, but only for select, and as hint
        this.sendCancelled(
          `Cannot use timeout for MySQL server. timeout value: ${this.opts.timeout}`,
          Errors.client.ER_TIMEOUT_NOT_SUPPORTED,
          info
        );
        return false;
      }
    }
    return true;
  }

  /**
   * Validate that parameters exist and are defined.
   *
   * @param info        connection info
   * @returns {boolean} return false if any error occurs.
   */
  validateParameters(info) {
    //validate parameter size.
    if (this.paramPositions.length / 2 > this.values.length) {
      this.sendCancelled(
        `Parameter at position ${this.values.length + 1} is not set`,
        Errors.client.ER_MISSING_PARAMETER,
        info
      );
      return false;
    }
    return true;
  }

  _paramWritten(out, info) {
    while (true) {
      if (this.valueIdx === this.paramPositions.length / 2) {
        //********************************************
        // all parameters are written.
        // flush packet
        //********************************************
        out.writeBuffer(this.encodedSql, this.sqlPos, this.encodedSql.length - this.sqlPos);
        out.flush();
        this.sending = false;
        this.emit('send_end');
        return;
      } else {
        const value = this.values[this.valueIdx++];
        out.writeBuffer(this.encodedSql, this.sqlPos, this.paramPositions[this.paramPos++] - this.sqlPos);
        this.sqlPos = this.paramPositions[this.paramPos++];

        if (value == null) {
          out.writeStringAscii('NULL');
          continue;
        }

        if (typeof value === 'object' && typeof value.pipe === 'function' && typeof value.read === 'function') {
          //********************************************
          // param is stream,
          //********************************************
          out.writeInt8(QUOTE);
          value.once(
            'end',
            function () {
              out.writeInt8(QUOTE);
              this._paramWritten(out, info);
            }.bind(this)
          );
          value.on('data', out.writeBufferEscape.bind(out));
          return;
        }

        //********************************************
        // param isn't stream. directly write in buffer
        //********************************************
        TextEncoder.writeParam(out, value, this.opts, info);
      }
    }
  }

  _stream(socket, options) {
    this.socket = socket;
    options = options || {};
    options.objectMode = true;
    options.read = () => {
      this.socket.resume();
    };
    this.inStream = new Readable(options);

    this.on('fields', function (meta) {
      this.inStream.emit('fields', meta);
    });

    this.on('error', function (err) {
      this.inStream.emit('error', err);
    });

    this.on('close', function (err) {
      this.inStream.emit('error', err);
    });

    this.on('end', function (err) {
      if (err) this.inStream.emit('error', err);
      this.socket.resume();
      this.inStream.push(null);
    });

    this.inStream.close = function () {
      this.handleNewRows = () => {};
      this.socket.resume();
    }.bind(this);

    this.handleNewRows = function (row) {
      if (!this.inStream.push(row)) {
        this.socket.pause();
      }
    };

    return this.inStream;
  }
}

export default Query;
