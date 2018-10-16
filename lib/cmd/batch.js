"use strict";

const CommonText = require("./common-text-cmd");
const Errors = require("../misc/errors");
const Parse = require("../misc/parse");
const WritePacket = require("../io/write-packet");
const QUOTE = 0x27;

/**
 * Protocol COM_QUERY
 * see : https://mariadb.com/kb/en/library/com_query/
 */
class Batch extends CommonText {
  constructor(resolve, reject, options, sql, values) {
    super(resolve, reject, options, sql, values);
    this.sendEnded = false;
  }

  /**
   * Send COM_QUERY
   *
   * @param out   output writer
   * @param opts  connection options
   * @param info  connection information
   */
  start(out, opts, info) {
    this.configAssign(opts, this.opts);

    if (!this.initialValues) {
      this.emit("send_end");
      return this.throwError(
        Errors.createError(
          "Batch must have values set\n" + displaySql.call(),
          false,
          info,
          "HY000",
          Errors.ER_BATCH_WITH_NO_VALUES
        ),
        info
      );
    }

    if (this.opts.namedPlaceholders) {
      try {
        const parsed = Parse.splitQueryPlaceholder(
          this.sql,
          info,
          this.initialValues,
          this.displaySql.bind(this)
        );
        this.queryParts = parsed.parts;
        this.values = parsed.values;
      } catch (err) {
        this.emit("send_end");
        return this.throwError(err, info);
      }
    } else {
      this.parseResults = Parse.splitRewritableQuery(this.sql);
      this.values = Array.isArray(this.initialValues) ? this.initialValues : [this.initialValues];
      if (!this.validateParameters(info)) return;
    }

    out.startPacket(this);
    this.packet = new WritePacket(
      out,
      this.parseResults.partList[0],
      this.parseResults.partList[this.parseResults.partList.length - 1]
    );

    this.valueIdx = 0;
    while (this.valueIdx < this.values.length) {
      this.valueRow = this.values[this.valueIdx++];
      this.onPacketReceive = this.readResponsePacket;

      //********************************************
      // send params
      //********************************************
      const len = this.valueRow.length;
      for (let i = 0; i < len; i++) {
        const value = this.valueRow[i];
        this.packet.writeString(this.parseResults.partList[i + 1]);
        if (value === null) {
          this.packet.writeStringAscii("NULL");
          continue;
        }

        if (
          typeof value === "object" &&
          typeof value.pipe === "function" &&
          typeof value.read === "function"
        ) {
          //********************************************
          // param is stream,
          // now all params will be written by event
          //********************************************
          this.registerStreamSendEvent(this.packet, info);
          this.currentParam = i;
          this.packet.writeInt8(QUOTE); //'

          value.on(
            "data",
            function(chunk) {
              this.packet.writeBufferEscape(chunk);
            }.bind(this)
          );

          value.on(
            "end",
            function() {
              this.packet.writeInt8(QUOTE); //'
              this.currentParam++;
              process.nextTick(this.paramWritten.bind(this));
            }.bind(this)
          );

          return;
        } else {
          //********************************************
          // param isn't stream. directly write in buffer
          //********************************************
          this.writeParam(this.packet, value, this.opts, info);
        }
      }
      this.packet.writeString(this.parseResults.partList[this.parseResults.partList.length - 2]);
      this.packet.mark(!this.parseResults.reWritable || this.valueIdx === this.values.length);
    }
    this.sendEnded = true;
    this.expectedResponseNo = this.packet.packetSend;
    this.packet = null;

    this.emit("send_end");
  }

  success(val) {
    this.expectedResponseNo--;
    if (this.parseResults.reWritable) {
      if (this.sendEnded && this.expectedResponseNo === 0) {
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
    } else if (this.sendEnded && this.expectedResponseNo === 0) {
      this.successEnd(this._rows);
      this._columns = null;
      this._rows = null;
      return;
    }

    this._responseIndex++;
    this.onPacketReceive = this.readResponsePacket;
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

      if (this.parseResults.length - 3 > val.length) {
        this.emit("send_end");
        this.throwNewError(
          "Parameter at position " +
            (val.length + 1) +
            " is not set for values " +
            r +
            "\n" +
            this.displaySql(),
          false,
          info,
          "HY000",
          Errors.ER_MISSING_PARAMETER
        );
        return false;
      }

      //validate parameter is defined.
      for (let i = 0; i < this.parseResults.length - 3; i++) {
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

  /**
   * Define params events.
   * Each parameter indicate that he is written to socket,
   * emitting event so next parameter can be written.
   */
  registerStreamSendEvent(packet, info) {
    const self = this;
    this.paramWritten = function() {
      while (true) {
        if (self.currentParam === self.valueRow.length) {
          // all parameters are written.
          packet.writeString(self.parseResults.partList[self.parseResults.partList.length - 2]);
          packet.mark(!this.parseResults.reWritable || self.valueIdx === self.values.length);
          if (self.valueIdx < self.values.length) {
            self.valueRow = self.values[self.valueIdx++];
            self.currentParam = 0;
          } else {
            this.sendEnded = true;
            this.expectedResponseNo = packet.packetSend;
            self.packet = null;
            self.emit("send_end");
            return;
          }
        }

        packet.writeString(self.parseResults.partList[self.currentParam + 1]);
        const value = self.valueRow[self.currentParam];

        if (value === null) {
          packet.writeStringAscii("NULL");
          process.nextTick(self.paramWritten.bind(self));
          return;
        }

        if (
          typeof value === "object" &&
          typeof value.pipe === "function" &&
          typeof value.read === "function"
        ) {
          //********************************************
          // param is stream,
          //********************************************
          packet.writeInt8(QUOTE);
          value.once("end", function() {
            packet.writeInt8(QUOTE);
            self.currentParam++;
            process.nextTick(self.paramWritten.bind(self));
          });
          value.on("data", function(chunk) {
            packet.writeBufferEscape(chunk);
          });
          return;
        } else {
          //********************************************
          // param isn't stream. directly write in buffer
          //********************************************
          self.writeParam(packet, value, self.opts, info);
          self.currentParam++;
        }
      }
    };
  }
}

module.exports = Batch;
