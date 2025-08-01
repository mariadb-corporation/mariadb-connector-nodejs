//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import EventEmitter from 'node:events';
import * as Errors from '../misc/errors.js';

/**
 * Default command interface.
 */
class Command extends EventEmitter {
  constructor(cmdParam, resolve, reject) {
    super();
    this.cmdParam = cmdParam;
    this.sequenceNo = -1;
    this.compressSequenceNo = -1;
    this.resolve = resolve;
    this.reject = reject;
    this.sending = false;
    this.unexpectedError = this.throwUnexpectedError.bind(this);
  }

  displaySql() {
    return null;
  }

  /**
   * Throw an unexpected error.
   * server exchange will still be read to keep the connection in a good state, but the promise will be rejected.
   *
   * @param msg message
   * @param fatal is error fatal for connection
   * @param info current server state information
   * @param sqlState error sqlState
   * @param errno error number
   */
  throwUnexpectedError(msg, fatal, info, sqlState, errno) {
    const err = Errors.createError(
      msg,
      errno,
      info,
      sqlState,
      this.opts && this.opts.logParam ? this.displaySql() : this.sql,
      fatal,
      this.cmdParam ? this.cmdParam.stack : null,
      false
    );
    if (this.reject) {
      process.nextTick(this.reject, err);
      this.resolve = null;
      this.reject = null;
    }
    return err;
  }

  /**
   * Create and throw new Error from error information
   * only first called throwing an error or successfully end will be executed.
   *
   * @param msg message
   * @param fatal is error fatal for connection
   * @param info current server state information
   * @param sqlState error sqlState
   * @param errno error number
   */
  throwNewError(msg, fatal, info, sqlState, errno) {
    this.onPacketReceive = null;
    const err = this.throwUnexpectedError(msg, fatal, info, sqlState, errno);
    this.emit('end');
    return err;
  }

  /**
   * When command cannot be sent due to an error.
   * (this is only on the start command)
   *
   * @param msg error message
   * @param errno error number
   * @param info connection information
   */
  sendCancelled(msg, errno, info) {
    const err = Errors.createError(msg, errno, info, 'HY000', this.opts.logParam ? this.displaySql() : this.sql);
    this.emit('send_end');
    this.throwError(err, info);
  }

  /**
   * Throw Error
   *  only first call throw an error or the successful end will be executed.
   *
   * @param err error to be thrown
   * @param info current server state information
   */
  throwError(err, info) {
    this.onPacketReceive = null;
    if (this.reject) {
      if (this.cmdParam && this.cmdParam.stack) {
        err = Errors.createError(
          err.text ? err.text : err.message,
          err.errno,
          info,
          err.sqlState,
          err.sql,
          err.fatal,
          this.cmdParam.stack,
          false
        );
      }
      this.resolve = null;
      process.nextTick(this.reject, err);
      this.reject = null;
    }
    this.emit('end', err);
  }

  /**
   * Successfully end command.
   * only the first call throwing an error or successful end will be executed.
   *
   * @param val return value.
   */
  successEnd(val) {
    this.onPacketReceive = null;
    if (this.resolve) {
      this.reject = null;
      process.nextTick(this.resolve, val);
      this.resolve = null;
    }
    this.emit('end');
  }
}

export default Command;
