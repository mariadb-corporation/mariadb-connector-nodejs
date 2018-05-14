"use strict";

class PoolClusterOptions {
  constructor(opts) {
    this.canRetry = opts.canRetry === undefined ? true : opts.canRetry;
    this.removeNodeErrorCount = opts.removeNodeErrorCount || 5;
    this.restoreNodeTimeout = opts.restoreNodeTimeout || 0;
    this.defaultSelector = opts.defaultSelector || "RR";
  }
}

module.exports = PoolClusterOptions;
