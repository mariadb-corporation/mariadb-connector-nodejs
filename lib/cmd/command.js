'use strict';

const EventEmitter = require('events');
const Errors = require('../misc/errors');
const ServerStatus = require('../const/server-status');
const StateChange = require('../const/state-change');
const Collations = require('../const/collations');
const OkPacket = require('./class/ok-packet');

/**
 * Default command interface.
 */
class Command extends EventEmitter {
  constructor(resolve, reject) {
    super();
    this.sequenceNo = -1;
    this.compressSequenceNo = -1;
    this.resolve = resolve;
    this.reject = reject;
    this.sending = false;
  }

  displaySql() {
    return null;
  }

  /**
   * Throw an an unexpected error.
   * server exchange will still be read to keep connection in a good state, but promise will be rejected.
   *
   * @param msg message
   * @param fatal is error fatal for connection
   * @param info current server state information
   * @param sqlState error sqlState
   * @param errno error number
   */
  throwUnexpectedError(msg, fatal, info, sqlState, errno) {
    const err = Errors.createError(msg, errno, info, sqlState, this.displaySql(), fatal, this.stack, false);
    if (this.reject) {
      process.nextTick(this.reject, err);
      this.resolve = null;
      this.reject = null;
    }
    return err;
  }

  /**
   * Create and throw new Error from error information
   * only first called throwing an error or successfully end will be executed.
   *
   * @param msg message
   * @param fatal is error fatal for connection
   * @param info current server state information
   * @param sqlState error sqlState
   * @param errno error number
   */
  throwNewError(msg, fatal, info, sqlState, errno) {
    this.onPacketReceive = null;
    const err = this.throwUnexpectedError(msg, fatal, info, sqlState, errno);
    this.emit('end');
    return err;
  }

  /**
   * Throw Error
   *  only first called throwing an error or successfully end will be executed.
   *
   * @param err error to be thrown
   * @param info current server state information
   */
  throwError(err, info) {
    this.onPacketReceive = null;
    if (this.reject) {
      if (this.stack) {
        err = Errors.createError(
          err.text ? err.text : err.message,
          err.errno,
          info,
          err.sqlState,
          err.sql,
          err.fatal,
          this.stack,
          false
        );
      }
      this.resolve = null;
      process.nextTick(this.reject, err);
      this.reject = null;
    }
    this.emit('end', err);
  }

  /**
   * Successfully end command.
   * only first called throwing an error or successfully end will be executed.
   *
   * @param val return value.
   */
  successEnd(val) {
    this.onPacketReceive = null;
    if (this.resolve) {
      this.reject = null;
      process.nextTick(this.resolve, val);
      this.resolve = null;
    }
    this.emit('end');
  }

  parseOkPacket(packet, out, opts, info) {
    packet.skip(1); //skip header

    const affectedRows = packet.readUnsignedLength();
    let insertId = packet.readSignedLengthBigInt();
    if (insertId != null && (opts.supportBigNumbers || opts.insertIdAsNumber)) {
      if (opts.supportBigNumbers && (opts.bigNumberStrings || !Number.isSafeInteger(Number(insertId)))) {
        insertId = insertId.toString();
      } else insertId = Number(insertId);
    }
    info.status = packet.readUInt16();

    const okPacket = new OkPacket(affectedRows, insertId, packet.readUInt16());

    if (info.status & ServerStatus.SESSION_STATE_CHANGED) {
      packet.skipLengthCodedNumber();
      while (packet.remaining()) {
        const subPacket = packet.subPacketLengthEncoded();
        while (subPacket.remaining()) {
          const type = subPacket.readUInt8();
          switch (type) {
            case StateChange.SESSION_TRACK_SYSTEM_VARIABLES:
              const subSubPacket = subPacket.subPacketLengthEncoded();
              const variable = subSubPacket.readStringLengthEncoded();
              const value = subSubPacket.readStringLengthEncoded();

              switch (variable) {
                case 'character_set_client':
                  info.collation = Collations.fromCharset(value);
                  if (info.collation === undefined) {
                    this.throwError(new Error("unknown charset : '" + value + "'"), info);
                    return;
                  }
                  opts.emit('collation', info.collation);
                  break;

                default:
                //variable not used by driver
              }
              break;

            case StateChange.SESSION_TRACK_SCHEMA:
              const subSubPacket2 = subPacket.subPacketLengthEncoded();
              info.database = subSubPacket2.readStringLengthEncoded();
              break;
          }
        }
      }
    }

    return okPacket;
  }
}

module.exports = Command;
