//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

let ConnOptions = require('./connection-options');

class PoolOptions {
  constructor(opts) {
    if (typeof opts === 'string') {
      opts = ConnOptions.parse(opts);

      // Set data type
      // These conversions will be replaced with explicit type casting in the main assignment below
      if (opts.acquireTimeout) opts.acquireTimeout = parseInt(opts.acquireTimeout);
      if (opts.connectionLimit) opts.connectionLimit = parseInt(opts.connectionLimit);
      if (opts.idleTimeout) opts.idleTimeout = parseInt(opts.idleTimeout);
      if (opts.leakDetectionTimeout) opts.leakDetectionTimeout = parseInt(opts.leakDetectionTimeout);
      if (opts.initializationTimeout) opts.initializationTimeout = parseInt(opts.initializationTimeout);
      if (opts.minDelayValidation) opts.minDelayValidation = parseInt(opts.minDelayValidation);
      if (opts.minimumIdle) opts.minimumIdle = parseInt(opts.minimumIdle);
      if (opts.noControlAfterUse) opts.noControlAfterUse = opts.noControlAfterUse === 'true';
      if (opts.resetAfterUse) opts.resetAfterUse = opts.resetAfterUse === 'true';
      if (opts.pingTimeout) opts.pingTimeout = parseInt(opts.pingTimeout);
    }

    // Apply explicit type conversion for all numeric options
    this.acquireTimeout = opts.acquireTimeout === undefined ? 10000 : Number(opts.acquireTimeout);
    this.connectionLimit = opts.connectionLimit === undefined ? 10 : Number(opts.connectionLimit);
    this.idleTimeout = opts.idleTimeout === undefined ? 1800 : Number(opts.idleTimeout);
    this.leakDetectionTimeout = Number(opts.leakDetectionTimeout) || 0;
    this.initializationTimeout =
      opts.initializationTimeout === undefined
        ? Math.max(100, this.acquireTimeout - 100)
        : Number(opts.initializationTimeout);
    this.minDelayValidation = opts.minDelayValidation === undefined ? 500 : Number(opts.minDelayValidation);
    this.minimumIdle =
      opts.minimumIdle === undefined ? this.connectionLimit : Math.min(Number(opts.minimumIdle), this.connectionLimit);

    // Apply explicit type conversion for boolean options
    this.noControlAfterUse = Boolean(opts.noControlAfterUse) || false;
    this.resetAfterUse = Boolean(opts.resetAfterUse) || false;
    this.pingTimeout = Number(opts.pingTimeout) || 250;

    // Create connection options
    this.connOptions = new ConnOptions(opts);

    // Adjust connectTimeout if acquireTimeout is smaller
    if (this.acquireTimeout > 0 && this.connOptions.connectTimeout > this.acquireTimeout) {
      this.connOptions.connectTimeout = this.acquireTimeout;
    }
  }
}

module.exports = PoolOptions;
