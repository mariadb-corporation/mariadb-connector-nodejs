"use strict";

const EventEmitter = require("events");
const Errors = require("../misc/errors");

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
    this.emit("end");
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
    this.emit("end", err);
  }

  successEnd(val) {
    this.onPacketReceive = null;
    this.reject = null;
    process.nextTick(this.resolve, val);
    this.resolve = null;
    this.emit("end");
  }
}

module.exports = Command;
