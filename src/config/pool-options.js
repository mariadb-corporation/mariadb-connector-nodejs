"use strict";

class PoolOptions {
  constructor(opts) {
    this.acquireTimeout = opts.acquireTimeout === undefined ? 10000 : opts.acquireTimeout;
    this.waitForConnections =
      opts.waitForConnections === undefined ? true : opts.waitForConnections;
    this.connectionLimit = opts.connectionLimit === undefined ? 10000 : opts.connectionLimit;
    this.queueLimit = opts.queueLimit === undefined ? 10000 : opts.queueLimit;
  }
}

module.exports = PoolOptions;
