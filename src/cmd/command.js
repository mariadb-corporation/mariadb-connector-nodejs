"use strict";

const EventEmitter = require("events");

/**
 * Default command interface.
 */
class Command extends EventEmitter {
  constructor(connEvents) {
    super();
    this.sequenceNo = 0;
    this.compressSequenceNo = 0;
    this.connEvents = connEvents;
    this.onPacketReceive = this.start;
  }

  init(out, opts, info) {
    this.onPacketReceive = this.start(out, opts, info);
  }

  start(out, opts, info) {
    return null;
  }

  forceSequenceNo(sequenceNo) {
    this.sequenceNo = sequenceNo;
  }

  checkSequenceNo(numPackets) {
    if (this.sequenceNo % 256 !== numPackets) {
      console.error(
        "packets order received error. sequence is " +
          numPackets +
          ", expected " +
          this.sequenceNo % 256
      );
      this.sequenceNo = numPackets + 1;
      return;
    }
    this.sequenceNo += 1;
  }

  checkCompressSequenceNo(numPackets) {
    if (this.compressSequenceNo % 256 !== numPackets) {
      console.error(
        "compress packets order received error. sequence is " +
          numPackets +
          ", expected " +
          this.compressSequenceNo % 256
      );
    }
    this.compressSequenceNo += 1;
  }

  incrementCompressSequenceNo(numPackets) {
    this.compressSequenceNo += numPackets;
    this.compressSequenceNo %= 256;
  }

  incrementSequenceNo(numPackets) {
    this.sequenceNo += numPackets;
    this.sequenceNo %= 256;
  }

  incrementCompressSequenceNo(numPackets) {
    this.compressSequenceNo += numPackets;
    this.compressSequenceNo %= 256;
  }

  displaySql() {}

  throwError(err) {
    if (this.onResult) {
      process.nextTick(this.onResult, err);
    } else {
      this.emit("error", err);
    }
    this.onPacketReceive = null;
    this.emit("end");
  }

  handle(packet, out, opts, info) {
    this.onPacketReceive = this.onPacketReceive(packet, out, opts, info);
    return this.onPacketReceive !== null;
  }
}

module.exports = Command;
