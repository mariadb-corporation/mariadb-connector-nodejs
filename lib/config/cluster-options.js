//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

class ClusterOptions {
  constructor(opts) {
    if (opts) {
      this.canRetry = opts.canRetry === undefined ? true : Boolean(opts.canRetry);
      this.removeNodeErrorCount =
        opts.removeNodeErrorCount === undefined ? Number.POSITIVE_INFINITY : Number(opts.removeNodeErrorCount);
      this.restoreNodeTimeout = opts.restoreNodeTimeout === undefined ? 1000 : Number(opts.restoreNodeTimeout);
      this.defaultSelector = opts.defaultSelector || 'RR';
    } else {
      this.canRetry = true;
      this.removeNodeErrorCount = Number.POSITIVE_INFINITY;
      this.restoreNodeTimeout = 1000;
      this.defaultSelector = 'RR';
    }
  }
}

module.exports = ClusterOptions;
