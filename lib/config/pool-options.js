"use strict";

let ConnOptions = require("./connection-options");

class PoolOptions {
  constructor(opts) {
    this.acquireTimeout = opts.acquireTimeout === undefined ? 10000 : opts.acquireTimeout;
    this.waitForConnections =
      opts.waitForConnections === undefined ? true : opts.waitForConnections;
    this.connectionLimit = opts.connectionLimit === undefined ? 10000 : opts.connectionLimit;
    this.queueLimit = opts.queueLimit === undefined ? 10000 : opts.queueLimit;
    this.minDelayValidation = opts.minDelayValidation === undefined ? 250 : opts.minDelayValidation;

    this.connOptions = new ConnOptions(opts);

    if (this.acquireTimeout > 0 && this.connOptions.connectTimeout > this.acquireTimeout) {
      this.connOptions.connectTimeout = this.acquireTimeout;
    }
  }
}

module.exports = PoolOptions;
