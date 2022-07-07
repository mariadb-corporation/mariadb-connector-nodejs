'use strict';

const Command = require('./command');
const ServerStatus = require('../const/server-status');
const ColumnDefinition = require('./column-definition');
const Errors = require('../misc/errors');
const fs = require('fs');
const Parse = require('../misc/parse');
const BinaryDecoder = require('./decoder/binary-decoder');
const TextDecoder = require('./decoder/text-decoder');

/**
 * handle COM_QUERY / COM_STMT_EXECUTE results
 * see : https://mariadb.com/kb/en/library/4-server-response-packets/
 */
class Parser extends Command {
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
   * packet can be :
   * - a result-set
   * - an ERR_Packet
   * - a OK_Packet
   * - LOCAL_INFILE Packet
   *
   * @param packet  query response
   * @param out     output writer
   * @param opts    connection options
   * @param info    connection info
   */
  readResponsePacket(packet, out, opts, info) {
    switch (packet.peek()) {
      //*********************************************************************************************************
      //* OK response
      //*********************************************************************************************************
      case 0x00:
        return this.readOKPacket(packet, out, opts, info);

      //*********************************************************************************************************
      //* ERROR response
      //*********************************************************************************************************
      case 0xff:
        const err = packet.readError(info, this.displaySql(), this.stack);
        //force in transaction status, since query will have created a transaction if autocommit is off
        //goal is to avoid unnecessary COMMIT/ROLLBACK.
        info.status |= ServerStatus.STATUS_IN_TRANS;
        return this.throwError(err, info);

      //*********************************************************************************************************
      //* LOCAL INFILE response
      //*********************************************************************************************************
      case 0xfb:
        return this.readLocalInfile(packet, out, opts, info);

      //*********************************************************************************************************
      //* Parser
      //*********************************************************************************************************
      default:
        return this.readResultSet(packet, info);
    }
  }

  /**
   * Read result-set packets :
   * see https://mariadb.com/kb/en/library/resultset/
   *
   * @param packet    Column count packet
   * @param info      current connection information
   * @returns {Parser.readColumn} next packet handler
   */
  readResultSet(packet, info) {
    this._columnCount = packet.readUnsignedLength();

    this._rows.push([]);
    if (this.canSkipMeta && info.serverPermitSkipMeta && packet.readUInt8() === 0) {
      // command support skipping meta
      // server permits it
      // and tells that no columns follows, using prepare results
      this._columns = this.prepare.columns;
      this.setParser();
      return (this.onPacketReceive = info.eofDeprecated ? this.readResultSetRow : this.readIntermediateEOF);
    }

    this._columns = [];
    this.onPacketReceive = this.readColumn;
  }

  /**
   * Read OK_Packet.
   * see https://mariadb.com/kb/en/library/ok_packet/
   *
   * @param packet    OK_Packet
   * @param opts      connection options
   * @param info      connection information
   * @param out       output writer
   * @returns {*}     null or {Resultset.readResponsePacket} in case of multi-result-set
   */
  readOKPacket(packet, out, opts, info) {
    try {
      const okPacket = this.parseOkPacket(packet, out, this.opts, opts, info);
      this._rows.push(okPacket);

      if (info.status & ServerStatus.MORE_RESULTS_EXISTS) {
        this._responseIndex++;
        return (this.onPacketReceive = this.readResponsePacket);
      }
      this.success(this._responseIndex === 0 ? this._rows[0] : this._rows);
    } catch (e) {
      this.onPacketReceive = info.status & ServerStatus.MORE_RESULTS_EXISTS ? this.readResponsePacket : null;
      this.throwUnexpectedError(e.message, false, info, '42000', Errors.ER_PARSING_PRECISION);
      return null;
    }
  }

  /**
   * Read COM_STMT_PREPARE response Packet.
   * see https://mariadb.com/kb/en/library/com_stmt_prepare/#com_stmt_prepare-response
   *
   * @param packet    COM_STMT_PREPARE_OK packet
   * @param opts      connection options
   * @param info      connection information
   * @param out       output writer
   * @returns {*}     null or {Resultset.readResponsePacket} in case of multi-result-set
   */
  readPrepareResultPacket(packet, out, opts, info) {
    switch (packet.peek()) {
      //*********************************************************************************************************
      //* OK response
      //*********************************************************************************************************
      case 0x00:
        packet.skip(1); //skip header
        this.statementId = packet.readInt32();
        this.columnNo = packet.readUInt16();
        this.parameterNo = packet.readUInt16();
        this._parameterPrepare = [];
        this._columnsPrepare = [];
        if (this.parameterNo > 0) return (this.onPacketReceive = this.readPrepareParameterPacket);
        if (this.columnNo > 0) return (this.onPacketReceive = this.readPrepareColumnsPacket);
        return this.successPrepare(info, opts);

      //*********************************************************************************************************
      //* ERROR response
      //*********************************************************************************************************
      case 0xff:
        const err = packet.readError(info, this.displaySql(), this.stack);
        //force in transaction status, since query will have created a transaction if autocommit is off
        //goal is to avoid unnecessary COMMIT/ROLLBACK.
        info.status |= ServerStatus.STATUS_IN_TRANS;
        this.onPacketReceive = this.readResponsePacket;
        return this.throwError(err, info);

      //*********************************************************************************************************
      //* Unexpected response
      //*********************************************************************************************************
      default:
        info.status |= ServerStatus.STATUS_IN_TRANS;
        this.onPacketReceive = this.readResponsePacket;
        return this.throwError(Errors.ER_UNEXPECTED_PACKET, info);
    }
  }

  readPrepareColumnsPacket(packet, out, opts, info) {
    this.columnNo--;
    this._columnsPrepare.push(new ColumnDefinition(packet, info, opts.rowsAsArray));
    if (this.columnNo === 0) {
      if (info.eofDeprecated) {
        return this.successPrepare(info, opts);
      }
      return (this.onPacketReceive = this.skipEofPacket);
    }
  }

  skipEofPacket(packet, out, opts, info) {
    if (this.columnNo > 0) return (this.onPacketReceive = this.readPrepareColumnsPacket);
    return this.successPrepare(info, opts);
  }

  readPrepareParameterPacket(packet, out, opts, info) {
    this.parameterNo--;
    this._parameterPrepare.push(new ColumnDefinition(packet, info));
    if (this.parameterNo === 0) {
      if (info.eofDeprecated) {
        if (this.columnNo > 0) return (this.onPacketReceive = this.readPrepareColumnsPacket);
        return this.successPrepare(info, opts);
      }
      return (this.onPacketReceive = this.skipEofPacket);
    }
  }

  success(val) {
    this.successEnd(val);
    this._columns = null;
    this._rows = null;
  }

  /**
   * Read column information metadata
   * see https://mariadb.com/kb/en/library/resultset/#column-definition-packet
   *
   * @param packet    column definition packet
   * @param out       output writer
   * @param opts      connection options
   * @param info      connection information
   * @returns {*}
   */
  readColumn(packet, out, opts, info) {
    this._columns.push(new ColumnDefinition(packet, info, this.opts.rowsAsArray));

    // last column
    if (this._columns.length === this._columnCount) {
      this.setParser();
      if (this.canSkipMeta && info.serverPermitSkipMeta && this.prepare != null) {
        // server can skip meta, but have force sending it.
        // metadata have changed, updating prepare result accordingly
        this.prepare.columns = this._columns;
      }
      this.emit('fields', this._columns);

      return (this.onPacketReceive = info.eofDeprecated ? this.readResultSetRow : this.readIntermediateEOF);
    }
  }

  setParser() {
    this._parseFonction = new Array(this._columnCount);
    if (this.opts.typeCast) {
      for (let i = 0; i < this._columnCount; i++) {
        this._parseFonction[i] = this.readCastValue.bind(this);
      }
    } else {
      const dataParser = this.binary ? BinaryDecoder.parser : TextDecoder.parser;
      for (let i = 0; i < this._columnCount; i++) {
        this._parseFonction[i] = dataParser(this._columns[i], this.opts);
      }
    }

    if (this.opts.rowsAsArray) {
      this.parseRow = this.parseRowAsArray;
    } else {
      this.tableHeader = new Array(this._columnCount);
      this.parseRow = this.binary ? this.parseRowStdBinary : this.parseRowStdText;
      if (this.opts.nestTables) {
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
          this.checkNestTablesDuplicates();
        }
      } else {
        for (let i = 0; i < this._columnCount; i++) {
          this.tableHeader[i] = this._columns[i].name();
        }
        this.checkDuplicates();
      }
    }
  }

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

  checkNestTablesDuplicates() {
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
  }

  /**
   * Read intermediate EOF.
   * _only for server before MariaDB 10.2 / MySQL 5.7 that doesn't have CLIENT_DEPRECATE_EOF capability_
   * see https://mariadb.com/kb/en/library/eof_packet/
   *
   * @param packet    EOF Packet
   * @param out       output writer
   * @param opts      connection options
   * @param info      connection information
   * @returns {*}
   */
  readIntermediateEOF(packet, out, opts, info) {
    if (packet.peek() !== 0xfe) {
      return this.throwNewError('Error in protocol, expected EOF packet', true, info, '42000', Errors.ER_EOF_EXPECTED);
    }

    //before MySQL 5.7.5, last EOF doesn't contain the good flag SERVER_MORE_RESULTS_EXISTS
    //for OUT parameters. It must be checked here
    //(5.7.5 does have the CLIENT_DEPRECATE_EOF capability, so this packet in not even send)
    packet.skip(3);
    info.status = packet.readUInt16();
    this.isOutParameter = info.status & ServerStatus.PS_OUT_PARAMS;
    this.onPacketReceive = this.readResultSetRow;
  }

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
        return this.throwError(packet.readError(info, this.displaySql(), this.stack), info);
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

        if (opts.metaAsArray) {
          //return promise object as array :
          // example for SELECT 1 =>
          // [
          //   [ {"1": 1} ],      //rows
          //   [ColumnDefinition] //meta
          // ]
          if (!this._meta) {
            this._meta = new Array(this._responseIndex);
          }

          this._meta[this._responseIndex] = this._columns;

          if (info.status & ServerStatus.MORE_RESULTS_EXISTS || this.isOutParameter) {
            this._responseIndex++;
            return (this.onPacketReceive = this.readResponsePacket);
          }
          this.success(this._responseIndex === 0 ? [this._rows[0], this._meta[0]] : [this._rows, this._meta]);
        } else {
          //return promise object as rows that have meta property :
          // example for SELECT 1 =>
          // [
          //   {"1": 1},
          //   meta: [ColumnDefinition]
          // ]
          this._rows[this._responseIndex].meta = this._columns;
          if (info.status & ServerStatus.MORE_RESULTS_EXISTS || this.isOutParameter) {
            this._responseIndex++;
            return (this.onPacketReceive = this.readResponsePacket);
          }
          this.success(this._responseIndex === 0 ? this._rows[0] : this._rows);
        }

        return;
      }
    }

    this.handleNewRows(this.parseRow(this._columns, packet));
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
      return this.logParameters(sqlMsg, this.initialValues);
    }
    return this.sql + ' - parameters:[]';
  }

  logParameters(sqlMsg, values) {
    if (this.opts.namedPlaceholders) {
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
        if (sqlMsg.length > this.opts.debugLen) {
          sqlMsg = sqlMsg.substr(0, this.opts.debugLen) + '...';
          break;
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
          if (sqlMsg.length > this.opts.debugLen) {
            sqlMsg = sqlMsg.substr(0, this.opts.debugLen) + '...';
            break;
          }
        }
      } else {
        sqlMsg = Parser.logParam(sqlMsg, values);
        if (sqlMsg.length > this.opts.debugLen) {
          sqlMsg = sqlMsg.substr(0, this.opts.debugLen) + '...';
        }
      }
      sqlMsg += ']';
    }
    return sqlMsg;
  }

  parseRowAsArray(columns, packet) {
    const row = new Array(this._columnCount);
    const nullBitMap = this.binary ? BinaryDecoder.newRow(packet, columns) : null;
    for (let i = 0; i < this._columnCount; i++) {
      row[i] = this._parseFonction[i].call(null, columns[i], packet, i, nullBitMap, this.opts, this.unexpectedError);
    }
    return row;
  }

  parseRowNested(columns, packet) {
    const row = {};
    const nullBitMap = this.binary ? BinaryDecoder.newRow(packet, columns) : null;
    for (let i = 0; i < this._columnCount; i++) {
      if (!row[this.tableHeader[i][0]]) row[this.tableHeader[i][0]] = {};
      row[this.tableHeader[i][0]][this.tableHeader[i][1]] = this._parseFonction[i].call(
        null,
        columns[i],
        packet,
        i,
        nullBitMap,
        this.opts,
        this.unexpectedError
      );
    }
    return row;
  }

  parseRowStdText(columns, packet) {
    const row = {};
    for (let i = 0; i < this._columnCount; i++) {
      row[this.tableHeader[i]] = this._parseFonction[i](columns[i], packet, i, null, this.opts, this.unexpectedError);
    }
    return row;
  }

  parseRowStdBinary(columns, packet) {
    const row = {};
    const nullBitMap = BinaryDecoder.newRow(packet, columns);
    for (let i = 0; i < this._columnCount; i++) {
      row[this.tableHeader[i]] = this._parseFonction[i].call(
        null,
        columns[i],
        packet,
        i,
        nullBitMap,
        this.opts,
        this.unexpectedError
      );
    }
    return row;
  }

  readCastValue(column, packet, index, nullBitmap, opts) {
    if (this.binary) {
      BinaryDecoder.castWrapper(column, packet, index, nullBitmap, opts);
    } else {
      TextDecoder.castWrapper(column, packet, index, nullBitmap, opts);
    }
    const dataParser = this.binary ? BinaryDecoder.parser : TextDecoder.parser;
    return opts.typeCast(
      column,
      dataParser(column, opts).bind(null, column, packet, index, nullBitmap, opts, this.unexpectedError)
    );
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
    const stream = fs.createReadStream(fileName);
    stream.on('error', (err) => {
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
    });
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
    if (param === undefined || param === null) {
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
