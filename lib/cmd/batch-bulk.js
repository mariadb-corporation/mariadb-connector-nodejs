'use strict';

const Parser = require('./parser');
const Errors = require('../misc/errors');
const BinaryEncoder = require('./encoder/binary-encoder');
const FieldType = require('../const/field-type');
const OkPacket = require('./class/ok-packet');

/**
 * Protocol COM_STMT_BULK_EXECUTE
 * see : https://mariadb.com/kb/en/library/com_stmt_bulk_execute/
 */
class BatchBulk extends Parser {
  constructor(resolve, reject, options, connOpts, prepare, values) {
    super(resolve, reject, options, connOpts, prepare.query, values);
    this.encoder = new BinaryEncoder(this.opts);
    this.binary = true;
    this.prepare = prepare;
    this.canSkipMeta = true;
  }

  /**
   * Send COM_STMT_BULK_EXECUTE
   *
   * @param out   output writer
   * @param opts  connection options
   * @param info  connection information
   */
  start(out, opts, info) {
    this.info = info;
    this.values = this.initialValues;

    if (this.opts.timeout) {
      const err = Errors.createError(
        'Cannot use timeout for Batch statement',
        Errors.ER_TIMEOUT_NOT_SUPPORTED,
        info,
        'HY000',
        this.sql
      );
      this.emit('send_end');
      this.throwError(err, info);
      return;
    }
    this.onPacketReceive = this.readResponsePacket;
    this.values = [];

    if (this.opts.namedPlaceholders && this.prepare._placeHolderIndex) {
      // using named placeholders, so change values accordingly
      this.values = [];
      if (this.initialValues) {
        for (let r = 0; r < this.initialValues.length; r++) {
          let val = this.initialValues[r];
          this.values[r] = new Array(this.prepare.parameters.length);
          for (let i = 0; i < this.prepare._placeHolderIndex.length; i++) {
            this.values[r][i] = val[this.prepare._placeHolderIndex[i]];
          }
        }
      }
    } else {
      if (this.initialValues)
        this.values = Array.isArray(this.initialValues) ? this.initialValues : [this.initialValues];
    }

    if (!this.validateParameters(info)) return;

    this.sendComStmtBulkExecute(out, opts, info);
  }

  /**
   * Set header type
   * @param value current value
   * @param parameterCount parameter number
   * @returns {*[]} header type array
   */
  parameterHeaderFromValue(value, parameterCount) {
    const parameterHeaderType = [];

    // set header type
    for (let i = 0; i < parameterCount; i++) {
      const val = value[i];
      if (val != null) {
        switch (typeof val) {
          case 'boolean':
            parameterHeaderType[i] = FieldType.TINY;
            break;
          case 'bigint':
            if (val >= 2n ** 63n) {
              parameterHeaderType[i] = FieldType.NEWDECIMAL;
            } else {
              parameterHeaderType[i] = FieldType.BIGINT;
            }
            break;
          case 'number':
            // additional verification, to permit query without type,
            // like 'SELECT ?' returning same type of value
            if (Number.isSafeInteger(val) && val >= -2147483648 && val < 2147483647) {
              parameterHeaderType[i] = FieldType.INT;
              break;
            }
            parameterHeaderType[i] = FieldType.DOUBLE;
            break;
          case 'string':
            parameterHeaderType[i] = FieldType.VAR_STRING;
            break;
          case 'object':
            if (Object.prototype.toString.call(val) === '[object Date]') {
              parameterHeaderType[i] = FieldType.TIMESTAMP;
            } else if (Buffer.isBuffer(val)) {
              parameterHeaderType[i] = FieldType.BLOB;
            } else if (typeof val.toSqlString === 'function') {
              parameterHeaderType[i] = FieldType.VAR_STRING;
            } else {
              if (
                val.type != null &&
                [
                  'Point',
                  'LineString',
                  'Polygon',
                  'MultiPoint',
                  'MultiLineString',
                  'MultiPolygon',
                  'GeometryCollection'
                ].includes(val.type)
              ) {
                parameterHeaderType[i] = FieldType.BLOB;
              } else {
                parameterHeaderType[i] = FieldType.VAR_STRING;
              }
            }
            break;
          default:
            parameterHeaderType[i] = FieldType.BLOB;
            break;
        }
      } else {
        parameterHeaderType[i] = FieldType.VAR_STRING;
      }
    }
    return parameterHeaderType;
  }

  /**
   * Check current value has same header than set in initial BULK header
   *
   * @param parameterHeaderType current header
   * @param value current value
   * @param parameterCount number of parameter
   * @returns {boolean} true if identical
   */
  checkSameHeader(parameterHeaderType, value, parameterCount) {
    // set header type
    for (let i = 0; i < parameterCount; i++) {
      const val = value[i];
      if (val != null) {
        switch (typeof val) {
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
            // additional verification, to permit query without type,
            // like 'SELECT ?' returning same type of value
            if (Number.isSafeInteger(val) && val >= -2147483648 && val < 2147483647) {
              if (parameterHeaderType[i] !== FieldType.INT) return false;
              break;
            }
            if (parameterHeaderType[i] !== FieldType.DOUBLE) return false;
            break;
          case 'string':
            if (parameterHeaderType[i] !== FieldType.VAR_STRING) return false;
            break;
          case 'object':
            if (Object.prototype.toString.call(val) === '[object Date]') {
              if (parameterHeaderType[i] !== FieldType.TIMESTAMP) return false;
            } else if (Buffer.isBuffer(val)) {
              if (parameterHeaderType[i] !== FieldType.BLOB) return false;
            } else if (typeof val.toSqlString === 'function') {
              if (parameterHeaderType[i] !== FieldType.VAR_STRING) return false;
            } else {
              if (
                val.type != null &&
                [
                  'Point',
                  'LineString',
                  'Polygon',
                  'MultiPoint',
                  'MultiLineString',
                  'MultiPolygon',
                  'GeometryCollection'
                ].includes(val.type)
              ) {
                if (parameterHeaderType[i] !== FieldType.BLOB) return false;
              } else {
                if (parameterHeaderType[i] !== FieldType.VAR_STRING) return false;
              }
            }
            break;
          default:
            if (parameterHeaderType[i] !== FieldType.BLOB) return false;
            break;
        }
      } else {
        if (parameterHeaderType[i] !== FieldType.VAR_STRING) return false;
      }
    }
    return true;
  }

  /**
   * Send a COM_STMT_BULK_EXECUTE
   * @param out output packet writer
   * @param opts options
   * @param info information
   */
  sendComStmtBulkExecute(out, opts, info) {
    if (opts.logger.query)
      opts.logger.query(`BULK: (${this.prepare.id}) sql: ${opts.logger.logParam ? this.displaySql() : this.sql}`);
    const parameterCount = this.prepare.parameters.length;
    this.rowIdx = 0;
    this.vals = this.values[this.rowIdx++];
    let parameterHeaderType = this.parameterHeaderFromValue(this.vals, parameterCount);
    let lastCmdData = null;
    this.bulkPacketNo = 0;
    this.sending = true;

    /**
     * Implementation After writing bunch of parameter to buffer is marked. then : - when writing
     * next bunch of parameter, if buffer grow more than max_allowed_packet, send buffer up to mark,
     * then create a new packet with current bunch of data - if bunch of parameter data type changes
     * send buffer up to mark, then create a new packet with new data type.
     *
     * <p>Problem remains if a bunch of parameter is bigger than max_allowed_packet
     */
    main_loop: while (true) {
      this.bulkPacketNo++;
      out.startPacket(this);
      out.writeInt8(0xfa); // COM_STMT_BULK_EXECUTE
      out.writeInt32(this.prepare.id); // Statement id
      out.writeInt16(128); // always SEND_TYPES_TO_SERVER

      for (let i = 0; i < parameterCount; i++) {
        out.writeInt16(parameterHeaderType[i]);
      }

      if (lastCmdData != null) {
        const err = out.checkMaxAllowedLength(lastCmdData.length, info);
        if (err) {
          this.throwError(err, info);
          return;
        }
        out.writeBuffer(lastCmdData, 0, lastCmdData.length);
        out.mark();
        lastCmdData = null;
        if (!this.rowIdx >= this.values.length) {
          break;
        }
        this.vals = this.values[this.rowIdx++];
      }

      parameter_loop: while (true) {
        for (let i = 0; i < parameterCount; i++) {
          let param = this.vals[i];
          if (param !== null) {
            // special check for GEOJSON that can be null even if object is not
            if (
              param.type != null &&
              [
                'Point',
                'LineString',
                'Polygon',
                'MultiPoint',
                'MultiLineString',
                'MultiPolygon',
                'GeometryCollection'
              ].includes(param.type)
            ) {
              const geoBuff = BinaryEncoder.getBufferFromGeometryValue(param);
              if (geoBuff == null) {
                out.writeInt8(0x01); // value is null
              } else {
                out.writeInt8(0x00); // value follow
                param = Buffer.concat([
                  Buffer.from([0, 0, 0, 0]), // SRID
                  geoBuff // WKB
                ]);
                this.encoder.writeParam(out, param, this.opts, info);
              }
            } else {
              out.writeInt8(0x00); // value follow
              this.encoder.writeParam(out, param, this.opts, info);
            }
          } else {
            out.writeInt8(0x01); // value is null
          }
        }
        // if > max_allowed_packet, need to flush before mark
        //TODO

        if (!out.bufIsDataAfterMark() && !out.isMarked() && out.hasFlushed()) {
          // parameter were too big to fit in a MySQL packet
          // need to finish the packet separately
          out.flush();
          if (!this.rowIdx >= this.values.length) {
            break main_loop;
          }
          this.vals = this.values[this.rowIdx++];

          // reset header type
          parameterHeaderType = this.parameterHeaderFromValue(this.vals, parameterCount);
          break parameter_loop;
        }

        if (out.isMarked() && out.bufIsAfterMaxPacketLength()) {
          // buffer > max_allowed_packet, so flush until mark, and create new packet.
          out.flushBufferStopAtMark();
          out.mark();
          lastCmdData = out.resetMark();
          break;
        }

        out.mark();

        if (out.bufIsDataAfterMark()) {
          // flush has been done
          lastCmdData = out.resetMark();
          break;
        }

        if (this.rowIdx >= this.values.length) {
          break main_loop;
        }

        this.vals = this.values[this.rowIdx++];

        // ensure type has not changed
        if (!this.checkSameHeader(parameterHeaderType, this.vals, parameterCount)) {
          out.flush();
          // reset header type
          parameterHeaderType = this.parameterHeaderFromValue(this.vals, parameterCount);
          break parameter_loop;
        }
      }
    }
    out.flush();
    this.sending = false;
    this.emit('send_end');
  }

  displaySql() {
    if (this.opts && this.initialValues) {
      if (this.sql.length > this.opts.debugLen) {
        return this.sql.substring(0, this.opts.debugLen) + '...';
      }

      let sqlMsg = this.sql + ' - parameters:';
      sqlMsg += '[';
      for (let i = 0; i < this.initialValues.length; i++) {
        if (i !== 0) sqlMsg += ',';
        let param = this.initialValues[i];
        sqlMsg = this.logParameters(sqlMsg, param);
        if (sqlMsg.length > this.opts.debugLen) {
          sqlMsg = sqlMsg.substr(0, this.opts.debugLen) + '...';
          break;
        }
      }
      sqlMsg += ']';
      return sqlMsg;
    }
    return this.sql + ' - parameters:[]';
  }

  success(val) {
    this.bulkPacketNo--;

    if (!this.sending && this.bulkPacketNo === 0) {
      this.prepare.close();
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
        if (this._rows[0].affectedRows != undefined) {
          // ok packets, reassemble them if needed
          let totalAffectedRows = 0;
          this._rows.forEach((row) => {
            totalAffectedRows += row.affectedRows;
          });

          const rs = new OkPacket(
            totalAffectedRows,
            this._rows[0].insertId,
            this._rows[this._rows.length - 1].warningStatus
          );
          this.successEnd(rs);
        } else {
          // insert with returning
          if (this._rows.length == 1) {
            this.successEnd(this._rows[0]);
          } else {
            const rs = [];
            rs.meta = this._rows[0].meta;
            this._rows.forEach((row) => {
              Array.prototype.push.apply(rs, row);
            });
            rs.meta = this._rows[0].meta;
            this.successEnd(rs);
          }
        }
        this._columns = null;
        this._rows = null;
      }
      return;
    }

    if (!this.firstError) {
      this._responseIndex++;
      this.onPacketReceive = this.readResponsePacket;
    }
  }

  throwError(err, info) {
    this.bulkPacketNo--;
    if (!this.firstError) {
      if (err.fatal) {
        this.bulkPacketNo = 0;
      }
      if (this.stack) {
        err = Errors.createError(err.message, err.errno, info, err.sqlState, this.sql, err.fatal, this.stack, false);
      }
      this.firstError = err;
    }

    if (!this.sending && this.bulkPacketNo === 0) {
      this.resolve = null;
      this.prepare.close();
      this.emit('send_end');
      process.nextTick(this.reject, this.firstError);
      this.reject = null;
      this.onPacketReceive = null;
      this.emit('end', this.firstError);
    } else {
      this._responseIndex++;
      this.onPacketReceive = this.readResponsePacket;
    }
  }

  /**
   * Validate that parameters exists and are defined.
   *
   * @param info        connection info
   * @returns {boolean} return false if any error occur.
   */
  validateParameters(info) {
    //validate parameter size.
    const nbParameter = this.prepare.parameters.length;
    for (let r = 0; r < this.values.length; r++) {
      if (!Array.isArray(this.values[r])) this.values[r] = [this.values[r]];

      //validate parameter is defined.
      for (let i = 0; i < nbParameter; i++) {
        if (this.values[r][i] === undefined) {
          this.emit('send_end');
          this.throwNewError(
            `Parameter at position ${i} is not set for values ${r}\n ${this.displaySql()}`,
            false,
            info,
            'HY000',
            Errors.ER_PARAMETER_UNDEFINED
          );
          return false;
        }
      }
    }

    return true;
  }
}

module.exports = BatchBulk;
