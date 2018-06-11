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
  }

  init(out, opts, info) {
    this.onPacketReceive = this.start(out, opts, info);
  }

  start(out, opts, info) {
    return null;
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
    this.emit("error", err);
    process.nextTick(this.reject, err);
    this.onPacketReceive = null;
    this.resolve = null;
    this.reject = null;
    this.emit("end");
  }

  successEnd(val) {
    process.nextTick(this.resolve, val);
    this.onPacketReceive = null;
    this.resolve = null;
    this.reject = null;
    this.emit("end");
  }
}

module.exports = Command;
