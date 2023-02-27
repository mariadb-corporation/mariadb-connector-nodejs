'use strict';

const Parser = require('./parser');
const Errors = require('../misc/errors');
const Parse = require('../misc/parse');
const TextEncoder = require('./encoder/text-encoder');

const QUOTE = 0x27;

/**
 * Protocol COM_QUERY
 * see : https://mariadb.com/kb/en/library/com_query/
 */
class Query extends Parser {
  constructor(resolve, reject, connOpts, cmdParam) {
    super(resolve, reject, connOpts, cmdParam);
    this.encoder = new TextEncoder(this.opts);
    this.binary = false;
  }

  /**
   * Send COM_QUERY
   *
   * @param out   output writer
   * @param opts  connection options
   * @param info  connection information
   */
  start(out, opts, info) {
    if (opts.logger.query) opts.logger.query(`QUERY: ${opts.logger.logParam ? this.displaySql() : this.sql}`);
    this.onPacketReceive = this.readResponsePacket;
    if (this.initialValues === undefined) {
      //shortcut if no parameters
      out.startPacket(this);
      out.writeInt8(0x03);
      if (!this.handleTimeout(out, info)) return;
      out.writeString(this.sql);
      out.flush();
      this.emit('send_end');
      return;
    }

    this.encodedSql = out.encodeString(this.sql);

    if (this.opts.namedPlaceholders) {
      try {
        const parsed = Parse.splitQueryPlaceholder(
          this.encodedSql,
          info,
          this.initialValues,
          this.displaySql.bind(this)
        );
        this.paramPositions = parsed.paramPositions;
        this.values = parsed.values;
      } catch (err) {
        this.emit('send_end');
        return this.throwError(err, info);
      }
    } else {
      this.paramPositions = Parse.splitQuery(this.encodedSql);
      this.values = Array.isArray(this.initialValues) ? this.initialValues : [this.initialValues];
      if (!this.validateParameters(info)) return;
    }

    out.startPacket(this);
    out.writeInt8(0x03);
    if (!this.handleTimeout(out, info)) return;

    this.paramPos = 0;
    this.sqlPos = 0;

    //********************************************
    // send params
    //********************************************
    const len = this.paramPositions.length / 2;
    for (this.valueIdx = 0; this.valueIdx < len; ) {
      out.writeBuffer(this.encodedSql, this.sqlPos, this.paramPositions[this.paramPos++] - this.sqlPos);
      this.sqlPos = this.paramPositions[this.paramPos++];

      const value = this.values[this.valueIdx++];

      if (
        value !== null &&
        typeof value === 'object' &&
        typeof value.pipe === 'function' &&
        typeof value.read === 'function'
      ) {
        this.sending = true;
        //********************************************
        // param is stream,
        // now all params will be written by event
        //********************************************
        this.paramWritten = this._paramWritten.bind(this, out, info);
        out.writeInt8(QUOTE); //'
        value.on('data', out.writeBufferEscape.bind(out));

        value.on(
          'end',
          function () {
            out.writeInt8(QUOTE); //'
            this.paramWritten();
          }.bind(this)
        );

        return;
      } else {
        //********************************************
        // param isn't stream. directly write in buffer
        //********************************************
        this.encoder.writeParam(out, value, this.opts, info);
      }
    }
    out.writeBuffer(this.encodedSql, this.sqlPos, this.encodedSql.length - this.sqlPos);
    out.flush();
    this.emit('send_end');
  }

  /**
   * If timeout is set, prepend query with SET STATEMENT max_statement_time=xx FOR, or throw an error
   * @param out buffer
   * @param info server information
   * @returns {boolean} false if an error has been thrown
   */
  handleTimeout(out, info) {
    if (this.opts.timeout) {
      if (info.isMariaDB()) {
        if (info.hasMinVersion(10, 1, 2)) {
          out.writeString(`SET STATEMENT max_statement_time=${this.opts.timeout / 1000} FOR `);
          return true;
        } else {
          const err = Errors.createError(
            `Cannot use timeout for xpand/MariaDB server before 10.1.2. timeout value: ${this.opts.timeout}`,
            Errors.ER_TIMEOUT_NOT_SUPPORTED,
            info,
            'HY000',
            this.sql
          );
          this.emit('send_end');
          this.throwError(err, info);
          return false;
        }
      } else {
        //not available for MySQL
        // max_execution time exist, but only for select, and as hint
        const err = Errors.createError(
          `Cannot use timeout for MySQL server. timeout value: ${this.opts.timeout}`,
          Errors.ER_TIMEOUT_NOT_SUPPORTED,
          info,
          'HY000',
          this.sql
        );
        this.emit('send_end');
        this.throwError(err, info);
        return false;
      }
    }
    return true;
  }

  /**
   * Validate that parameters exists and are defined.
   *
   * @param info        connection info
   * @returns {boolean} return false if any error occur.
   */
  validateParameters(info) {
    //validate parameter size.
    if (this.paramPositions.length / 2 > this.values.length) {
      this.emit('send_end');
      this.throwNewError(
        `Parameter at position ${this.values.length + 1} is not set`,
        false,
        info,
        'HY000',
        Errors.ER_MISSING_PARAMETER
      );
      return false;
    }

    //validate parameter is defined.
    for (let i = 0; i < this.paramPositions.length / 2; i++) {
      if (this.values[i] === undefined) {
        this.emit('send_end');
        this.throwNewError(
          `Parameter at position ${i + 1} is undefined\n${this.displaySql()}`,
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

  _paramWritten(out, info) {
    while (true) {
      if (this.valueIdx === this.paramPositions.length / 2) {
        //********************************************
        // all parameters are written.
        // flush packet
        //********************************************
        out.writeBuffer(this.encodedSql, this.sqlPos, this.encodedSql.length - this.sqlPos);
        out.flush();
        this.sending = false;
        this.emit('send_end');
        return;
      } else {
        const value = this.values[this.valueIdx++];
        out.writeBuffer(this.encodedSql, this.sqlPos, this.paramPositions[this.paramPos++] - this.sqlPos);
        this.sqlPos = this.paramPositions[this.paramPos++];

        if (value === null) {
          out.writeStringAscii('NULL');
          continue;
        }

        if (typeof value === 'object' && typeof value.pipe === 'function' && typeof value.read === 'function') {
          //********************************************
          // param is stream,
          //********************************************
          out.writeInt8(QUOTE);
          value.once(
            'end',
            function () {
              out.writeInt8(QUOTE);
              this._paramWritten(out, info);
            }.bind(this)
          );
          value.on('data', out.writeBufferEscape.bind(out));
          return;
        }

        //********************************************
        // param isn't stream. directly write in buffer
        //********************************************
        this.encoder.writeParam(out, value, this.opts, info);
      }
    }
  }
}

module.exports = Query;
