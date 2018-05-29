"use strict";

const EventEmitter = require("events");

/**
 * Default command interface.
 */
class Command extends EventEmitter {
  constructor() {
    super();
    this.sequenceNo = -1;
    this.compressSequenceNo = -1;
  }

  init(out, opts, info) {
    this.onPacketReceive = this.start(out, opts, info);
  }

  start(out, opts, info) {
    return null;
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
}

module.exports = Command;
