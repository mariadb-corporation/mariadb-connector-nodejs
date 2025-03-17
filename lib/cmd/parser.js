//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

const Command = require('./command');
const ServerStatus = require('../const/server-status');
const ColumnDefinition = require('./column-definition');
const Errors = require('../misc/errors');
const fs = require('fs');
const Parse = require('../misc/parse');
const BinaryDecoder = require('./decoder/binary-decoder');
const TextDecoder = require('./decoder/text-decoder');
const OkPacket = require('./class/ok-packet');
const StateChange = require('../const/state-change');
const Collations = require('../const/collations');

// Set of field names that are reserved for internal use
const privateFields = new Set([
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  '__proto__'
]);

/**
 * Handle COM_QUERY / COM_STMT_EXECUTE results
 * @see https://mariadb.com/kb/en/library/4-server-response-packets/
 */
class Parser extends Command {
  /**
   * Create a new Parser instance
   *
   * @param {Function} resolve - Promise resolve function
   * @param {Function} reject - Promise reject function
   * @param {Object} connOpts - Connection options
   * @param {Object} cmdParam - Command parameters
   */
  constructor(resolve, reject, connOpts, cmdParam) {
    super(cmdParam, resolve, reject);
    this._responseIndex = 0;
    this._rows = [];
    this.opts = cmdParam.opts ? Object.assign({}, connOpts, cmdParam.opts) : connOpts;
    this.sql = cmdParam.sql;
    this.initialValues = cmdParam.values;
    this.canSkipMeta = false;
  }

  /**
   * Read Query response packet.
   * Packet can be:
   * - a result-set
   * - an ERR_Packet
   * - an OK_Packet
   * - LOCAL_INFILE Packet
   *
   * @param {Object} packet - Query response packet
   * @param {Object} out - Output writer
   * @param {Object} opts - Connection options
   * @param {Object} info - Connection info
   * @returns {Function|null} Next packet handler or null
   */
  readResponsePacket(packet, out, opts, info) {
    switch (packet.peek()) {
      case 0x00: // OK response
        return this.readOKPacket(packet, out, opts, info);

      case 0xff: // ERROR response
        return this.handleErrorPacket(packet, info);

      case 0xfb: // LOCAL INFILE response
        return this.readLocalInfile(packet, out, opts, info);

      default: // Result set
        return this.readResultSet(packet, info);
    }
  }

  /**
   * Handle error packet
   *
   * @param {Object} packet - Error packet
   * @param {Object} info - Connection info
   * @returns {null} Always returns null
   * @private
   */
  handleErrorPacket(packet, info) {
    // In case of timeout, free accumulated rows
    this._columns = null;

    const err = packet.readError(info, this.opts.logParam ? this.displaySql() : this.sql, this.cmdParam.stack);

    // Force in transaction status, since query will have created a transaction if autocommit is off
    // Goal is to avoid unnecessary COMMIT/ROLLBACK
    info.status |= ServerStatus.STATUS_IN_TRANS;

    return this.throwError(err, info);
  }

  /**
   * Read result-set packets
   * @see https://mariadb.com/kb/en/library/resultset/
   *
   * @param {Object} packet - Column count packet
   * @param {Object} info - Connection information
   * @returns {Function} Next packet handler
   */
  readResultSet(packet, info) {
    this._columnCount = packet.readUnsignedLength();

    this._rows.push([]);
    if (this.canSkipMeta && info.serverPermitSkipMeta && packet.readUInt8() === 0) {
      // Command supports skipping meta
      // Server permits it
      // And tells that no columns follow, using prepare results
      return this.handleSkippedMeta(info);
    }

    this._columns = [];
    return (this.onPacketReceive = this.readColumn);
  }

  /**
   * Handle skipped metadata case
   *
   * @param {Object} info - Connection information
   * @returns {Function} Next packet handler
   * @private
   */
  handleSkippedMeta(info) {
    this._columns = this.prepare.columns;
    this._columnCount = this._columns.length;
    this.emit('fields', this._columns);
    this.setParser();
    return (this.onPacketReceive = info.eofDeprecated ? this.readResultSetRow : this.readIntermediateEOF);
  }

  /**
   * Read OK_Packet
   * @see https://mariadb.com/kb/en/library/ok_packet/
   *
   * @param {Object} packet - OK_Packet
   * @param {Object} out - Output writer
   * @param {Object} opts - Connection options
   * @param {Object} info - Connection information
   * @returns {Function|null} Next packet handler or null
   */
  readOKPacket(packet, out, opts, info) {
    packet.skip(1); // Skip header

    const affectedRows = packet.readUnsignedLength();

    // Handle insertId based on options
    let insertId = this.processInsertId(packet.readInsertId(), info);
    info.status = packet.readUInt16();

    const okPacket = new OkPacket(affectedRows, insertId, packet.readUInt16());
    let mustRedirect = false;

    // Process session state changes if present
    if (info.status & ServerStatus.SESSION_STATE_CHANGED) {
      mustRedirect = this.processSessionStateChanges(packet, info, opts);
    }

    // Handle streaming case
    if (this.inStream) {
      this.handleNewRows(okPacket);
    }

    // Handle redirection
    if (mustRedirect) {
      return null; // Redirection is handled asynchronously
    }

    if (
      info.redirectRequest &&
      (info.status & ServerStatus.STATUS_IN_TRANS) === 0 &&
      (info.status & ServerStatus.MORE_RESULTS_EXISTS) === 0
    ) {
      info.redirect(info.redirectRequest, this.okPacketSuccess.bind(this, okPacket, info));
    } else {
      this.okPacketSuccess(okPacket, info);
    }

    return null;
  }

  /**
   * Process insertId based on connection options
   *
   * @param {BigInt} insertId - Raw insertId from packet
   * @param {Object} info - Connection info
   * @returns {BigInt|Number|String} Processed insertId
   * @private
   */
  processInsertId(insertId, info) {
    if (this.opts.supportBigNumbers || this.opts.insertIdAsNumber) {
      if (this.opts.insertIdAsNumber && this.opts.checkNumberRange && !Number.isSafeInteger(Number(insertId))) {
        this.onPacketReceive = info.status & ServerStatus.MORE_RESULTS_EXISTS ? this.readResponsePacket : null;
        this.throwUnexpectedError(
          `last insert id value ${insertId} can't safely be converted to number`,
          false,
          info,
          '42000',
          Errors.ER_PARSING_PRECISION
        );
        return insertId;
      }

      if (this.opts.supportBigNumbers && (this.opts.bigNumberStrings || !Number.isSafeInteger(Number(insertId)))) {
        return insertId.toString();
      } else {
        return Number(insertId);
      }
    }

    return insertId;
  }

  /**
   * Process session state changes
   *
   * @param {Object} packet - Packet containing session state changes
   * @param {Object} info - Connection information
   * @param {Object} opts - Connection options
   * @returns {Boolean} True if redirection is needed
   * @private
   */
  processSessionStateChanges(packet, info, opts) {
    let mustRedirect = false;
    packet.skipLengthCodedNumber();

    while (packet.remaining()) {
      const len = packet.readUnsignedLength();
      if (len > 0) {
        const subPacket = packet.subPacketLengthEncoded(len);
        while (subPacket.remaining()) {
          const type = subPacket.readUInt8();
          switch (type) {
            case StateChange.SESSION_TRACK_SYSTEM_VARIABLES:
              mustRedirect = this.processSystemVariables(subPacket, info, opts) || mustRedirect;
              break;

            case StateChange.SESSION_TRACK_SCHEMA:
              info.database = this.readSchemaChange(subPacket);
              break;
          }
        }
      }
    }

    return mustRedirect;
  }

  /**
   * Process system variables changes
   *
   * @param {Object} subPacket - Packet containing system variables
   * @param {Object} info - Connection information
   * @param {Object} opts - Connection options
   * @returns {Boolean} True if redirection is needed
   * @private
   */
  processSystemVariables(subPacket, info, opts) {
    let mustRedirect = false;
    let subSubPacket;

    do {
      subSubPacket = subPacket.subPacketLengthEncoded(subPacket.readUnsignedLength());
      const variable = subSubPacket.readStringLengthEncoded();
      const value = subSubPacket.readStringLengthEncoded();

      switch (variable) {
        case 'character_set_client':
          info.collation = Collations.fromCharset(value);
          if (info.collation === undefined) {
            this.throwError(new Error(`unknown charset: '${value}'`), info);
            return false;
          }
          opts.emit('collation', info.collation);
          break;

        case 'redirect_url':
          if (value !== '') {
            mustRedirect = true;
            info.redirect(value, this.okPacketSuccess.bind(this, this.okPacket, info));
          }
          break;

        case 'connection_id':
          info.threadId = parseInt(value);
          break;
      }
    } while (subSubPacket.remaining() > 0);

    return mustRedirect;
  }

  /**
   * Read schema change from packet
   *
   * @param {Object} subPacket - Packet containing schema change
   * @returns {String} New schema name
   * @private
   */
  readSchemaChange(subPacket) {
    const subSubPacket = subPacket.subPacketLengthEncoded(subPacket.readUnsignedLength());
    return subSubPacket.readStringLengthEncoded();
  }

  /**
   * Handle OK packet success
   *
   * @param {Object} okPacket - OK packet
   * @param {Object} info - Connection information
   */
  okPacketSuccess(okPacket, info) {
    if (this._responseIndex === 0) {
      // Fast path for standard single result
      if (info.status & ServerStatus.MORE_RESULTS_EXISTS) {
        this._rows.push(okPacket);
        this._responseIndex++;
        return (this.onPacketReceive = this.readResponsePacket);
      }
      return this.success(this.opts.metaAsArray ? [okPacket, []] : okPacket);
    }

    this._rows.push(okPacket);

    if (info.status & ServerStatus.MORE_RESULTS_EXISTS) {
      this._responseIndex++;
      return (this.onPacketReceive = this.readResponsePacket);
    }

    if (this.opts.metaAsArray) {
      if (!this._meta) {
        this._meta = new Array(this._responseIndex);
      }
      this._meta[this._responseIndex] = null;
      this.success([this._rows, this._meta]);
    } else {
      this.success(this._rows);
    }
  }

  /**
   * Complete query with success
   *
   * @param {*} val - Result value
   */
  success(val) {
    this.successEnd(val);
    this._columns = null;
    this._rows = [];
  }

  /**
   * Read column information metadata
   * @see https://mariadb.com/kb/en/library/resultset/#column-definition-packet
   *
   * @param {Object} packet - Column definition packet
   * @param {Object} out - Output writer
   * @param {Object} opts - Connection options
   * @param {Object} info - Connection information
   */
  readColumn(packet, out, opts, info) {
    this._columns.push(new ColumnDefinition(packet, info, this.opts.rowsAsArray));

    // Last column
    if (this._columns.length === this._columnCount) {
      this.setParser();

      if (this.canSkipMeta && info.serverPermitSkipMeta && this.prepare != null) {
        // Server can skip meta, but have force sending it.
        // Metadata have changed, updating prepare result accordingly
        if (this._responseIndex === 0) this.prepare.columns = this._columns;
      }

      this.emit('fields', this._columns);
      this.onPacketReceive = info.eofDeprecated ? this.readResultSetRow : this.readIntermediateEOF;
    }
  }

  /**
   * Set up row parsers based on column information
   */
  setParser() {
    this._parseFunction = new Array(this._columnCount);

    if (this.opts.typeCast) {
      for (let i = 0; i < this._columnCount; i++) {
        this._parseFunction[i] = this.readCastValue.bind(this, this._columns[i]);
      }
    } else {
      const dataParser = this.binary ? BinaryDecoder.parser : TextDecoder.parser;
      for (let i = 0; i < this._columnCount; i++) {
        this._parseFunction[i] = dataParser(this._columns[i], this.opts);
      }
    }

    if (this.opts.rowsAsArray) {
      this.parseRow = this.parseRowAsArray;
    } else {
      this.tableHeader = new Array(this._columnCount);
      this.parseRow = this.binary ? this.parseRowStdBinary : this.parseRowStdText;

      if (this.opts.nestTables) {
        this.configureNestedTables();
      } else {
        for (let i = 0; i < this._columnCount; i++) {
          this.tableHeader[i] = this._columns[i].name();
        }
        this.checkDuplicates();
      }
    }
  }

  /**
   * Configure nested tables format
   * @private
   */
  configureNestedTables() {
    if (typeof this.opts.nestTables === 'string') {
      for (let i = 0; i < this._columnCount; i++) {
        this.tableHeader[i] = this._columns[i].table() + this.opts.nestTables + this._columns[i].name();
      }
      this.checkDuplicates();
    } else if (this.opts.nestTables === true) {
      this.parseRow = this.parseRowNested;
      for (let i = 0; i < this._columnCount; i++) {
        this.tableHeader[i] = [this._columns[i].table(), this._columns[i].name()];
      }
      this.checkNestTablesDuplicatesAndPrivateFields();
    }
  }

  /**
   * Check for duplicate column names
   */
  checkDuplicates() {
    if (this.opts.checkDuplicate) {
      for (let i = 0; i < this._columnCount; i++) {
        if (this.tableHeader.indexOf(this.tableHeader[i], i + 1) > 0) {
          const dupes = this.tableHeader.reduce(
            (acc, v, i, arr) => (arr.indexOf(v) !== i && acc.indexOf(v) === -1 ? acc.concat(v) : acc),
            []
          );
          this.throwUnexpectedError(
            `Error in results, duplicate field name \`${dupes[0]}\`.\n(see option \`checkDuplicate\`)`,
            false,
            null,
            '42000',
            Errors.ER_DUPLICATE_FIELD
          );
        }
      }
    }
  }

  /**
   * Check for duplicates and private fields in nested tables
   */
  checkNestTablesDuplicatesAndPrivateFields() {
    if (this.opts.checkDuplicate) {
      for (let i = 0; i < this._columnCount; i++) {
        for (let j = 0; j < i; j++) {
          if (this.tableHeader[j][0] === this.tableHeader[i][0] && this.tableHeader[j][1] === this.tableHeader[i][1]) {
            this.throwUnexpectedError(
              `Error in results, duplicate field name \`${this.tableHeader[i][0]}\`.\`${this.tableHeader[i][1]}\`\n(see option \`checkDuplicate\`)`,
              false,
              null,
              '42000',
              Errors.ER_DUPLICATE_FIELD
            );
          }
        }
      }
    }

    for (let i = 0; i < this._columnCount; i++) {
      if (privateFields.has(this.tableHeader[i][0])) {
        this.throwUnexpectedError(
          `Use of \`${this.tableHeader[i][0]}\` is not permitted with option \`nestTables\``,
          false,
          null,
          '42000',
          Errors.ER_PRIVATE_FIELDS_USE
        );

        // Continue parsing results to keep connection state
        // but without assigning possible dangerous value
        this.parseRow = () => {
          return {};
        };
      }
    }
  }

  /**
   * Read intermediate EOF
   * Only for server before MariaDB 10.2 / MySQL 5.7 that doesn't have CLIENT_DEPRECATE_EOF capability
   * @see https://mariadb.com/kb/en/library/eof_packet/
   *
   * @param {Object} packet - EOF Packet
   * @param {Object} out - Output writer
   * @param {Object} opts - Connection options
   * @param {Object} info - Connection information
   * @returns {Function|null} Next packet handler or null
   */
  readIntermediateEOF(packet, out, opts, info) {
    if (packet.peek() !== 0xfe) {
      return this.throwNewError('Error in protocol, expected EOF packet', true, info, '42000', Errors.ER_EOF_EXPECTED);
    }

    // Before MySQL 5.7.5, last EOF doesn't contain the good flag SERVER_MORE_RESULTS_EXISTS
    // for OUT parameters. It must be checked here
    // (5.7.5 does have the CLIENT_DEPRECATE_EOF capability, so this packet is not even sent)
    packet.skip(3);
    info.status = packet.readUInt16();
    this.isOutParameter = info.status & ServerStatus.PS_OUT_PARAMS;
    return (this.onPacketReceive = this.readResultSetRow);
  }

  /**
   * Add new rows to the result set
   *
   * @param {Object} row - Row data
   */
  handleNewRows(row) {
    this._rows[this._responseIndex].push(row);
  }

  /**
   * Check if packet is result-set end = EOF of OK_Packet with EOF header according to CLIENT_DEPRECATE_EOF capability
   * or a result-set row
   *
   * @param packet    current packet
   * @param out       output writer
   * @param opts      connection options
   * @param info      connection information
   * @returns {*}
   */
  readResultSetRow(packet, out, opts, info) {
    if (packet.peek() >= 0xfe) {
      if (packet.peek() === 0xff) {
        //force in transaction status, since query will have created a transaction if autocommit is off
        //goal is to avoid unnecessary COMMIT/ROLLBACK.
        info.status |= ServerStatus.STATUS_IN_TRANS;
        return this.throwError(
          packet.readError(info, this.opts.logParam ? this.displaySql() : this.sql, this.cmdParam.err),
          info
        );
      }

      if ((!info.eofDeprecated && packet.length() < 13) || (info.eofDeprecated && packet.length() < 0xffffff)) {
        if (!info.eofDeprecated) {
          packet.skip(3);
          info.status = packet.readUInt16();
        } else {
          packet.skip(1); //skip header
          packet.skipLengthCodedNumber(); //skip update count
          packet.skipLengthCodedNumber(); //skip insert id
          info.status = packet.readUInt16();
        }

        if (
          info.redirectRequest &&
          (info.status & ServerStatus.STATUS_IN_TRANS) === 0 &&
          (info.status & ServerStatus.MORE_RESULTS_EXISTS) === 0
        ) {
          info.redirect(info.redirectRequest, this.resultSetEndingPacketResult.bind(this, info));
        } else {
          this.resultSetEndingPacketResult(info);
        }
        return;
      }
    }

    this.handleNewRows(this.parseRow(packet));
  }

  resultSetEndingPacketResult(info) {
    if (this.opts.metaAsArray) {
      //return promise object as array :
      // example for SELECT 1 =>
      // [
      //   [ {"1": 1} ],      //rows
      //   [ColumnDefinition] //meta
      // ]

      if (info.status & ServerStatus.MORE_RESULTS_EXISTS || this.isOutParameter) {
        if (!this._meta) this._meta = [];
        this._meta[this._responseIndex] = this._columns;
        this._responseIndex++;
        return (this.onPacketReceive = this.readResponsePacket);
      }
      if (this._responseIndex === 0) {
        this.success([this._rows[0], this._columns]);
      } else {
        if (!this._meta) this._meta = [];
        this._meta[this._responseIndex] = this._columns;
        this.success([this._rows, this._meta]);
      }
    } else {
      //return promise object as rows that have meta property :
      // example for SELECT 1 =>
      // [
      //   {"1": 1},
      //   meta: [ColumnDefinition]
      // ]
      Object.defineProperty(this._rows[this._responseIndex], 'meta', {
        value: this._columns,
        writable: true,
        enumerable: this.opts.metaEnumerable
      });

      if (info.status & ServerStatus.MORE_RESULTS_EXISTS || this.isOutParameter) {
        this._responseIndex++;
        return (this.onPacketReceive = this.readResponsePacket);
      }
      this.success(this._responseIndex === 0 ? this._rows[0] : this._rows);
    }
  }

  /**
   * Display current SQL with parameters (truncated if too big)
   *
   * @returns {string}
   */
  displaySql() {
    if (this.opts && this.initialValues) {
      if (this.sql.length > this.opts.debugLen) {
        return this.sql.substring(0, this.opts.debugLen) + '...';
      }

      let sqlMsg = this.sql + ' - parameters:';
      return Parser.logParameters(this.opts, sqlMsg, this.initialValues);
    }
    if (this.sql.length > this.opts.debugLen) {
      return this.sql.substring(0, this.opts.debugLen) + '... - parameters:[]';
    }
    return this.sql + ' - parameters:[]';
  }

  static logParameters(opts, sqlMsg, values) {
    if (opts.namedPlaceholders) {
      sqlMsg += '{';
      let first = true;
      for (let key in values) {
        if (first) {
          first = false;
        } else {
          sqlMsg += ',';
        }
        sqlMsg += "'" + key + "':";
        let param = values[key];
        sqlMsg = Parser.logParam(sqlMsg, param);
        if (sqlMsg.length > opts.debugLen) {
          return sqlMsg.substring(0, opts.debugLen) + '...';
        }
      }
      sqlMsg += '}';
    } else {
      sqlMsg += '[';
      if (Array.isArray(values)) {
        for (let i = 0; i < values.length; i++) {
          if (i !== 0) sqlMsg += ',';
          let param = values[i];
          sqlMsg = Parser.logParam(sqlMsg, param);
          if (sqlMsg.length > opts.debugLen) {
            return sqlMsg.substring(0, opts.debugLen) + '...';
          }
        }
      } else {
        sqlMsg = Parser.logParam(sqlMsg, values);
        if (sqlMsg.length > opts.debugLen) {
          return sqlMsg.substring(0, opts.debugLen) + '...';
        }
      }
      sqlMsg += ']';
    }
    return sqlMsg;
  }

  parseRowAsArray(packet) {
    const row = new Array(this._columnCount);
    const nullBitMap = this.binary ? BinaryDecoder.newRow(packet, this._columns) : null;
    for (let i = 0; i < this._columnCount; i++) {
      row[i] = this._parseFunction[i](packet, this.opts, this.unexpectedError, nullBitMap, i);
    }
    return row;
  }

  parseRowNested(packet) {
    const row = {};
    const nullBitMap = this.binary ? BinaryDecoder.newRow(packet, this._columns) : null;
    for (let i = 0; i < this._columnCount; i++) {
      if (!row[this.tableHeader[i][0]]) row[this.tableHeader[i][0]] = {};
      row[this.tableHeader[i][0]][this.tableHeader[i][1]] = this._parseFunction[i](
        packet,
        this.opts,
        this.unexpectedError,
        nullBitMap,
        i
      );
    }
    return row;
  }

  parseRowStdText(packet) {
    const row = {};
    for (let i = 0; i < this._columnCount; i++) {
      row[this.tableHeader[i]] = this._parseFunction[i](packet, this.opts, this.unexpectedError);
    }
    return row;
  }

  parseRowStdBinary(packet) {
    const nullBitMap = BinaryDecoder.newRow(packet, this._columns);
    const row = {};
    for (let i = 0; i < this._columnCount; i++) {
      row[this.tableHeader[i]] = this._parseFunction[i](packet, this.opts, this.unexpectedError, nullBitMap, i);
    }
    return row;
  }

  readCastValue(column, packet, opts, unexpectedError, nullBitmap, index) {
    if (this.binary) {
      BinaryDecoder.castWrapper(column, packet, opts, nullBitmap, index);
    } else {
      TextDecoder.castWrapper(column, packet, opts, nullBitmap, index);
    }
    const dataParser = this.binary ? BinaryDecoder.parser : TextDecoder.parser;
    return opts.typeCast(column, dataParser(column, opts).bind(null, packet, opts, unexpectedError, nullBitmap, index));
  }

  readLocalInfile(packet, out, opts, info) {
    packet.skip(1); //skip header
    out.startPacket(this);

    const fileName = packet.readStringRemaining();

    if (!Parse.validateFileName(this.sql, this.initialValues, fileName)) {
      out.writeEmptyPacket();
      const error = Errors.createError(
        "LOCAL INFILE wrong filename. '" +
          fileName +
          "' doesn't correspond to query " +
          this.sql +
          '. Query cancelled. Check for malicious server / proxy',
        Errors.ER_LOCAL_INFILE_WRONG_FILENAME,
        info,
        'HY000',
        this.sql
      );
      process.nextTick(this.reject, error);
      this.reject = null;
      this.resolve = null;
      return (this.onPacketReceive = this.readResponsePacket);
    }

    // this.sequenceNo = 2;
    // this.compressSequenceNo = 2;
    let stream;
    try {
      stream = this.opts.infileStreamFactory ? this.opts.infileStreamFactory(fileName) : fs.createReadStream(fileName);
    } catch (e) {
      out.writeEmptyPacket();
      const error = Errors.createError(
        `LOCAL INFILE infileStreamFactory failed`,
        Errors.ER_LOCAL_INFILE_NOT_READABLE,
        info,
        '22000',
        this.opts.logParam ? this.displaySql() : this.sql
      );
      error.cause = e;
      process.nextTick(this.reject, error);
      this.reject = null;
      this.resolve = null;
      return (this.onPacketReceive = this.readResponsePacket);
    }

    stream.on(
      'error',
      function (err) {
        out.writeEmptyPacket();
        const error = Errors.createError(
          `LOCAL INFILE command failed: ${err.message}`,
          Errors.ER_LOCAL_INFILE_NOT_READABLE,
          info,
          '22000',
          this.sql
        );
        process.nextTick(this.reject, error);
        this.reject = null;
        this.resolve = null;
      }.bind(this)
    );
    stream.on('data', (chunk) => {
      out.writeBuffer(chunk, 0, chunk.length);
    });
    stream.on('end', () => {
      if (!out.isEmpty()) {
        out.flushBuffer(false);
      }
      out.writeEmptyPacket();
    });
    this.onPacketReceive = this.readResponsePacket;
  }

  static logParam(sqlMsg, param) {
    if (param == null) {
      sqlMsg += param === undefined ? 'undefined' : 'null';
    } else {
      switch (param.constructor.name) {
        case 'Buffer':
          sqlMsg += '0x' + param.toString('hex', 0, Math.min(1024, param.length)) + '';
          break;

        case 'String':
          sqlMsg += "'" + param + "'";
          break;

        case 'Date':
          sqlMsg += getStringDate(param);
          break;

        case 'Object':
          sqlMsg += JSON.stringify(param);
          break;

        default:
          sqlMsg += param.toString();
      }
    }
    return sqlMsg;
  }
}

function getStringDate(param) {
  return (
    "'" +
    ('00' + (param.getMonth() + 1)).slice(-2) +
    '/' +
    ('00' + param.getDate()).slice(-2) +
    '/' +
    param.getFullYear() +
    ' ' +
    ('00' + param.getHours()).slice(-2) +
    ':' +
    ('00' + param.getMinutes()).slice(-2) +
    ':' +
    ('00' + param.getSeconds()).slice(-2) +
    '.' +
    ('000' + param.getMilliseconds()).slice(-3) +
    "'"
  );
}

module.exports = Parser;
