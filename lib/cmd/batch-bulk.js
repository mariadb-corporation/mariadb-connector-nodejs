'use strict';

const CommonBinary = require('./common-binary-cmd');
const Errors = require('../misc/errors');
const Parse = require('../misc/parse');
const BulkPacket = require('../io/bulk-packet');

/**
 * Protocol COM_STMT_BULK_EXECUTE
 * see : https://mariadb.com/kb/en/library/com_stmt_bulk_execute/
 */
class BatchBulk extends CommonBinary {
  constructor(resolve, reject, options, connOpts, sql, values) {
    super(resolve, reject, options, connOpts, sql, values);
    this.onPacketReceive = this.readPrepareResultPacket;
  }

  /**
   * Send COM_STMT_BULK_EXECUTE
   *
   * @param out   output writer
   * @param opts  connection options
   * @param info  connection information
   */
  start(out, opts, info) {
    this.sending = true;
    this.info = info;
    this.values = this.initialValues;

    if (this.opts.timeout) {
      const err = Errors.createError(
        'Cannot use timeout for Batch statement',
        this.sql,
        false,
        info,
        'HY000',
        Errors.ER_TIMEOUT_NOT_SUPPORTED
      );
      this.emit('send_end');
      this.throwError(err, info);
      return;
    }

    let questionMarkSql = this.sql;
    if (this.opts.namedPlaceholders) {
      const res = Parse.searchPlaceholder(
        this.sql,
        info,
        this.initialValues,
        this.displaySql.bind(this)
      );
      questionMarkSql = res.sql;
      this.values = res.values;
    }

    if (!this.validateParameters(info)) {
      this.sending = false;
      return;
    }

    //send COM_STMT_PREPARE command
    this.out = out;
    this.packet = new BulkPacket(this.opts, out, this.values[0]);

    out.startPacket(this);
    out.writeInt8(0x16);
    out.writeString(questionMarkSql);
    out.flushBuffer(true);

    if (this.opts.pipelining) {
      out.startPacket(this);
      this.valueIdx = 0;
      this.sendQueries();
    } else {
      this.out = out;
    }
  }

  sendQueries() {
    let flushed = false;
    while (!flushed && this.sending && this.valueIdx < this.values.length) {
      this.valueRow = this.values[this.valueIdx++];

      //********************************************
      // send params
      //********************************************
      const len = this.valueRow.length;
      for (let i = 0; i < len; i++) {
        const value = this.valueRow[i];
        if (value === null) {
          flushed = this.packet.writeInt8(0x01) || flushed;
          continue;
        }

        //********************************************
        // param has no stream. directly write in buffer
        //********************************************
        flushed = this.writeParam(this.packet, value, this.opts, this.info) || flushed;
      }
      const last = this.valueIdx === this.values.length;
      flushed = this.packet.mark(last, last ? null : this.values[this.valueIdx]) || flushed;
    }

    if (this.valueIdx < this.values.length && !this.packet.haveErrorResponse) {
      //there is still data to send
      setImmediate(this.sendQueries.bind(this));
    } else {
      if (this.sending && this.valueIdx === this.values.length) this.emit('send_end');
      this.sending = false;
    }
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
    this.packet.waitingResponseNo--;

    if (!this.opts.pipelining && this.packet.statementId === -1) {
      this.packet.statementId = this.statementId;
      this.out.startPacket(this);
      this.valueIdx = 0;
      this.sendQueries();
      this._responseIndex++;
      this.onPacketReceive = this.readResponsePacket;
      return;
    }

    if (!this.sending && this.packet.waitingResponseNo === 0) {
      //send COM_STMT_CLOSE packet
      if (!this.firstError || !this.firstError.fatal) {
        this.sequenceNo = -1;
        this.compressSequenceNo = -1;
        this.out.startPacket(this);
        this.out.writeInt8(0x19);
        this.out.writeInt32(this.statementId);
        this.out.flushBuffer(true);
      }
      this.sending = false;
      this.emit('send_end');

      if (this.packet.haveErrorResponse) {
        this.packet = null;
        this.resolve = null;
        this.onPacketReceive = null;
        this._columns = null;
        this._rows = null;
        process.nextTick(this.reject, this.firstError);
        this.reject = null;
        this.emit('end', this.firstError);
      } else {
        this.packet = null;
        let totalAffectedRows = 0;
        this._rows.forEach((row) => {
          totalAffectedRows += row.affectedRows;
        });

        const rs = {
          affectedRows: totalAffectedRows,
          insertId: this._rows[0].insertId,
          warningStatus: this._rows[this._rows.length - 1].warningStatus
        };
        this.successEnd(rs);
        this._columns = null;
        this._rows = null;
      }
      return;
    }

    if (!this.packet.haveErrorResponse) {
      this._responseIndex++;
      this.onPacketReceive = this.readResponsePacket;
    }
  }

  throwError(err, info) {
    this.packet.waitingResponseNo--;
    this.sending = false;
    if (this.packet && !this.packet.haveErrorResponse) {
      if (err.fatal) {
        this.packet.waitingResponseNo = 0;
      }
      if (this.stack) {
        err = Errors.createError(
          err.message,
          this.sql,
          err.fatal,
          info,
          err.sqlState,
          err.errno,
          this.stack,
          false
        );
      }
      this.firstError = err;
      this.packet.endedWithError();
    }

    if (!this.sending && this.packet.waitingResponseNo === 0) {
      this.resolve = null;

      //send COM_STMT_CLOSE packet
      if (!err.fatal && this.statementId) {
        this.sequenceNo = -1;
        this.compressSequenceNo = -1;
        this.out.startPacket(this);
        this.out.writeInt8(0x19);
        this.out.writeInt32(this.statementId);
        this.out.flushBuffer(true);
      }
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
    for (let r = 0; r < this.values.length; r++) {
      if (!Array.isArray(this.values[r])) this.values[r] = [this.values[r]];

      //validate parameter is defined.
      for (let i = 0; i < this.values[r].length; i++) {
        if (this.values[r][i] === undefined) {
          this.emit('send_end');
          this.throwNewError(
            'Parameter at position ' +
              (i + 1) +
              ' is undefined for values ' +
              r +
              '\n' +
              this.displaySql(),
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
