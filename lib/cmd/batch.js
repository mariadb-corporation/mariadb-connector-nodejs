"use strict";

const CommonText = require("./common-text-cmd");
const Errors = require("../misc/errors");
const Parse = require("../misc/parse");
const QUOTE = 0x27;

/**
 * Protocol COM_QUERY
 * see : https://mariadb.com/kb/en/library/com_query/
 */
class Batch extends CommonText {
  constructor(resolve, reject, options, sql, values) {
    super(resolve, reject, options, sql, values);
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
          ), info);
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

    if (this.parseResults.reWritable) {
      out.rewriteEndPart(this.parseResults.partList[this.parseResults.partList.length - 1]);
      out.startPacket(this);
      out.writeInt8(0x03);
      out.writeString(this.parseResults.partList[0]);

      this.valueIdx = 0;
      while (this.valueIdx < this.values.length) {
        if (this.valueIdx > 0) out.writeStringAscii(',');
        this.valueRow = this.values[this.valueIdx++];
        this.onPacketReceive = this.readResponsePacket;

        //********************************************
        // send params
        //********************************************
        const len = this.valueRow.length;
        for (let i = 0; i < len; i++) {
          const value = this.valueRow[i];
          out.writeString(this.parseResults.partList[i + 1]);
          if (value === null) {
            out.writeStringAscii("NULL");
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
            this.registerStreamSendEvent(out, info);
            this.currentParam = i;
            out.writeInt8(QUOTE); //'

            value.on("data", function (chunk) {
              out.writeBufferEscape(chunk);
            });

            value.on(
                "end",
                function () {
                  out.writeInt8(QUOTE); //'
                  this.currentParam++;
                  this.emit("param_written");
                }.bind(this)
            );

            return;
          } else {
            //********************************************
            // param isn't stream. directly write in buffer
            //********************************************
            this.writeParam(out, value, this.opts, info);
          }
        }
        out.writeString(this.parseResults.partList[this.parseResults.partList.length - 2]);
        out.mark();

      }
      out.writeString(this.parseResults.partList[this.parseResults.partList.length - 1]);
    } else {
      //TODO in case of non rewritable, use multi-queries if activate

    }

    out.flushBuffer(true);
    out.resetMark();
    this.emit("send_end");
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
            "Parameter at position " + (val.length + 1) + " is not set for values " + r + "\n" + this.displaySql(),
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
              "Parameter at position " + (i + 1) + " is undefined for values " + r + "\n" + this.displaySql(),
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
  registerStreamSendEvent(out, info) {
    // note : Implementation use recursive calls, but stack won't never get near v8 max call stack size
    const self = this;
    this.on("param_written", function() {
      if (self.currentParam === self.valueRow.length) {
        // all parameters are written.
        out.writeString(self.parseResults.partList[self.parseResults.partList.length - 2]);
        if (self.valueIdx < self.values.length) {
          out.writeStringAscii(',');
          self.valueRow = self.values[self.valueIdx++];
          self.currentParam = 0;
        } else {
          out.writeString(self.parseResults.partList[self.parseResults.partList.length - 1]);
          out.flushBuffer(true);
          out.resetMark();
          self.emit("send_end");
          return;
        }
      }

      out.writeString(self.parseResults.partList[self.currentParam + 1]);
      const value = self.valueRow[self.currentParam];

      if (value === null) {
        out.writeStringAscii("NULL");
        self.emit("param_written");
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
        out.writeInt8(QUOTE);
        value.once("end", function() {
          out.writeInt8(QUOTE);
          self.currentParam++;
          self.emit("param_written");
        });
        value.on("data", function(chunk) {
          out.writeBufferEscape(chunk);
        });
      } else {
        //********************************************
        // param isn't stream. directly write in buffer
        //********************************************
        self.writeParam(out, value, self.opts, info);
        self.currentParam++;
        self.emit("param_written");
      }

    });
  }

}

module.exports = Batch;
