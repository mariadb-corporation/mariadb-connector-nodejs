'use strict';

class ClusterOptions {
  constructor(opts) {
    if (opts) {
      this.canRetry = opts.canRetry === undefined ? true : opts.canRetry;
      this.removeNodeErrorCount = opts.removeNodeErrorCount || Infinity;
      this.restoreNodeTimeout = opts.restoreNodeTimeout || 1000;
      this.defaultSelector = opts.defaultSelector || 'RR';
    } else {
      this.canRetry = true;
      this.removeNodeErrorCount = Infinity;
      this.restoreNodeTimeout = 1000;
      this.defaultSelector = 'RR';
    }
  }
}

module.exports = ClusterOptions;
