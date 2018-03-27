"use strict";

const ResultSet = require("./resultset");
const Utils = require("../misc/utils");
const FieldType = require("../const/field-type");

const QUOTE = 0x27;

/**
 * Protocol COM_QUERY
 * see : https://mariadb.com/kb/en/library/com_query/
 */
class Query extends ResultSet {
  constructor(connEvents, options, sql, values, callback) {
    super(connEvents);
    this.opts = options;
    this.sql = sql;
    this.initialValues = values;
    this.onResult = callback;
  }

  /**
   * Send COM_QUERY
   *
   * @param out   output writer
   * @param opts  connection options
   * @param info  connection information
   * @returns {*} next packet handler
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
      return this.readResponsePacket;
    }

    if (this.opts.namedPlaceholders) {
      try {
        const parsed = Query.splitQueryPlaceholder(
          this.sql,
          info,
          this.initialValues,
          this.displaySql.bind(this)
        );
        this.queryParts = parsed.parts;
        this.values = parsed.values;
      } catch (err) {
        this.emit("send_end");
        this.throwError(err);
        return null;
      }
    } else {
      this.queryParts = Query.splitQuery(this.sql);
      this.values = Array.isArray(this.initialValues) ? this.initialValues : [this.initialValues];
      if (!this.validateParameters(info)) return null;
    }

    out.startPacket(this);
    out.writeInt8(0x03);
    out.writeString(this.queryParts[0]);

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
        this.registerStreamEvent(out);
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

        return this.readResponsePacket;
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
    return this.readResponsePacket;
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
      const err = Utils.createError(
        "Parameter at position " + (this.values.length + 1) + " is not set\n" + this.displaySql(),
        false,
        info,
        1210,
        "HY000"
      );
      this.emit("send_end");
      this.throwError(err);
      return false;
    }

    //validate parameter is defined.
    for (let i = 0; i < this.queryParts.length - 1; i++) {
      if (this.values[i] === undefined) {
        const err = Utils.createError(
          "Parameter at position " + (i + 1) + " is undefined\n" + this.displaySql(),
          false,
          info,
          1210,
          "HY000"
        );
        this.emit("send_end");
        this.throwError(err);
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
  registerStreamEvent(out) {
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
   * Write current parameter value to output writer (escaped)
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
        out.writeStringAscii(value + "");
        break;
      case "object":
        if (Object.prototype.toString.call(value) === "[object Date]") {
          out.writeInt8(QUOTE);
          out.writeDate(value, opts);
        } else if (Buffer.isBuffer(value)) {
          out.writeStringAscii("_BINARY '");
          out.writeBufferEscape(value);
        } else if (typeof value.toSqlString === "function") {
          out.writeInt8(QUOTE);
          out.writeStringEscape(String(value.toSqlString()));
        } else {
          out.writeInt8(QUOTE);
          out.writeStringEscape(JSON.stringify(value));
        }
        out.writeInt8(QUOTE);
        break;
      default:
        out.writeInt8(QUOTE);
        out.writeStringEscape(value);
        out.writeInt8(QUOTE);
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
        column.isUnsigned()
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
        //TODO ?
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
          column.isUnsigned()
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

  /**
   * Split query according to parameters (question mark).
   * Question mark in comment are not taken in account
   *
   * @returns {Array} query separated by parameters
   */
  static splitQuery(sql) {
    let partList = [];

    const State = {
      Normal: 1 /* inside  query */,
      String: 2 /* inside string */,
      SlashStarComment: 3 /* inside slash-star comment */,
      Escape: 4 /* found backslash */,
      EOLComment: 5 /* # comment, or // comment, or -- comment */,
      Backtick: 6 /* found backtick */
    };

    let state = State.Normal;
    let lastChar = "\0";

    let singleQuotes = false;
    let lastParameterPosition = 0;

    let idx = 0;
    let car = sql.charAt(idx++);

    while (car !== "") {
      if (state === State.Escape) state = State.String;

      switch (car) {
        case "*":
          if (state === State.Normal && lastChar === "/") state = State.SlashStarComment;
          break;

        case "/":
          if (state === State.SlashStarComment && lastChar === "*") {
            state = State.Normal;
          } else if (state === State.Normal && lastChar === "/") {
            state = State.EOLComment;
          }
          break;

        case "#":
          if (state === State.Normal) state = State.EOLComment;
          break;

        case "-":
          if (state === State.Normal && lastChar === "-") {
            state = State.EOLComment;
          }
          break;

        case "\n":
          if (state === State.EOLComment) {
            state = State.Normal;
          }
          break;

        case '"':
          if (state === State.Normal) {
            state = State.String;
            singleQuotes = false;
          } else if (state === State.String && !singleQuotes) {
            state = State.Normal;
          }
          break;

        case "'":
          if (state === State.Normal) {
            state = State.String;
            singleQuotes = true;
          } else if (state === State.String && singleQuotes) {
            state = State.Normal;
          }
          break;

        case "\\":
          if (state === State.String) state = State.Escape;
          break;

        case "?":
          if (state === State.Normal) {
            partList.push(sql.substring(lastParameterPosition, idx - 1));
            lastParameterPosition = idx;
          }
          break;
        case "`":
          if (state === State.Backtick) {
            state = State.Normal;
          } else if (state === State.Normal) {
            state = State.Backtick;
          }
          break;
      }
      lastChar = car;

      car = sql.charAt(idx++);
    }
    if (lastParameterPosition === 0) {
      partList.push(sql);
    } else {
      partList.push(sql.substring(lastParameterPosition));
    }

    return partList;
  }

  /**
   * Split query according to parameters using placeholder.
   *
   * @param sql             sql with placeholders
   * @param info            connection information
   * @param initialValues   placeholder object
   * @returns {{parts: Array, values: Array}}
   */
  static splitQueryPlaceholder(sql, info, initialValues, displaySql) {
    let partList = [];

    const State = {
      Normal: 1 /* inside  query */,
      String: 2 /* inside string */,
      SlashStarComment: 3 /* inside slash-star comment */,
      Escape: 4 /* found backslash */,
      EOLComment: 5 /* # comment, or // comment, or -- comment */,
      Backtick: 6 /* found backtick */,
      Placeholder: 7 /* found placeholder */
    };

    let values = [];
    let state = State.Normal;
    let lastChar = "\0";

    let singleQuotes = false;
    let lastParameterPosition = 0;

    let idx = 0;
    let car = sql.charAt(idx++);
    let placeholderName;

    while (car !== "") {
      if (state === State.Escape) state = State.String;

      switch (car) {
        case "*":
          if (state === State.Normal && lastChar === "/") state = State.SlashStarComment;
          break;

        case "/":
          if (state === State.SlashStarComment && lastChar === "*") {
            state = State.Normal;
          } else if (state === State.Normal && lastChar === "/") {
            state = State.EOLComment;
          }
          break;

        case "#":
          if (state === State.Normal) state = State.EOLComment;
          break;

        case "-":
          if (state === State.Normal && lastChar === "-") {
            state = State.EOLComment;
          }
          break;

        case "\n":
          if (state === State.EOLComment) {
            state = State.Normal;
          }
          break;

        case '"':
          if (state === State.Normal) {
            state = State.String;
            singleQuotes = false;
          } else if (state === State.String && !singleQuotes) {
            state = State.Normal;
          }
          break;

        case "'":
          if (state === State.Normal) {
            state = State.String;
            singleQuotes = true;
          } else if (state === State.String && singleQuotes) {
            state = State.Normal;
          }
          break;

        case "\\":
          if (state === State.String) state = State.Escape;
          break;

        case ":":
          if (state === State.Normal) {
            if (!initialValues) {
              throw Utils.createError(
                "Placeholder values are not defined\n" + displaySql.call(),
                false,
                info,
                1210,
                "HY000"
              );
            }
            partList.push(sql.substring(lastParameterPosition, idx - 1));
            placeholderName = "";
            while (
              ((car = sql.charAt(idx++)) !== "" && (car >= "0" && car <= "9")) ||
              (car >= "A" && car <= "Z") ||
              (car >= "a" && car <= "z") ||
              car === "-" ||
              car === "_"
            ) {
              placeholderName += car;
            }
            idx--;
            const val = initialValues[placeholderName];
            if (val === undefined) {
              throw Utils.createError(
                "Placeholder '" + placeholderName + "' is not defined\n" + displaySql.call(),
                false,
                info,
                1210,
                "HY000"
              );
            }
            values.push(val);
            lastParameterPosition = idx;
          }
          break;
        case "`":
          if (state === State.Backtick) {
            state = State.Normal;
          } else if (state === State.Normal) {
            state = State.Backtick;
          }
          break;
      }
      lastChar = car;

      car = sql.charAt(idx++);
    }
    if (lastParameterPosition === 0) {
      partList.push(sql);
    } else {
      partList.push(sql.substring(lastParameterPosition));
    }

    return { parts: partList, values: values };
  }
}

module.exports = Query;
