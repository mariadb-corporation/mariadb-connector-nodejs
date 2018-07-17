"use strict";

let ConnOptions = require("./connection-options");

class PoolOptions {
  constructor(opts) {
    this.acquireTimeout = opts.acquireTimeout === undefined ? 10000 : opts.acquireTimeout;
    this.connectionLimit = opts.connectionLimit === undefined ? 10 : opts.connectionLimit;
    this.minDelayValidation = opts.minDelayValidation === undefined ? 500 : opts.minDelayValidation;

    this.connOptions = new ConnOptions(opts);

    if (this.acquireTimeout > 0 && this.connOptions.connectTimeout > this.acquireTimeout) {
      this.connOptions.connectTimeout = this.acquireTimeout;
    }
  }
}

module.exports = PoolOptions;
