"use strict";

const Command = require("./command");
const ServerStatus = require("../const/server-status");
const StateChange = require("../const/state-change");
const Collations = require("../const/collations.js");
const ColumnDefinition = require("./column-definition");
const Utils = require("../misc/utils");

/**
 * handle COM_QUERY / COM_STMT_EXECUTE results
 * see : https://mariadb.com/kb/en/library/4-server-response-packets/
 */
class ResultSet extends Command {
  constructor(connEvents) {
    super(connEvents);
    this._responseIndex = 0;
    this._columns = [];
    this._rows = [];
  }

  /**
   * Read Query response packet.
   * packet can be :
   * - a result-set
   * - an ERR_Packet
   * - a OK_Packet
   * - LOCAL_INFILE Packet (TODO)
   *
   * @param packet  query response
   * @param out     output writer
   * @param opts    connection options
   * @param info    connection info
   * @returns {*}   next packet handler
   */
  readResponsePacket(packet, out, opts, info) {
    switch (packet.peek()) {
      //*********************************************************************************************************
      //* OK response
      //*********************************************************************************************************
      case 0x00:
        return this.readOKPacket(packet, opts, info);

      //*********************************************************************************************************
      //* ERROR response
      //*********************************************************************************************************
      case 0xff:
        const err = packet.readError(info, this.displaySql());

        //force in transaction status, since query will have created a transaction if autocommit is off
        //goal is to avoid unnecessary COMMIT/ROLLBACK.
        info.status |= ServerStatus.STATUS_IN_TRANS;

        this.throwError(err);
        return null;

      //*********************************************************************************************************
      //* LOCAL INFILE response
      //*********************************************************************************************************
      case 0xfb:
        //TODO read local infile
        return null;

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
    this._receivedColumnsCount = 0;
    this._rows.push([]);
    this._columns.push([]);
    return this.readColumn;
  }

  /**
   * Assign global configuration option used by result-set to current query option.
   * a little faster than Object.assign() since doest copy all information
   *
   * @param connOpts  connection global configuration
   * @param opt       current options
   */
  configAssign(connOpts, opt) {
    if (!opt) {
      this.opts = connOpts;
      return;
    }
    this.opts.rowsAsArray = opt.rowsAsArray ? opt.rowsAsArray : connOpts.rowsAsArray;
    this.opts.nestTables = opt.nestTables ? opt.nestTables : connOpts.nestTables;
    this.opts.stringifyObjects = opt.stringifyObjects
      ? opt.stringifyObjects
      : connOpts.stringifyObjects;
    this.opts.timezone = opt.timezone ? opt.timezone : connOpts.timezone;
    this.opts.decimalNumbers = opt.decimalNumbers ? opt.decimalNumbers : connOpts.decimalNumbers;
    this.opts.dateStrings = opt.dateStrings ? opt.dateStrings : connOpts.dateStrings;
    this.opts.supportBigNumbers = opt.supportBigNumbers
      ? opt.supportBigNumbers
      : connOpts.supportBigNumbers;
    this.opts.bigNumberStrings = opt.bigNumberStrings
      ? opt.bigNumberStrings
      : connOpts.bigNumberStrings;
  }

  /**
   * Read OK_Packet.
   * see https://mariadb.com/kb/en/library/ok_packet/
   *
   * @param packet    OK_Packet
   * @param opts      connection options
   * @param info      connection information
   * @returns {*}     null or {Resultset.readResponsePacket} in case of multi-result-set
   */
  readOKPacket(packet, opts, info) {
    packet.skip(1); //skip header
    let rs = new ChangeResult(packet.readUnsignedLength(), packet.readSignedLength());

    info.status = packet.readUInt16();
    rs.warningStatus = packet.readUInt16();

    if (info.status & ServerStatus.SESSION_STATE_CHANGED) {
      packet.skipLengthCodedNumber();
      while (packet.remaining()) {
        const subPacket = packet.subPacketLengthEncoded();
        while (subPacket.remaining()) {
          const type = subPacket.readUInt8();
          switch (type) {
            case StateChange.SESSION_TRACK_SYSTEM_VARIABLES:
              const subSubPacket = subPacket.subPacketLengthEncoded();
              const variable = subSubPacket.readStringLengthEncoded(opts.collation.encoding);
              const value = subSubPacket.readStringLengthEncoded(opts.collation.encoding);

              switch (variable) {
                case "character_set_client":
                  opts.collation = Collations.fromEncoding(value);
                  this.connEvents.emit("collation_changed");
                  break;

                default:
                //variable not used by driver
              }
              break;

            case StateChange.SESSION_TRACK_SCHEMA:
              const subSubPacket2 = subPacket.subPacketLengthEncoded();
              info.database = subSubPacket2.readStringLengthEncoded(opts.collation.encoding);
              break;
          }
        }
      }
    }

    this._rows.push(rs);
    this._columns.push(undefined);

    this.emit("fields", void 0);
    this.emit("result", rs);

    if (info.status & ServerStatus.MORE_RESULTS_EXISTS) {
      this._responseIndex++;
      return this.readResponsePacket;
    }
    this.responseCallback();
    return null;
  }

  /**
   * Return response to client according if callback
   */
  responseCallback() {
    if (this.onResult) {
      let rows, columns;
      if (this._responseIndex === 0) {
        rows = this._rows[0];
        columns = this._columns[0];
      } else {
        rows = this._rows;
        columns = this._columns;
      }

      if (columns) {
        process.nextTick(this.onResult, null, rows, columns);
      } else {
        process.nextTick(this.onResult, null, rows);
      }
    }

    this.emit("end");
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
    this._receivedColumnsCount++;

    if (this._columns[this._responseIndex].length !== this._columnCount) {
      const column = new ColumnDefinition(packet, opts.collation.encoding);
      this._columns[this._responseIndex].push(column);
    }

    // last column received
    if (this._receivedColumnsCount === this._columnCount) {
      const columns = this._columns[this._responseIndex];
      this.emit("fields", columns);

      if (!this.opts.rowsAsArray) {
        this.tableHeader = [columns.length];
        if (typeof this.opts.nestTables === "string") {
          for (let i = 0; i < columns.length; i++) {
            this.tableHeader[i] = columns[i].table + this.opts.nestTables + columns[i].name;
          }
        } else if (this.opts.nestTables === true) {
          for (let i = 0; i < columns.length; i++) {
            this.tableHeader[i] = [columns[i].table, columns[i].name];
          }
        } else if (!this.opts.rowsAsArray) {
          for (let i = 0; i < columns.length; i++) {
            this.tableHeader[i] = columns[i].name;
          }
        }
      }

      return info.eofDeprecated ? this.readResultSetRow : this.readIntermediateEOF;
    }
    return this.readColumn;
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
    if (packet.peek() != 0xfe) {
      return this.throwError(
        Utils.createError("Error in protocol, expected EOF packet", true, info)
      );
    }

    //before MySQL 5.7.5, last EOF doesn't contain the good flag SERVER_MORE_RESULTS_EXISTS
    //for OUT parameters. It must be checked here
    //(5.7.5 does have the CLIENT_DEPRECATE_EOF capability, so this packet in not even send)
    packet.skip(3);
    info.status = packet.readUInt16();
    this.isOutParameter = info.status & ServerStatus.PS_OUT_PARAMS;

    return this.readResultSetRow;
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
    if (
      packet.peek() === 0xfe &&
      ((!info.eofDeprecated && packet.length() < 13) ||
        (info.eofDeprecated && packet.length() < 0xffffff))
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

      if (info.status & ServerStatus.MORE_RESULTS_EXISTS || this.isOutParameter) {
        this._responseIndex++;
        return this.readResponsePacket;
      }
      this.responseCallback();
      return null;
    }

    const row = this.parseRow(this._columns[this._responseIndex], packet);

    if (this.onResult) {
      this._rows[this._responseIndex].push(row);
    } else {
      this.emit("result", row);
    }

    return this.readResultSetRow;
  }

  /**
   * Display current SQL with parameters (truncated if too big)
   *
   * @returns {string}
   */
  displaySql() {
    if (this.opts && this.initialValues) {
      if (this.sql.length > 1024) {
        return "sql: " + this.sql.substring(0, 1024) + "...";
      }

      let sqlMsg = "sql: " + this.sql + " - parameters:";

      if (this.opts.namedPlaceholders) {
        sqlMsg += "{";
        let first = true;
        for (let key in this.initialValues) {
          if (first) {
            first = false;
          } else {
            sqlMsg += ",";
          }
          sqlMsg += "'" + key + "':";
          let param = this.initialValues[key];
          sqlMsg = logParam(sqlMsg, param);
          if (sqlMsg.length > 1024) {
            sqlMsg += "...";
            break;
          }
        }
        sqlMsg += "}";
      } else {
        const values = Array.isArray(this.initialValues)
          ? this.initialValues
          : [this.initialValues];
        sqlMsg += "[";
        for (let i = 0; i < values.length; i++) {
          if (i !== 0) sqlMsg += ",";
          let param = values[i];
          sqlMsg = logParam(sqlMsg, param);
          if (sqlMsg.length > 1024) {
            sqlMsg += "...";
            break;
          }
        }
        sqlMsg += "]";
      }

      return sqlMsg;
    }

    return "sql: " + this.sql + " - parameters:[]";
  }
}

function logParam(sqlMsg, param) {
  if (!param) {
    sqlMsg += param === undefined ? "undefined" : "null";
  } else if (param.constructor.name) {
    switch (param.constructor.name) {
      case "Buffer":
        sqlMsg += "0x" + param.toString("hex", 0, Math.floor(1024, param.length)) + "";
        break;

      case "String":
        sqlMsg += "'" + param + "'";
        break;

      case "Date":
        sqlMsg += getStringDate(param);
        break;

      default:
        sqlMsg += param.toString();
    }
  } else {
    sqlMsg += param.toString();
  }
  return sqlMsg;
}

function getStringDate(param) {
  return (
    "'" +
    ("00" + (param.getMonth() + 1)).slice(-2) +
    "/" +
    ("00" + param.getDate()).slice(-2) +
    "/" +
    param.getFullYear() +
    " " +
    ("00" + param.getHours()).slice(-2) +
    ":" +
    ("00" + param.getMinutes()).slice(-2) +
    ":" +
    ("00" + param.getSeconds()).slice(-2) +
    "." +
    ("000" + param.getMilliseconds()).slice(-3) +
    "'"
  );
}

/**
 * Object to store insert/update/delete results
 *
 * @param affectedRows  number of affected rows
 * @param insertId      insert ids.
 * @constructor
 */
function ChangeResult(affectedRows, insertId) {
  this.affectedRows = affectedRows;
  this.insertId = insertId;
  this.warningStatus = 0;
}

module.exports = ResultSet;
