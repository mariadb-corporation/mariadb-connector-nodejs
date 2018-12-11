"use strict";

let ConnOptions = require("./connection-options");

class PoolOptions {
  constructor(opts) {
    if (typeof opts === "string") {
      opts = ConnOptions.parse(opts);

      //set data type
      if (opts.resetAfterUse) opts.resetAfterUse = opts.resetAfterUse == "true";
      if (opts.acquireTimeout) opts.acquireTimeout = parseInt(opts.acquireTimeout);
      if (opts.connectionLimit) opts.connectionLimit = parseInt(opts.connectionLimit);
      if (opts.minDelayValidation) opts.minDelayValidation = parseInt(opts.minDelayValidation);
      if (opts.noControlAfterUse) opts.noControlAfterUse = opts.noControlAfterUse == "true";
    }

    this.acquireTimeout = opts.acquireTimeout === undefined ? 10000 : opts.acquireTimeout;
    this.connectionLimit = opts.connectionLimit === undefined ? 10 : opts.connectionLimit;
    this.minDelayValidation = opts.minDelayValidation === undefined ? 500 : opts.minDelayValidation;
    this.resetAfterUse = opts.resetAfterUse === undefined ? true : opts.resetAfterUse;
    this.noControlAfterUse = opts.noControlAfterUse || false;
    this.connOptions = new ConnOptions(opts);

    if (this.acquireTimeout > 0 && this.connOptions.connectTimeout > this.acquireTimeout) {
      this.connOptions.connectTimeout = this.acquireTimeout;
    }
  }
}

module.exports = PoolOptions;
