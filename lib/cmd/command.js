'use strict';

const EventEmitter = require('events');
const Errors = require('../misc/errors');
const ServerStatus = require('../const/server-status');
const StateChange = require('../const/state-change');
const Collations = require('../const/collations');

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

  displaySql() {}

  throwNewError(msg, fatal, info, sqlState, errno) {
    process.nextTick(
      this.reject,
      Errors.createError(msg, fatal, info, sqlState, errno, this.stack, false)
    );
    this.onPacketReceive = null;
    this.resolve = null;
    this.reject = null;
    this.emit('end');
  }

  throwError(err, info) {
    if (this.stack) {
      err = Errors.createError(
        err.message,
        err.fatal,
        info,
        err.sqlState,
        err.errno,
        this.stack,
        false
      );
    }
    this.onPacketReceive = null;
    this.resolve = null;
    process.nextTick(this.reject, err);
    this.reject = null;
    this.emit('end', err);
  }

  successEnd(val) {
    this.onPacketReceive = null;
    this.reject = null;
    process.nextTick(this.resolve, val);
    this.resolve = null;
    this.emit('end');
  }

  static parseOkPacket(packet, out, opts, info) {
    packet.skip(1); //skip header

    const affectedRows = packet.readUnsignedLength();
    const insertIds = packet.readSignedLength();

    info.status = packet.readUInt16();

    const rs = {
      affectedRows: affectedRows,
      insertId: insertIds,
      warningStatus: packet.readUInt16()
    };

    if (info.status & ServerStatus.SESSION_STATE_CHANGED) {
      packet.skipLengthCodedNumber();
      while (packet.remaining()) {
        const subPacket = packet.subPacketLengthEncoded();
        while (subPacket.remaining()) {
          const type = subPacket.readUInt8();
          switch (type) {
            case StateChange.SESSION_TRACK_SYSTEM_VARIABLES:
              const subSubPacket = subPacket.subPacketLengthEncoded();
              const variable = subSubPacket.readStringLength();
              const value = subSubPacket.readStringLength();

              switch (variable) {
                case 'character_set_client':
                  opts.collation = Collations.fromCharset(value);
                  if (opts.collation === undefined) {
                    this.throwError(new Error("unknown charset : '" + value + "'"), info);
                    return;
                  }
                  opts.emit('collation', opts.collation);
                  break;

                default:
                //variable not used by driver
              }
              break;

            case StateChange.SESSION_TRACK_SCHEMA:
              const subSubPacket2 = subPacket.subPacketLengthEncoded();
              info.database = subSubPacket2.readStringLength();
              break;
          }
        }
      }
    }

    return rs;
  }
}

module.exports = Command;
