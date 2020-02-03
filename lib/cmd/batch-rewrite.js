'use strict';

const CommonText = require('./common-text-cmd');
const Errors = require('../misc/errors');
const Parse = require('../misc/parse');
const RewritePacket = require('../io/rewrite-packet');
const QUOTE = 0x27;

/**
 * Protocol COM_QUERY
 * see : https://mariadb.com/kb/en/library/com_query/
 */
class BatchRewrite extends CommonText {
  constructor(resolve, reject, options, connOpts, sql, values) {
    super(resolve, reject, options, connOpts, sql, values);
    this.sending = true;
  }

  /**
   * Send COM_QUERY
   *
   * @param out   output writer
   * @param opts  connection options
   * @param info  connection information
   */
  start(out, opts, info) {
    this.info = info;
    if (this.opts.timeout) {
      const err = Errors.createError(
        'Cannot use timeout for Batch statement',
        false,
        info,
        'HY000',
        Errors.ER_TIMEOUT_NOT_SUPPORTED
      );
      this.emit('send_end');
      this.throwError(err, info);
      return;
    }

    if (this.initialValues.length === 0) this.initialValues = [[]];
    if (this.opts.namedPlaceholders) {
      this.parseResults = Parse.splitRewritableNamedParameterQuery(this.sql, this.initialValues);
      this.values = this.parseResults.values;
    } else {
      this.parseResults = Parse.splitRewritableQuery(this.sql);
      this.values = this.initialValues;
      if (!this.validateParameters(info)) {
        this.sending = false;
        return;
      }
    }

    out.startPacket(this);
    this.packet = new RewritePacket(
      this.opts.maxAllowedPacket,
      out,
      this.parseResults.partList[0],
      this.parseResults.partList[this.parseResults.partList.length - 1]
    );

    this.onPacketReceive = this.readResponsePacket;
    this.valueIdx = 0;
    this.sendQueries();
  }

  sendQueries() {
    let flushed = false;
    while (!flushed && this.sending && this.valueIdx < this.values.length) {
      this.valueRow = this.values[this.valueIdx++];

      //********************************************
      // send params
      //********************************************
      const len = this.parseResults.partList.length - 3;
      for (let i = 0; i < len; i++) {
        const value = this.valueRow[i];
        flushed = this.packet.writeString(this.parseResults.partList[i + 1]) || flushed;
        if (value === null) {
          flushed = this.packet.writeStringAscii('NULL') || flushed;
          continue;
        }

        if (
          typeof value === 'object' &&
          typeof value.pipe === 'function' &&
          typeof value.read === 'function'
        ) {
          //********************************************
          // param is stream,
          // now all params will be written by event
          //********************************************
          this.registerStreamSendEvent(this.packet, this.info);
          this.currentParam = i;
          this.packet.writeInt8(QUOTE); //'

          value.on(
            'data',
            function(chunk) {
              this.packet.writeBufferEscape(chunk);
            }.bind(this)
          );

          value.on(
            'end',
            function() {
              this.packet.writeInt8(QUOTE); //'
              this.currentParam++;
              this.paramWritten();
            }.bind(this)
          );

          return;
        } else {
          //********************************************
          // param isn't stream. directly write in buffer
          //********************************************
          flushed = this.writeParam(this.packet, value, this.opts, this.info) || flushed;
        }
      }
      this.packet.writeString(this.parseResults.partList[this.parseResults.partList.length - 2]);
      this.packet.mark(!this.parseResults.reWritable || this.valueIdx === this.values.length);
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
        return 'sql: ' + this.sql.substring(0, this.opts.debugLen) + '...';
      }

      let sqlMsg = 'sql: ' + this.sql + ' - parameters:';
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
    return 'sql: ' + this.sql + ' - parameters:[]';
  }

  success(val) {
    this.packet.waitingResponseNo--;

    if (this.packet.haveErrorResponse) {
      if (!this.sending && this.packet.waitingResponseNo === 0) {
        this.packet = null;
        this.onPacketReceive = null;
        this.resolve = null;
        this._columns = null;
        this._rows = null;
        process.nextTick(this.reject, this.firstError);
        this.reject = null;
        this.emit('end', this.firstError);
      }
    } else {
      if (!this.sending && this.packet.waitingResponseNo === 0) {
        if (this.parseResults.reWritable) {
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
          return;
        } else {
          this.successEnd(this._rows);
        }
        this._columns = null;
        this._rows = null;
        return;
      }
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
      this.packet = null;
      this.onPacketReceive = null;
      this.resolve = null;
      process.nextTick(this.reject, this.firstError);
      this.reject = null;
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
      let val = this.values[r];
      if (!Array.isArray(val)) {
        val = [val];
        this.values[r] = val;
      }

      if (this.parseResults.partList.length - 3 > val.length) {
        this.emit('send_end');
        this.throwNewError(
          'Parameter at position ' +
            (val.length + 1) +
            ' is not set for values ' +
            r +
            '\n' +
            this.displaySql(),
          false,
          info,
          'HY000',
          Errors.ER_MISSING_PARAMETER
        );
        return false;
      }

      //validate parameter is defined.
      for (let i = 0; i < this.parseResults.partList.length - 3; i++) {
        if (val[i] === undefined) {
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

  /**
   * Define params events.
   * Each parameter indicate that he is written to socket,
   * emitting event so next parameter can be written.
   */
  registerStreamSendEvent(packet, info) {
    this.paramWritten = function() {
      let flushed = false;
      while (!flushed) {
        if (this.packet.haveErrorResponse) {
          this.sending = false;
          this.emit('send_end');
          return;
        }
        if (this.currentParam === this.valueRow.length) {
          // all parameters from row are written.
          flushed =
            packet.writeString(this.parseResults.partList[this.parseResults.partList.length - 2]) ||
            flushed;
          flushed =
            packet.mark(!this.parseResults.reWritable || this.valueIdx === this.values.length) ||
            flushed;
          if (this.valueIdx < this.values.length) {
            // still remaining rows
            this.valueRow = this.values[this.valueIdx++];
            this.currentParam = 0;
          } else {
            // all rows are written
            this.sending = false;
            this.emit('send_end');
            return;
          }
        }

        flushed = packet.writeString(this.parseResults.partList[this.currentParam + 1]) || flushed;
        const value = this.valueRow[this.currentParam];

        if (value === null) {
          flushed = packet.writeStringAscii('NULL') || flushed;
          this.currentParam++;
          continue;
        }

        if (
          typeof value === 'object' &&
          typeof value.pipe === 'function' &&
          typeof value.read === 'function'
        ) {
          //********************************************
          // param is stream,
          //********************************************
          flushed = packet.writeInt8(QUOTE) || flushed;
          value.once(
            'end',
            function() {
              packet.writeInt8(QUOTE);
              this.currentParam++;
              this.paramWritten();
            }.bind(this)
          );

          value.on('data', function(chunk) {
            packet.writeBufferEscape(chunk);
          });
          return;
        }

        //********************************************
        // param isn't stream. directly write in buffer
        //********************************************
        flushed = this.writeParam(packet, value, this.opts, info) || flushed;
        this.currentParam++;
      }

      if (this.sending) setImmediate(this.paramWritten.bind(this));
    }.bind(this);
  }
}

module.exports = BatchRewrite;
