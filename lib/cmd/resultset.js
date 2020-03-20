'use strict';

const Command = require('./command');
const ServerStatus = require('../const/server-status');
const ColumnDefinition = require('./column-definition');
const Errors = require('../misc/errors');
const fs = require('fs');
const Parse = require('../misc/parse');

/**
 * handle COM_QUERY / COM_STMT_EXECUTE results
 * see : https://mariadb.com/kb/en/library/4-server-response-packets/
 */
class ResultSet extends Command {
  constructor(resolve, reject) {
    super(resolve, reject);
    this._responseIndex = 0;
    this._rows = [];
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
      //* ResultSet
      //*********************************************************************************************************
      default:
        return this.readResultSet(packet);
    }
  }

  /**
   * Read result-set packets :
   * see https://mariadb.com/kb/en/library/resultset/
   *
   * @param packet    Column count packet
   * @returns {ResultSet.readColumn} next packet handler
   */
  readResultSet(packet) {
    this._columnCount = packet.readUnsignedLength();
    this._getValue = this.opts.typeCast ? this.readCastValue : this.readRowData;
    this._rows.push([]);
    this._columns = [];

    this.onPacketReceive = this.readColumn;
  }

  /**
   * Assign global configuration option used by result-set to current query option.
   * a little faster than Object.assign() since doest copy all information
   *
   * @param connOpts  connection global configuration
   * @param cmdOpts   specific command options
   */
  configAssign(connOpts, cmdOpts) {
    if (!cmdOpts) {
      this.opts = connOpts;
      return;
    }
    this.opts = {
      timeout: cmdOpts.timeout,
      checkDuplicate:
        cmdOpts.checkDuplicate != undefined ? cmdOpts.checkDuplicate : connOpts.checkDuplicate,
      typeCast: cmdOpts.typeCast != undefined ? cmdOpts.typeCast : connOpts.typeCast,
      rowsAsArray: cmdOpts.rowsAsArray != undefined ? cmdOpts.rowsAsArray : connOpts.rowsAsArray,
      nestTables: cmdOpts.nestTables != undefined ? cmdOpts.nestTables : connOpts.nestTables,
      dateStrings: cmdOpts.dateStrings != undefined ? cmdOpts.dateStrings : connOpts.dateStrings,
      tz: cmdOpts.tz != undefined ? cmdOpts.tz : connOpts.tz,
      localTz: cmdOpts.localTz != undefined ? cmdOpts.localTz : connOpts.localTz,
      namedPlaceholders:
        cmdOpts.namedPlaceholders != undefined
          ? cmdOpts.namedPlaceholders
          : connOpts.namedPlaceholders,
      maxAllowedPacket:
        cmdOpts.maxAllowedPacket != undefined
          ? cmdOpts.maxAllowedPacket
          : connOpts.maxAllowedPacket,
      supportBigNumbers:
        cmdOpts.supportBigNumbers != undefined
          ? cmdOpts.supportBigNumbers
          : connOpts.supportBigNumbers,
      permitSetMultiParamEntries:
        cmdOpts.permitSetMultiParamEntries != undefined
          ? cmdOpts.permitSetMultiParamEntries
          : connOpts.permitSetMultiParamEntries,
      bigNumberStrings:
        cmdOpts.bigNumberStrings != undefined ? cmdOpts.bigNumberStrings : connOpts.bigNumberStrings
    };
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
    const rs = Command.parseOkPacket(packet, out, opts, info);
    this._rows.push(rs);

    if (info.status & ServerStatus.MORE_RESULTS_EXISTS) {
      this._responseIndex++;
      return (this.onPacketReceive = this.readResponsePacket);
    }
    this.success(this._responseIndex === 0 ? this._rows[0] : this._rows);
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

        if (this.columnNo > 0) return (this.onPacketReceive = this.skipColumnsPacket);
        if (this.parameterNo > 0) return (this.onPacketReceive = this.skipParameterPacket);
        return this.success();

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

  skipColumnsPacket(packet, out, opts, info) {
    this.columnNo--;
    if (this.columnNo === 0) {
      if (info.eofDeprecated) {
        if (this.parameterNo > 0) return (this.onPacketReceive = this.skipParameterPacket);
        this.success();
      }
      return (this.onPacketReceive = this.skipEofPacket);
    }
  }

  skipEofPacket(packet, out, opts, info) {
    if (this.parameterNo > 0) return (this.onPacketReceive = this.skipParameterPacket);
    this.success();
  }

  skipParameterPacket(packet, out, opts, info) {
    this.parameterNo--;
    if (this.parameterNo === 0) {
      if (info.eofDeprecated) return this.success();
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
    if (this._columns.length !== this._columnCount) {
      const column = ColumnDefinition.parseColumn(packet);
      this._columns.push(column);
    }

    // last column
    if (this._columns.length === this._columnCount) {
      if (this.opts.rowsAsArray) {
        this.parseRow = this.parseRowAsArray;
      } else {
        this.tableHeader = new Array(this._columnCount);
        if (this.opts.nestTables) {
          this.parseRow = this.parseRowStd;
          if (typeof this.opts.nestTables === 'string') {
            for (let i = 0; i < this._columnCount; i++) {
              this.tableHeader[i] =
                this._columns[i].table() + this.opts.nestTables + this._columns[i].name();
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
          this.parseRow = this.parseRowStd;
          for (let i = 0; i < this._columnCount; i++) {
            this.tableHeader[i] = this._columns[i].name();
          }
          this.checkDuplicates();
        }
      }

      this.emit('fields', this._columns);

      return (this.onPacketReceive = info.eofDeprecated
        ? this.readResultSetRow
        : this.readIntermediateEOF);
    }
  }

  checkDuplicates() {
    if (this.opts.checkDuplicate) {
      for (let i = 0; i < this._columnCount; i++) {
        if (this.tableHeader.indexOf(this.tableHeader[i], i + 1) > 0) {
          const dupes = this.tableHeader.reduce(
            (acc, v, i, arr) =>
              arr.indexOf(v) !== i && acc.indexOf(v) === -1 ? acc.concat(v) : acc,
            []
          );
          this.throwUnexpectedError(
            'Error in results, duplicate field name `' + dupes[0] + '`',
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
          if (
            this.tableHeader[j][0] === this.tableHeader[i][0] &&
            this.tableHeader[j][1] === this.tableHeader[i][1]
          ) {
            this.throwUnexpectedError(
              'Error in results, duplicate field name `' +
                this.tableHeader[i][0] +
                '`.`' +
                this.tableHeader[i][1] +
                '`',
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
      return this.throwNewError(
        'Error in protocol, expected EOF packet',
        true,
        info,
        '42000',
        Errors.ER_EOF_EXPECTED
      );
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
        const err = packet.readError(info, this.displaySql(), this.stack);
        //force in transaction status, since query will have created a transaction if autocommit is off
        //goal is to avoid unnecessary COMMIT/ROLLBACK.
        info.status |= ServerStatus.STATUS_IN_TRANS;
        return this.throwError(err, info);
      }

      if (
        (!info.eofDeprecated && packet.length() < 13) ||
        (info.eofDeprecated && packet.length() < 0xffffff)
      ) {
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
          if (this._responseIndex === 0) this._meta = [];
          this._meta[this._responseIndex] = this._columns;

          if (info.status & ServerStatus.MORE_RESULTS_EXISTS || this.isOutParameter) {
            this._responseIndex++;
            return (this.onPacketReceive = this.readResponsePacket);
          }
          this.success(
            this._responseIndex === 0 ? [this._rows[0], this._meta[0]] : [this._rows, this._meta]
          );
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

    const row = this.parseRow(this._columns, packet, opts);
    this.handleNewRows(row);
  }

  /**
   * Display current SQL with parameters (truncated if too big)
   *
   * @returns {string}
   */
  displaySql() {
    if (this.opts && this.initialValues) {
      if (this.sql.length > this.opts.debugLen) {
        return 'sql: ' + this.sql.substring(0, this.opts.debugLen) + '...';
      }

      let sqlMsg = 'sql: ' + this.sql + ' - parameters:';
      return this.logParameters(sqlMsg, this.initialValues);
    }
    return 'sql: ' + this.sql + ' - parameters:[]';
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
        sqlMsg = ResultSet.logParam(sqlMsg, param);
        if (sqlMsg.length > this.opts.debugLen) {
          sqlMsg = sqlMsg.substr(0, this.opts.debugLen) + '...';
          break;
        }
      }
      sqlMsg += '}';
    } else {
      sqlMsg += '[';
      for (let i = 0; i < values.length; i++) {
        if (i !== 0) sqlMsg += ',';
        let param = values[i];
        sqlMsg = ResultSet.logParam(sqlMsg, param);
        if (sqlMsg.length > this.opts.debugLen) {
          sqlMsg = sqlMsg.substr(0, this.opts.debugLen) + '...';
          break;
        }
      }
      sqlMsg += ']';
    }
    return sqlMsg;
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
        false,
        info,
        '45034',
        Errors.ER_LOCAL_INFILE_WRONG_FILENAME
      );

      process.nextTick(this.reject, error);
      this.reject = null;
      this.resolve = null;
      return (this.onPacketReceive = this.readResponsePacket);
    }

    // this.sequenceNo = 2;
    // this.compressSequenceNo = 2;
    const stream = fs.createReadStream(fileName);
    stream.on('error', err => {
      out.writeEmptyPacket();
      const error = Errors.createError(
        'LOCAL INFILE command failed: ' + err.message,
        false,
        info,
        '22000',
        Errors.ER_LOCAL_INFILE_NOT_READABLE
      );
      process.nextTick(this.reject, error);
      this.reject = null;
      this.resolve = null;
    });
    stream.on('data', chunk => {
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

module.exports = ResultSet;
