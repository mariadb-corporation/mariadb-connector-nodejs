"use strict";

const CommonBinary = require("./common-binary-cmd");
const Errors = require("../misc/errors");
const Parse = require("../misc/parse");
const BulkPacket = require("../io/bulk-packet");
const QUOTE = 0x27;

/**
 * Protocol COM_STMT_BULK_EXECUTE
 * see : https://mariadb.com/kb/en/library/com_stmt_bulk_execute/
 */
class BatchBulk extends CommonBinary {
  constructor(resolve, reject, options, connOpts, sql, values) {
    super(resolve, reject, options, connOpts, sql, values);
    this.sendEnded = false;
  }

  /**
   * Send COM_STMT_BULK_EXECUTE
   *
   * @param out   output writer
   * @param opts  connection options
   * @param info  connection information
   */
  start(out, opts, info) {
    if (!this.initialValues) {
      this.emit("send_end");
      return this.throwError(
        Errors.createError(
          "Batch must have values set\n" + this.displaySql(),
          false,
          info,
          "HY000",
          Errors.ER_BATCH_WITH_NO_VALUES
        ),
        info
      );
    }
    this.initialValues = Array.isArray(this.initialValues)
      ? this.initialValues
      : [this.initialValues];

    this.values = this.initialValues;

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

    if (!this.validateParameters(info)) return;

    //send COM_STMT_PREPARE command
    this.out = out;
    out.startPacket(this);
    out.writeInt8(0x16);
    out.writeString(questionMarkSql);
    out.flushBuffer(true);
    this.onPacketReceive = this.readPrepareResultPacket;

    out.startPacket(this);
    this.packet = new BulkPacket(this.opts, out, this.values[0]);

    this.valueIdx = 0;
    while (this.valueIdx < this.values.length) {
      this.valueRow = this.values[this.valueIdx++];

      //********************************************
      // send params
      //********************************************
      const len = this.valueRow.length;
      for (let i = 0; i < len; i++) {
        const value = this.valueRow[i];
        if (value === null) {
          this.packet.writeInt8(0x01);
          continue;
        }

        //********************************************
        // param has no stream. directly write in buffer
        //********************************************
        this.writeParam(this.packet, value, this.opts, info);
      }
      const last = this.valueIdx === this.values.length;
      this.packet.mark(last, last ? null : this.values[this.valueIdx]);
    }
    this.sendEnded = true;
    this.expectedResponseNo = this.packet.packetSend + 1;
  }

  displaySql() {
    if (this.opts && this.initialValues) {
      if (this.sql.length > this.opts.debugLen) {
        return "sql: " + this.sql.substring(0, this.opts.debugLen) + "...";
      }

      let sqlMsg = "sql: " + this.sql + " - parameters:";
      sqlMsg += "[";
      for (let i = 0; i < this.initialValues.length; i++) {
        if (i !== 0) sqlMsg += ",";
        let param = this.initialValues[i];
        sqlMsg = this.logParameters(sqlMsg, param);
        if (sqlMsg.length > this.opts.debugLen) {
          sqlMsg = sqlMsg.substr(0, this.opts.debugLen) + "...";
          break;
        }
      }
      sqlMsg += "]";
      return sqlMsg;
    }
    return "sql: " + this.sql + " - parameters:[]";
  }

  success(val) {
    this.expectedResponseNo--;
    if (this.packet.haveErrorResponse) {
      if (this.sendEnded && this.expectedResponseNo === 0) {
        this.packet = null;
        this.resolve = null;
        this.onPacketReceive = null;
        this.reject = null;
        this._columns = null;
        this._rows = null;

        //send COM_STMT_CLOSE packet
        this.out.startPacket(this);
        this.out.writeInt8(0x19);
        this.out.writeInt32(this.statementId);
        this.out.flushBuffer(true);

        this.emit("send_end");
        this.emit("end", err);
        return;
      }
    } else {
      if (this.sendEnded && this.expectedResponseNo === 0) {
        this.packet = null;
        let totalAffectedRows = 0;
        this._rows.forEach(row => {
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
        return;
      }
      this._responseIndex++;
      this.onPacketReceive = this.readResponsePacket;
    }
  }

  throwError(err, info) {
    this.expectedResponseNo--;
    if (this.packet && !this.packet.haveErrorResponse) {
      if (err.fatal) this.expectedResponseNo = 0;
      if (this.stack) {
        err = Errors.createError(
          err.message,
          err.fatal,
          info,
          err.sqlState,
          err.errno,
          this.stack,
          false
        );
      }
      this.packet.endedWithError();
      process.nextTick(this.reject, err);
    }

    if (this.sendEnded && this.expectedResponseNo === 0) {
      this.packet = null;
      this.onPacketReceive = null;
      this.resolve = null;
      this.reject = null;
      this.emit("end", err);
      return;
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
      let val = this.values[r];
      if (!Array.isArray(val)) {
        val = [val];
        this.values[r] = val;
      }

      //validate parameter is defined.
      for (let i = 0; i < val.length; i++) {
        if (val[i] === undefined) {
          this.emit("send_end");
          this.throwNewError(
            "Parameter at position " +
              (i + 1) +
              " is undefined for values " +
              r +
              "\n" +
              this.displaySql(),
            false,
            info,
            "HY000",
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