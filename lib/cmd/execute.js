//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import Parser from './parser.js';
import * as Errors from '../misc/errors.js';
import BinaryEncoder from './encoder/binary-encoder.js';
import * as FieldType from '../const/field-type.js';
import * as Parse from '../misc/parse.js';

const GEOJSON_TYPES = new Set([
  'Point',
  'LineString',
  'Polygon',
  'MultiPoint',
  'MultiLineString',
  'MultiPolygon',
  'GeometryCollection'
]);
const BIGINT_MAX_SIGNED = 2n ** 63n;
const SRID_ZERO = Buffer.from([0, 0, 0, 0]);

/**
 * Protocol COM_STMT_EXECUTE
 * see: https://mariadb.com/kb/en/com_stmt_execute/
 */
class Execute extends Parser {
  constructor(resolve, reject, connOpts, cmdParam, prepare) {
    super(resolve, reject, connOpts, cmdParam);
    this.binary = true;
    this.prepare = prepare;
    this.canSkipMeta = true;
  }

  /**
   * Send COM_QUERY
   *
   * @param out   output writer
   * @param opts  connection options
   * @param info  connection information
   */
  start(out, opts, info) {
    this.onPacketReceive = this.readResponsePacket;
    this.values = [];

    if (this.opts.namedPlaceholders) {
      if (this.prepare) {
        // using named placeholders, so change values accordingly
        this.values = new Array(this.prepare.parameterCount);
        this.placeHolderIndex = this.prepare._placeHolderIndex;
      } else {
        const res = Parse.searchPlaceholder(this.sql);
        this.placeHolderIndex = res.placeHolderIndex;
        this.values = new Array(this.placeHolderIndex.length);
      }
      if (this.initialValues) {
        for (let i = 0; i < this.placeHolderIndex.length; i++) {
          this.values[i] = this.initialValues[this.placeHolderIndex[i]];
        }
      }
    } else {
      if (this.initialValues)
        this.values = Array.isArray(this.initialValues) ? this.initialValues : [this.initialValues];
    }
    this.parameterCount = this.prepare ? this.prepare.parameterCount : this.values.length;

    if (!this.validateParameters(info)) return;

    // fill parameter data type
    this.parametersType = new Array(this.parameterCount);
    let hasLongData = false; // send long data
    let val;
    for (let i = 0; i < this.parameterCount; i++) {
      val = this.values[i];
      // special check for GEOJSON that can be null even if object is not
      if (val && val.type != null && GEOJSON_TYPES.has(val.type)) {
        const geoBuff = BinaryEncoder.getBufferFromGeometryValue(val);
        if (geoBuff == null) {
          this.values[i] = null;
          val = null;
        } else {
          this.values[i] = Buffer.concat([
            SRID_ZERO, // SRID
            geoBuff // WKB
          ]);
          val = this.values[i];
        }
      }
      if (val == null) {
        this.parametersType[i] = NULL_PARAM_TYPE;
      } else {
        switch (typeof val) {
          case 'boolean':
            this.parametersType[i] = BOOLEAN_TYPE;
            break;
          case 'bigint':
            if (val >= BIGINT_MAX_SIGNED) {
              this.parametersType[i] = BIG_BIGINT_TYPE;
            } else {
              this.parametersType[i] = BIGINT_TYPE;
            }
            break;
          case 'number':
            // additional verification, to permit query without type,
            // like 'SELECT ?' returning same type of value
            if (Number.isInteger(val) && val >= -2147483648 && val < 2147483647) {
              this.parametersType[i] = INT_TYPE;
              break;
            }
            this.parametersType[i] = DOUBLE_TYPE;
            break;
          case 'string':
            this.parametersType[i] = STRING_TYPE;
            break;
          case 'object':
            if (val instanceof Date) {
              this.parametersType[i] = DATE_TYPE;
            } else if (Buffer.isBuffer(val)) {
              if (val.length < 16384 || !this.prepare) {
                this.parametersType[i] = BLOB_TYPE;
              } else {
                this.parametersType[i] = LONGBLOB_TYPE;
                hasLongData = true;
              }
            } else if (typeof val.toSqlString === 'function') {
              this.parametersType[i] = STRING_FCT_TYPE;
            } else if (typeof val.pipe === 'function' && typeof val.read === 'function') {
              hasLongData = true;
              this.parametersType[i] = STREAM_TYPE;
            } else if (String === val.constructor) {
              this.parametersType[i] = STRING_TOSTR_TYPE;
            } else {
              this.parametersType[i] = STRINGIFY_TYPE;
            }
            break;
        }
      }
    }

    // send long data using COM_STMT_SEND_LONG_DATA
    this.longDataStep = false; // send long data
    if (hasLongData) {
      for (let i = 0; i < this.parameterCount; i++) {
        if (this.parametersType[i].isLongData()) {
          if (opts.logger.query)
            opts.logger.query(
              `EXECUTE: (${this.prepare ? this.prepare.id : -1}) sql: ${opts.logParam ? this.displaySql() : this.sql}`
            );
          if (!this.longDataStep) {
            this.longDataStep = true;
            this.registerStreamSendEvent(out, info);
            this.currentParam = i;
          }
          this.sendComStmtLongData(out, info, this.values[i]);
          return;
        }
      }
    }

    if (!this.longDataStep) {
      // no stream parameter, so can send directly
      if (opts.logger.query)
        opts.logger.query(
          `EXECUTE: (${this.prepare ? this.prepare.id : -1}) sql: ${opts.logParam ? this.displaySql() : this.sql}`
        );
      this.sendComStmtExecute(out, info);
    }
  }

  /**
   * Validate that parameters exist and are defined.
   *
   * @param info        connection info
   * @returns {boolean} return false if any error occurs.
   */
  validateParameters(info) {
    //validate parameter size.
    if (this.parameterCount > this.values.length) {
      this.sendCancelled(
        `Parameter at position ${this.values.length} is not set\\nsql: ${
          this.opts.logParam ? this.displaySql() : this.sql
        }`,
        Errors.client.ER_MISSING_PARAMETER,
        info
      );
      return false;
    }

    // validate placeholder
    if (this.opts.namedPlaceholders && this.placeHolderIndex) {
      for (let i = 0; i < this.parameterCount; i++) {
        if (this.values[i] === undefined) {
          let errMsg = `Parameter named ${this.placeHolderIndex[i]} is not set`;
          if (this.placeHolderIndex.length < this.parameterCount) {
            errMsg = `Command expect ${this.parameterCount} parameters, but found only ${
              this.placeHolderIndex.length
            } named parameters. You probably use question mark in place of named parameters`;
          }
          this.sendCancelled(errMsg, Errors.client.ER_PARAMETER_UNDEFINED, info);
          return false;
        }
      }
    }
    return true;
  }

  sendComStmtLongData(out, info, value) {
    out.startPacket(this);
    out.writeInt8(0x18);
    out.writeInt32(this.prepare.id);
    out.writeInt16(this.currentParam);

    if (Buffer.isBuffer(value)) {
      out.writeBuffer(value, 0, value.length);
      out.flush();
      this.currentParam++;
      return this.paramWritten();
    }
    this.sending = true;

    // streaming
    value.on('data', (chunk) => {
      out.writeBuffer(chunk, 0, chunk.length);
    });

    value.on('end', () => {
      out.flush();
      this.currentParam++;
      this.paramWritten();
    });
  }

  /**
   * Send a COM_STMT_EXECUTE
   * @param out
   * @param info
   */
  sendComStmtExecute(out, info) {
    const nullCount = ~~((this.parameterCount + 7) / 8);
    const nullBitsBuffer = Buffer.alloc(nullCount);
    for (let i = 0; i < this.parameterCount; i++) {
      if (this.values[i] == null) {
        nullBitsBuffer[i >> 3] |= 1 << (i & 7);
      }
    }

    out.startPacket(this);
    out.writeInt8(0x17); // COM_STMT_EXECUTE
    out.writeInt32(this.prepare ? this.prepare.id : -1); // Statement id
    out.writeInt8(0); // no cursor flag
    out.writeInt32(1); // 1 command
    out.writeBuffer(nullBitsBuffer, 0, nullCount); // null buffer
    out.writeInt8(1); // always send type to server

    // send types
    for (let i = 0; i < this.parameterCount; i++) {
      out.writeInt16(this.parametersType[i].type);
    }

    //********************************************
    // send not null / not streaming values
    //********************************************
    for (let i = 0; i < this.parameterCount; i++) {
      const parameterType = this.parametersType[i];
      if (parameterType.encoder) parameterType.encoder(out, this.values[i]);
    }
    out.flush();
    this.sending = false;
    this.emit('send_end');
  }

  /**
   * Define params events.
   * Each parameter indicates that he is written to the socket, emitting the event so the
   * next stream parameter can be written.
   */
  registerStreamSendEvent(out, info) {
    // note: Implementation uses recursive calls, but the stack won't get near v8 max call stack size
    //since the event launched for stream parameter only
    this.paramWritten = () => {
      if (this.longDataStep) {
        for (; this.currentParam < this.parameterCount; this.currentParam++) {
          if (this.parametersType[this.currentParam].isLongData()) {
            const value = this.values[this.currentParam];
            this.sendComStmtLongData(out, info, value);
            return;
          }
        }
        this.longDataStep = false; // all streams have been send
      }

      if (!this.longDataStep) {
        this.sendComStmtExecute(out, info);
      }
    };
  }
}

class ParameterType {
  constructor(type, encoder, isNull = false) {
    this.type = type;
    this.encoder = encoder;
    this.isNull = isNull;
  }

  isLongData() {
    return this.encoder === null && !this.isNull;
  }
}

const NULL_PARAM_TYPE = new ParameterType(FieldType.VAR_STRING, null, true);
const BOOLEAN_TYPE = new ParameterType(FieldType.TINY, (out, value) => out.writeInt8(value ? 0x01 : 0x00));
const BIG_BIGINT_TYPE = new ParameterType(FieldType.NEWDECIMAL, (out, value) =>
  out.writeLengthEncodedString(value.toString())
);
const BIGINT_TYPE = new ParameterType(FieldType.BIGINT, (out, value) => out.writeBigInt(value));
const INT_TYPE = new ParameterType(FieldType.INT, (out, value) => out.writeInt32(value));
const DOUBLE_TYPE = new ParameterType(FieldType.DOUBLE, (out, value) => out.writeDouble(value));
const STRING_TYPE = new ParameterType(FieldType.VAR_STRING, (out, value) => out.writeLengthEncodedString(value));
const STRING_TOSTR_TYPE = new ParameterType(FieldType.VAR_STRING, (out, value) =>
  out.writeLengthEncodedString(value.toString())
);
const DATE_TYPE = new ParameterType(FieldType.DATETIME, (out, value) => out.writeBinaryDate(value));
const BLOB_TYPE = new ParameterType(FieldType.BLOB, (out, value) => out.writeLengthEncodedBuffer(value));
const LONGBLOB_TYPE = new ParameterType(FieldType.BLOB, null);
const STRING_FCT_TYPE = new ParameterType(FieldType.VAR_STRING, (out, value) =>
  out.writeLengthEncodedString(String(value.toSqlString()))
);
const STREAM_TYPE = new ParameterType(FieldType.BLOB, null);
const STRINGIFY_TYPE = new ParameterType(FieldType.VAR_STRING, (out, value) =>
  out.writeLengthEncodedString(JSON.stringify(value))
);

export default Execute;
