"use strict";

const EventEmitter = require("events");

/**
 * Default command interface.
 */
class Command extends EventEmitter {
  constructor(connEvents) {
    super();
    this.sequenceNo = 0;
    this.connEvents = connEvents;
  }

  init(out, opts, info) {
    this.onPacketReceive = this.start(out, opts, info);
  }

  start(out, opts, info) {
    return null;
  }

  incrementSequenceNo(numPackets) {
    this.sequenceNo += numPackets;
    this.sequenceNo %= 256;
  }

  displaySql() {}

  throwError(err) {
    if (this.onResult) {
      process.nextTick(this.onResult, err);
    } else {
      this.emit("error", err);
    }
    if (err.fatal) this.connEvents.emit("server_error", err);
    this.emit("end");
    this.onPacketReceive = null;
  }

  handle(packet, out, opts, info) {
    this.onPacketReceive = this.onPacketReceive(packet, out, opts, info);
  }
}

module.exports = Command;
