//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

const Parser = require('./parser');
const Errors = require('../misc/errors');
const BinaryEncoder = require('./encoder/binary-encoder');
const FieldType = require('../const/field-type');
const OkPacket = require('./class/ok-packet');
const Capabilities = require('../const/capabilities');
const ServerStatus = require('../const/server-status');

// GeoJSON types supported by MariaDB
const GEOJSON_TYPES = [
  'Point',
  'LineString',
  'Polygon',
  'MultiPoint',
  'MultiLineString',
  'MultiPolygon',
  'GeometryCollection'
];

/**
 * Protocol COM_STMT_BULK_EXECUTE implementation
 * Provides efficient batch operations for MariaDB servers >= 10.2.7
 *
 * @see https://mariadb.com/kb/en/library/com_stmt_bulk_execute/
 */
class BatchBulk extends Parser {
  constructor(resolve, reject, connOpts, prepare, cmdParam) {
    super(resolve, reject, connOpts, cmdParam);
    this.cmdOpts = cmdParam.opts;
    this.binary = true;
    this.prepare = prepare;
    this.canSkipMeta = true;
    this.bulkPacketNo = 0;
    this.sending = false;
    this.firstError = null;
  }

  /**
   * Initiates the batch operation
   *
   * @param {Object} out - Output writer
   * @param {Object} opts - Connection options
   * @param {Object} info - Connection information
   */
  start(out, opts, info) {
    this.info = info;
    this.values = this.initialValues;

    // Batch operations don't support timeouts
    if (this.cmdOpts && this.cmdOpts.timeout) {
      return this.handleTimeoutError(info);
    }

    this.onPacketReceive = this.readResponsePacket;

    // Process named placeholders if needed
    if (this.opts.namedPlaceholders && this.prepare._placeHolderIndex) {
      this.processNamedPlaceholders();
    }

    // Validate parameters before proceeding
    if (!this.validateParameters(info)) return;

    // Send the bulk execute command
    this.sendComStmtBulkExecute(out, opts, info);
  }

  /**
   * Handle timeout error case
   * @param {Object} info - Connection information
   * @private
   */
  handleTimeoutError(info) {
    this.bulkPacketNo = 1;
    this.sending = false;
    return this.sendCancelled('Cannot use timeout for Batch statement', Errors.ER_TIMEOUT_NOT_SUPPORTED);
  }

  /**
   * Process named placeholders to positional parameters
   * @private
   */
  processNamedPlaceholders() {
    this.values = [];
    if (!this.initialValues) return;

    const placeHolderIndex = this.prepare._placeHolderIndex;
    const paramCount = this.prepare.parameterCount;

    for (let r = 0; r < this.initialValues.length; r++) {
      const val = this.initialValues[r];
      const newRow = new Array(paramCount);

      for (let i = 0; i < placeHolderIndex.length; i++) {
        newRow[i] = val[placeHolderIndex[i]];
      }

      this.values[r] = newRow;
    }
  }

  /**
   * Determine parameter header types based on value types
   *
   * @param {Array} value - Parameter values
   * @param {Number} parameterCount - Number of parameters
   * @returns {Array} Array of parameter header types
   */
  parameterHeaderFromValue(value, parameterCount) {
    const parameterHeaderType = new Array(parameterCount);

    for (let i = 0; i < parameterCount; i++) {
      const val = value[i];

      if (val == null) {
        parameterHeaderType[i] = FieldType.VAR_STRING;
        continue;
      }

      const type = typeof val;

      switch (type) {
        case 'boolean':
          parameterHeaderType[i] = FieldType.TINY;
          break;

        case 'bigint':
          parameterHeaderType[i] = val >= 2n ** 63n ? FieldType.NEWDECIMAL : FieldType.BIGINT;
          break;

        case 'number':
          if (Number.isInteger(val) && val >= -2147483648 && val < 2147483647) {
            parameterHeaderType[i] = FieldType.INT;
          } else {
            parameterHeaderType[i] = FieldType.DOUBLE;
          }
          break;

        case 'string':
          parameterHeaderType[i] = FieldType.VAR_STRING;
          break;

        case 'object':
          parameterHeaderType[i] = this.getObjectFieldType(val);
          break;

        default:
          parameterHeaderType[i] = FieldType.BLOB;
      }
    }

    return parameterHeaderType;
  }

  /**
   * Determine field type for object values
   *
   * @param {Object} val - Object value
   * @returns {Number} Field type constant
   * @private
   */
  getObjectFieldType(val) {
    if (Object.prototype.toString.call(val) === '[object Date]') {
      return FieldType.DATETIME;
    }

    if (Buffer.isBuffer(val)) {
      return FieldType.BLOB;
    }

    if (typeof val.toSqlString === 'function') {
      return FieldType.VAR_STRING;
    }

    if (val.type != null && GEOJSON_TYPES.includes(val.type)) {
      return FieldType.BLOB;
    }

    return FieldType.VAR_STRING;
  }

  /**
   * Check if current value has same header as set in initial BULK header
   *
   * @param {Array} parameterHeaderType - Current header types
   * @param {Array} value - Current values
   * @param {Number} parameterCount - Number of parameters
   * @returns {Boolean} True if headers are identical
   */
  checkSameHeader(parameterHeaderType, value, parameterCount) {
    for (let i = 0; i < parameterCount; i++) {
      const val = value[i];
      if (val == null) continue;

      const type = typeof val;

      switch (type) {
        case 'boolean':
          if (parameterHeaderType[i] !== FieldType.TINY) return false;
          break;

        case 'bigint':
          if (val >= 2n ** 63n) {
            if (parameterHeaderType[i] !== FieldType.VAR_STRING) return false;
          } else {
            if (parameterHeaderType[i] !== FieldType.BIGINT) return false;
          }
          break;

        case 'number':
          if (Number.isInteger(val) && val >= -2147483648 && val < 2147483647) {
            if (parameterHeaderType[i] !== FieldType.INT) return false;
          } else {
            if (parameterHeaderType[i] !== FieldType.DOUBLE) return false;
          }
          break;

        case 'string':
          if (parameterHeaderType[i] !== FieldType.VAR_STRING) return false;
          break;

        case 'object':
          if (!this.checkObjectHeaderType(val, parameterHeaderType[i])) {
            return false;
          }
          break;

        default:
          if (parameterHeaderType[i] !== FieldType.BLOB) return false;
      }
    }

    return true;
  }

  /**
   * Check if object value matches expected header type
   *
   * @param {Object} val - Object value
   * @param {Number} headerType - Expected header type
   * @returns {Boolean} True if types match
   * @private
   */
  checkObjectHeaderType(val, headerType) {
    if (Object.prototype.toString.call(val) === '[object Date]') {
      return headerType === FieldType.TIMESTAMP;
    }

    if (Buffer.isBuffer(val)) {
      return headerType === FieldType.BLOB;
    }

    if (typeof val.toSqlString === 'function') {
      return headerType === FieldType.VAR_STRING;
    }

    if (val.type != null && GEOJSON_TYPES.includes(val.type)) {
      return headerType === FieldType.BLOB;
    }

    return headerType === FieldType.VAR_STRING;
  }

  /**
   * Send a COM_STMT_BULK_EXECUTE command
   *
   * @param {Object} out - Output packet writer
   * @param {Object} opts - Connection options
   * @param {Object} info - Connection information
   */
  sendComStmtBulkExecute(out, opts, info) {
    if (opts.logger.query) {
      opts.logger.query(`BULK: (${this.prepare.id}) sql: ${opts.logParam ? this.displaySql() : this.sql}`);
    }

    const parameterCount = this.prepare.parameterCount;
    this.rowIdx = 0;
    this.vals = this.values[this.rowIdx++];
    let parameterHeaderType = this.parameterHeaderFromValue(this.vals, parameterCount);
    let lastCmdData = null;
    this.bulkPacketNo = 0;
    this.sending = true;

    // Main processing loop for batching parameters
    main_loop: while (true) {
      this.bulkPacketNo++;
      out.startPacket(this);
      out.writeInt8(0xfa); // COM_STMT_BULK_EXECUTE
      out.writeInt32(this.prepare.id); // Statement id

      // Set flags: SEND_TYPES_TO_SERVER + SEND_UNIT_RESULTS if possible
      this.useUnitResult = (info.clientCapabilities & Capabilities.BULK_UNIT_RESULTS) > 0;
      out.writeInt16(this.useUnitResult ? 192 : 128);

      // Write parameter header types
      for (let i = 0; i < parameterCount; i++) {
        out.writeInt16(parameterHeaderType[i]);
      }

      // Handle leftover data from previous packet
      if (lastCmdData != null) {
        const err = out.checkMaxAllowedLength(lastCmdData.length, info);
        if (err) {
          this.sending = false;
          this.throwError(err, info);
          return;
        }

        out.writeBuffer(lastCmdData, 0, lastCmdData.length);
        out.mark();
        lastCmdData = null;

        if (this.rowIdx >= this.values.length) {
          break;
        }

        this.vals = this.values[this.rowIdx++];
      }

      parameter_loop: while (true) {
        // Write each parameter value
        for (let i = 0; i < parameterCount; i++) {
          const param = this.vals[i];

          if (param != null) {
            // Special handling for GeoJSON
            if (param.type != null && GEOJSON_TYPES.includes(param.type)) {
              this.writeGeoJSONParam(out, param, info);
            } else {
              out.writeInt8(0x00); // value follows
              BinaryEncoder.writeParam(out, param, this.opts, info);
            }
          } else {
            out.writeInt8(0x01); // value is null
          }
        }

        // Buffer management for packet boundaries
        if (out.isMarked() && (out.hasDataAfterMark() || out.bufIsAfterMaxPacketLength())) {
          // Packet length was ok at last mark, but won't be with new data
          out.flushBufferStopAtMark();
          out.mark();
          lastCmdData = out.resetMark();
          break;
        }

        out.mark();

        if (out.hasDataAfterMark()) {
          // Flush has been done
          lastCmdData = out.resetMark();
          break;
        }

        if (this.rowIdx >= this.values.length) {
          break main_loop;
        }

        this.vals = this.values[this.rowIdx++];

        // Check if parameter types have changed
        if (!this.checkSameHeader(parameterHeaderType, this.vals, parameterCount)) {
          out.flush();
          // Reset header type for new packet
          parameterHeaderType = this.parameterHeaderFromValue(this.vals, parameterCount);
          break parameter_loop;
        }
      }
    }

    out.flush();
    this.sending = false;
    this.emit('send_end');
  }

  /**
   * Write GeoJSON parameter to output buffer
   *
   * @param {Object} out - Output buffer
   * @param {Object} param - GeoJSON parameter
   * @param {Object} info - connection info data
   * @private
   */
  writeGeoJSONParam(out, param, info) {
    const geoBuff = BinaryEncoder.getBufferFromGeometryValue(param);

    if (geoBuff == null) {
      out.writeInt8(0x01); // value is null
    } else {
      out.writeInt8(0x00); // value follows
      const paramBuff = Buffer.concat([
        Buffer.from([0, 0, 0, 0]), // SRID
        geoBuff // WKB
      ]);
      BinaryEncoder.writeParam(out, paramBuff, this.opts, info);
    }
  }

  /**
   * Format SQL with parameters for logging
   *
   * @returns {String} Formatted SQL string
   */
  displaySql() {
    if (this.sql.length > this.opts.debugLen) {
      return this.sql.substring(0, this.opts.debugLen) + '...';
    }

    let sqlMsg = this.sql + ' - parameters:[';

    for (let i = 0; i < this.initialValues.length; i++) {
      if (i !== 0) sqlMsg += ',';
      let param = this.initialValues[i];
      sqlMsg = Parser.logParameters(this.opts, sqlMsg, param);

      if (sqlMsg.length > this.opts.debugLen) {
        return sqlMsg.substring(0, this.opts.debugLen) + '...';
      }
    }

    sqlMsg += ']';
    return sqlMsg;
  }

  /**
   * Process successful query execution
   *
   * @param {Object} initVal - Query result
   */
  success(initVal) {
    this.bulkPacketNo--;

    if (!this.sending && this.bulkPacketNo === 0) {
      this.packet = null;

      if (this.firstError) {
        this.resolve = null;
        this.onPacketReceive = null;
        this._columns = null;
        this._rows = null;
        process.nextTick(this.reject, this.firstError);
        this.reject = null;
        this.emit('end', this.firstError);
      } else {
        this.processResults();
      }
      return;
    }

    if (!this.firstError) {
      this._responseIndex++;
      this.onPacketReceive = this.readResponsePacket;
    }
  }

  /**
   * Process successful results based on result type
   * @private
   */
  processResults() {
    if (this._rows[0] && this._rows[0][0] && this._rows[0][0]['Affected_rows'] !== undefined) {
      this.processUnitResults();
    } else if (
      this._rows[0].affectedRows !== undefined &&
      !(this.opts.fullResult === undefined || this.opts.fullResult === true)
    ) {
      this.processAggregatedResults();
    } else {
      this.processRowResults();
    }

    this._columns = null;
    this._rows = null;
  }

  /**
   * Process unit results (for bulk operations with unit results)
   * @private
   */
  processUnitResults() {
    if (this.opts.fullResult === undefined || this.opts.fullResult === true) {
      const rs = [];
      this._rows.forEach((row) => {
        row.forEach((unitRow) => {
          rs.push(new OkPacket(Number(unitRow['Affected_rows']), BigInt(unitRow['Id']), 0));
        });
      });
      this.successEnd(this.opts.metaAsArray ? [rs, []] : rs);
    } else {
      let totalAffectedRows = 0;
      this._rows.forEach((row) => {
        row.forEach((unitRow) => {
          totalAffectedRows += Number(unitRow['Affected_rows']);
        });
      });
      const rs = new OkPacket(totalAffectedRows, BigInt(this._rows[0][0]['Id']), 0);
      this.successEnd(this.opts.metaAsArray ? [rs, []] : rs);
    }
  }

  /**
   * Process aggregated results (for non-fullResult mode)
   * @private
   */
  processAggregatedResults() {
    let totalAffectedRows = 0;
    this._rows.forEach((row) => {
      totalAffectedRows += row.affectedRows;
    });

    const rs = new OkPacket(totalAffectedRows, this._rows[0].insertId, this._rows[this._rows.length - 1].warningStatus);
    this.successEnd(this.opts.metaAsArray ? [rs, []] : rs);
  }

  /**
   * Process row results (for SELECT queries)
   * @private
   */
  processRowResults() {
    if (this._rows.length === 1) {
      this.successEnd(this.opts.metaAsArray ? [this._rows[0], this._columns] : this._rows[0]);
      return;
    }

    if (this.opts.metaAsArray) {
      if (this.useUnitResult) {
        const rs = [];
        this._rows.forEach((row, i) => {
          if (i % 2 === 0) rs.push(...row);
        });
        this.successEnd([rs, this.prepare.columns]);
      } else {
        const rs = [];
        this._rows.forEach((row) => {
          rs.push(...row);
        });
        this.successEnd([rs, this._columns]);
      }
    } else {
      if (this.useUnitResult) {
        const rs = [];
        this._rows.forEach((row, i) => {
          if (i % 2 === 0) rs.push(...row);
        });
        Object.defineProperty(rs, 'meta', {
          value: this._columns,
          writable: true,
          enumerable: this.opts.metaEnumerable
        });
        this.successEnd(rs);
      } else {
        if (this._rows.length === 1) {
          this.successEnd(this._rows[0]);
        } else {
          const rs = [];
          if (Array.isArray(this._rows[0])) {
            this._rows.forEach((row) => {
              rs.push(...row);
            });
          } else rs.push(...this._rows);
          Object.defineProperty(rs, 'meta', {
            value: this._columns,
            writable: true,
            enumerable: this.opts.metaEnumerable
          });
          this.successEnd(rs);
        }
      }
    }
  }

  /**
   * Handle OK packet success
   *
   * @param {Object} okPacket - OK packet
   * @param {Object} info - Connection information
   */
  okPacketSuccess(okPacket, info) {
    this._rows.push(okPacket);

    if (info.status & ServerStatus.MORE_RESULTS_EXISTS) {
      this._responseIndex++;
      return (this.onPacketReceive = this.readResponsePacket);
    }

    if (this.opts.metaAsArray) {
      if (!this._meta) {
        this._meta = new Array(this._responseIndex);
      }
      this._meta[this._responseIndex] = null;
      this.success([this._rows, this._meta]);
    } else {
      this.success(this._rows);
    }
  }

  /**
   * Handle errors during query execution
   *
   * @param {Error} err - Error object
   * @param {Object} info - Connection information
   */
  throwError(err, info) {
    this.bulkPacketNo--;

    if (!this.firstError) {
      if (err.fatal) {
        this.bulkPacketNo = 0;
      }

      if (this.cmdParam.stack) {
        err = Errors.createError(
          err.message,
          err.errno,
          info,
          err.sqlState,
          this.sql,
          err.fatal,
          this.cmdParam.stack,
          false
        );
      }

      this.firstError = err;
    }

    if (!this.sending && this.bulkPacketNo === 0) {
      this.resolve = null;
      this.emit('send_end');
      process.nextTick(this.reject, this.firstError);
      this.reject = null;
      this.onPacketReceive = null;
      this.emit('end', this.firstError);
    } else {
      this.onPacketReceive = this.readResponsePacket;
    }
  }

  /**
   * Validate that parameters exist and are defined
   *
   * @param {Object} info - Connection information
   * @returns {Boolean} Returns false if any error occurs
   */
  validateParameters(info) {
    const nbParameter = this.prepare.parameterCount;

    for (let r = 0; r < this.values.length; r++) {
      if (!Array.isArray(this.values[r])) {
        this.values[r] = [this.values[r]];
      }

      if (this.values[r].length < nbParameter) {
        this.emit('send_end');
        this.throwNewError(
          `Expect ${nbParameter} parameters, but at index ${r}, parameters only contains ${this.values[r].length}\n ${
            this.opts.logParam ? this.displaySql() : this.sql
          }`,
          false,
          info,
          'HY000',
          Errors.ER_PARAMETER_UNDEFINED
        );
        return false;
      }
    }

    return true;
  }
}

module.exports = BatchBulk;
