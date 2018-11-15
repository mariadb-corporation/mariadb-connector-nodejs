"use strict";

const CommonText = require("./common-text-cmd");
const Errors = require("../misc/errors");
const Parse = require("../misc/parse");
const QUOTE = 0x27;

/**
 * Protocol COM_QUERY
 * see : https://mariadb.com/kb/en/library/com_query/
 */
class Query extends CommonText {
  constructor(resolve, reject, options, connOpts, sql, values) {
    super(resolve, reject, options, connOpts, sql, values);
  }

  /**
   * Send COM_QUERY
   *
   * @param out   output writer
   * @param opts  connection options
   * @param info  connection information
   */
  start(out, opts, info) {
    if (!this.initialValues) {
      //shortcut if no parameters
      out.startPacket(this);
      out.writeInt8(0x03);
      out.writeString(this.sql);
      out.flushBuffer(true);
      this.emit("send_end");
      return (this.onPacketReceive = this.readResponsePacket);
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
      this.queryParts = Parse.splitQuery(this.sql);
      this.values = Array.isArray(this.initialValues) ? this.initialValues : [this.initialValues];
      if (!this.validateParameters(info)) return;
    }

    out.startPacket(this);
    out.writeInt8(0x03);
    out.writeString(this.queryParts[0]);
    this.onPacketReceive = this.readResponsePacket;

    //********************************************
    // send params
    //********************************************
    const len = this.queryParts.length;
    for (let i = 1; i < len; i++) {
      const value = this.values[i - 1];

      if (value === null) {
        out.writeStringAscii("NULL");
        out.writeString(this.queryParts[i]);
        continue;
      }

      if (
        typeof value === "object" &&
        typeof value.pipe === "function" &&
        typeof value.read === "function"
      ) {
        this.sending = true;
        //********************************************
        // param is stream,
        // now all params will be written by event
        //********************************************
        this.registerStreamSendEvent(out, info);
        this.currentParam = i;
        out.writeInt8(QUOTE); //'

        value.on("data", function(chunk) {
          out.writeBufferEscape(chunk);
        });

        value.on(
          "end",
          function() {
            out.writeInt8(QUOTE); //'
            out.writeString(this.queryParts[this.currentParam++]);
            this.paramWritten();
          }.bind(this)
        );

        return;
      } else {
        //********************************************
        // param isn't stream. directly write in buffer
        //********************************************
        this.writeParam(out, value, this.opts, info);
        out.writeString(this.queryParts[i]);
      }
    }
    out.flushBuffer(true);
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
    if (this.queryParts.length - 1 > this.values.length) {
      this.emit("send_end");
      this.throwNewError(
        "Parameter at position " + (this.values.length + 1) + " is not set\n" + this.displaySql(),
        false,
        info,
        "HY000",
        Errors.ER_MISSING_PARAMETER
      );
      return false;
    }

    //validate parameter is defined.
    for (let i = 0; i < this.queryParts.length - 1; i++) {
      if (this.values[i] === undefined) {
        this.emit("send_end");
        this.throwNewError(
          "Parameter at position " + (i + 1) + " is undefined\n" + this.displaySql(),
          false,
          info,
          "HY000",
          Errors.ER_PARAMETER_UNDEFINED
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Define params events.
   * Each parameter indicate that he is written to socket,
   * emitting event so next stream parameter can be written.
   */
  registerStreamSendEvent(out, info) {
    // note : Implementation use recursive calls, but stack won't never get near v8 max call stack size
    //since event launched for stream parameter only
    this.paramWritten = function() {
      while (true) {
        if (this.currentParam === this.queryParts.length) {
          //********************************************
          // all parameters are written.
          // flush packet
          //********************************************
          out.flushBuffer(true);
          this.sending = false;
          this.emit("send_end");
          return;
        } else {
          const value = this.values[this.currentParam - 1];

          if (value === null) {
            out.writeStringAscii("NULL");
            out.writeString(this.queryParts[this.currentParam++]);
            continue;
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
            value.once(
              "end",
              function() {
                out.writeInt8(QUOTE);
                out.writeString(this.queryParts[this.currentParam++]);
                this.paramWritten();
              }.bind(this)
            );
            value.on("data", function(chunk) {
              out.writeBufferEscape(chunk);
            });
            return;
          }

          //********************************************
          // param isn't stream. directly write in buffer
          //********************************************
          this.writeParam(out, value, this.opts, info);
          out.writeString(this.queryParts[this.currentParam++]);
        }
      }
    }.bind(this);
  }
}

module.exports = Query;
