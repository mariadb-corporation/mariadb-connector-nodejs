"use strict";

const ResultSet = require("./resultset");
const Errors = require("../misc/errors");
const FieldDetail = require("../const/field-detail");
const FieldType = require("../const/field-type");
const Parse = require("../misc/parse");
const QUOTE = 0x27;

/**
 * Protocol COM_QUERY
 * see : https://mariadb.com/kb/en/library/com_query/
 */
class Query extends ResultSet {
  constructor(resolve, reject, options, sql, values) {
    super(resolve, reject);
    this.opts = options;
    this.sql = sql;
    this.initialValues = values;
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
        //********************************************
        // param is stream,
        // now all params will be written by event
        //********************************************
        this.registerStreamSendEvent(out);
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
            this.emit("param_written");
          }.bind(this)
        );

        return;
      } else {
        //********************************************
        // param isn't stream. directly write in buffer
        //********************************************
        this.writeParam(out, value, this.opts);
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
   * emitting event so next parameter can be written.
   */
  registerStreamSendEvent(out) {
    // note : Implementation use recursive calls, but stack won't never get near v8 max call stack size
    const self = this;
    this.on("param_written", function() {
      if (self.currentParam === self.queryParts.length) {
        //********************************************
        // all parameters are written.
        // flush packet
        //********************************************
        out.flushBuffer(true);
        self.emit("send_end");
      } else {
        const value = self.values[self.currentParam - 1];

        if (value === null) {
          out.writeStringAscii("NULL");
          out.writeString(self.queryParts[self.currentParam++]);
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
            out.writeString(self.queryParts[self.currentParam++]);
            self.emit("param_written");
          });
          value.on("data", function(chunk) {
            out.writeBufferEscape(chunk);
          });
        } else {
          //********************************************
          // param isn't stream. directly write in buffer
          //********************************************
          this.writeParam(out, value, self.opts);
          out.writeString(self.queryParts[self.currentParam++]);
          self.emit("param_written");
        }
      }
    });
  }

  /**
   * Write (and escape) current parameter value to output writer
   *
   * @param out     output writer
   * @param value   current parameter
   * @param opts    connection options
   */
  writeParam(out, value, opts) {
    switch (typeof value) {
      case "boolean":
        out.writeStringAscii(value ? "true" : "false");
        break;
      case "number":
        out.writeStringAscii("" + value);
        break;
      case "object":
        if (Object.prototype.toString.call(value) === "[object Date]") {
          out.writeDateQuote(value, opts);
        } else if (Buffer.isBuffer(value)) {
          out.writeStringAscii("_BINARY '");
          out.writeBufferEscape(value);
          out.writeInt8(QUOTE);
        } else if (typeof value.toSqlString === "function") {
          out.writeStringEscapeQuote(String(value.toSqlString()));
        } else {
          out.writeStringEscapeQuote(JSON.stringify(value));
        }
        break;
      default:
        out.writeStringEscapeQuote(value);
    }
  }

  /**
   * Read text result-set row
   *
   * see: https://mariadb.com/kb/en/library/resultset-row/#text-resultset-row
   * data are created according to their type.
   *
   * @param columns     columns metadata
   * @param packet      current row packet
   * @param connOpts    connection options
   * @returns {*}       row data
   */
  parseRow(columns, packet, connOpts) {
    let row;
    if (this.opts.rowsAsArray) {
      row = [columns.length];
      for (let i = 0; i < columns.length; i++) {
        row[i] = this._getValue(i, columns[i], this.opts, connOpts, packet);
      }
    } else if (this.opts.nestTables === true) {
      row = {};
      for (let i = 0; i < columns.length; i++) {
        if (!row[this.tableHeader[i][0]]) row[this.tableHeader[i][0]] = {};
        row[this.tableHeader[i][0]][this.tableHeader[i][1]] = this._getValue(
          i,
          columns[i],
          this.opts,
          connOpts,
          packet
        );
      }
    } else {
      row = {};
      for (let i = 0; i < columns.length; i++) {
        row[this.tableHeader[i]] = this._getValue(i, columns[i], this.opts, connOpts, packet);
      }
    }

    return row;
  }

  castTextWrapper(column, opts, connOpts, packet) {
    column.string = () => packet.readStringLengthEncoded(connOpts.collation.encoding);
    column.buffer = () => packet.readBufferLengthEncoded();
    column.float = () => packet.readFloatLengthCoded();
    column.int = () => packet.readIntLengthEncoded();
    column.long = () =>
      packet.readLongLengthEncoded(
        opts.supportBigNumbers,
        opts.bigNumberStrings,
        (column.flags & FieldDetail.UNSIGNED) > 0
      );
    column.decimal = () =>
      packet.readDecimalLengthEncoded(opts.supportBigNumbers, opts.bigNumberStrings);
    column.date = () =>
      packet.readDecimalLengthEncoded(opts.supportBigNumbers, opts.bigNumberStrings);
    column.geometry = () => {
      //TODO parse geometry
      return null;
    };
  }

  readCastValue(index, column, opts, connOpts, packet) {
    this.castTextWrapper(column, opts, connOpts, packet);
    return opts.typeCast(
      column,
      function() {
        return this.readRowData(index, column, opts, connOpts, packet);
      }.bind(this)
    );
  }

  /**
   * Read row data.
   *
   * @param index     current data index in row
   * @param column    associate metadata
   * @param opts   query options
   * @param connOpts  connection options
   * @param packet    row packet
   * @returns {*}     data
   */
  readRowData(index, column, opts, connOpts, packet) {
    switch (column.columnType) {
      case FieldType.ENUM:
        //TODO handle enum field type
        return 0;
      case FieldType.TINY:
      case FieldType.SHORT:
      case FieldType.LONG:
      case FieldType.INT24:
      case FieldType.YEAR:
        return packet.readIntLengthEncoded();
      case FieldType.FLOAT:
      case FieldType.DOUBLE:
        return packet.readFloatLengthCoded();
      case FieldType.LONGLONG:
        return packet.readLongLengthEncoded(
          opts.supportBigNumbers,
          opts.bigNumberStrings,
          (column.flags & FieldDetail.UNSIGNED) > 0
        );
      case FieldType.DECIMAL:
      case FieldType.NEWDECIMAL:
        return packet.readDecimalLengthEncoded(opts.supportBigNumbers, opts.bigNumberStrings);
      case FieldType.DATE:
        if (opts.dateStrings) {
          return packet.readAsciiStringLengthEncoded();
        }
        return packet.readDate();
      case FieldType.DATETIME:
      case FieldType.TIMESTAMP:
        if (opts.dateStrings) {
          return packet.readAsciiStringLengthEncoded();
        }
        return packet.readDateTime();
      case FieldType.TIME:
        return packet.readAsciiStringLengthEncoded();
      case FieldType.GEOMETRY:
        //TODO parse Geometry
        return null;
      case FieldType.JSON:
        //for mysql only => parse string as JSON object
        return JSON.parse(packet.readStringLengthEncoded("utf8"));

      default:
        if (column.collation.index === 63) {
          return packet.readBufferLengthEncoded();
        } else {
          return packet.readStringLengthEncoded(connOpts.collation.encoding);
        }
    }
  }
}

module.exports = Query;
