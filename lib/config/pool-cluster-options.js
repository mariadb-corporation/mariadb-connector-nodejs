'use strict';

class PoolClusterOptions {
  constructor(opts) {
    if (opts) {
      this.canRetry = opts.canRetry === undefined ? true : opts.canRetry;
      this.removeNodeErrorCount = opts.removeNodeErrorCount || 5;
      this.restoreNodeTimeout = opts.restoreNodeTimeout || 0;
      this.defaultSelector = opts.defaultSelector || 'RR';
    } else {
      this.canRetry = true;
      this.removeNodeErrorCount = 5;
      this.restoreNodeTimeout = 0;
      this.defaultSelector = 'RR';
    }
  }
}

module.exports = PoolClusterOptions;
