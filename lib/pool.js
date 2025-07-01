//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

const { EventEmitter } = require('events');

const Queue = require('denque');
const Errors = require('./misc/errors');
const Utils = require('./misc/utils');
const Connection = require('./connection');

class Pool extends EventEmitter {
  opts;
  #closed = false;
  #connectionInCreation = false;
  #errorCreatingConnection = null;
  #idleConnections;
  #activeConnections = {};
  #requests = new Queue();
  #unusedConnectionRemoverId;
  #requestTimeoutId;
  #connErrorNumber = 0;
  #initialized = false;
  _managePoolSizeTask;
  _connectionCreationTask;

  constructor(options) {
    super();
    this.opts = options;
    this.#idleConnections = new Queue(null, { capacity: this.opts.connectionLimit });
    this.on('_idle', this._processNextPendingRequest);
    this.on('validateSize', this._managePoolSize);
    this._managePoolSize();
  }

  //*****************************************************************
  // pool automatic handlers
  //*****************************************************************

  /**
   * Manages pool size by creating new connections when needed
   */
  _managePoolSize() {
    // Only create new connections if conditions are met and no creation is in progress
    if (!this._shouldCreateMoreConnections() || this._managePoolSizeTask) {
      return;
    }

    this.#connectionInCreation = true;

    const timeoutEnd = Date.now() + this.opts.initializationTimeout;
    this._initiateConnectionCreation(timeoutEnd);
  }

  /**
   * Initiates connection creation with proper error handling
   * @param {number} timeoutEnd - When the connection attempt should time out
   */
  _initiateConnectionCreation(timeoutEnd) {
    this._createPoolConnection(
      // Success callback
      () => this._onConnectionCreationSuccess(),
      // Error callback
      (err) => this._onConnectionCreationError(err, timeoutEnd),
      timeoutEnd
    );
  }

  /**
   * Handles successful connection creation
   */
  _onConnectionCreationSuccess() {
    this.#initialized = true;
    this.#errorCreatingConnection = null;
    this.#connErrorNumber = 0;
    this._connectionCreationTask = null;

    // Check if we need more connections
    if (this._shouldCreateMoreConnections()) {
      this.emit('validateSize');
    }

    this._startConnectionReaping();
  }

  /**
   * Handles errors during connection creation
   * @param {Error} err - The error that occurred
   * @param {number} timeoutEnd - When the connection attempt should time out
   */
  _onConnectionCreationError(err, timeoutEnd) {
    this.#connectionInCreation = false;
    if (this.#closed) {
      return;
    }
    if (this.#errorCreatingConnection) err = this.#errorCreatingConnection;

    // Format error message based on pool state
    let error;
    if (!this.#initialized) {
      error = Errors.createError(
        `Error during pool initialization`,
        Errors.ER_POOL_NOT_INITIALIZED,
        null,
        null,
        null,
        false,
        null,
        null,
        err
      );
    } else {
      error = Errors.createError(
        `Pool fails to create connection`,
        Errors.ER_POOL_NO_CONNECTION,
        null,
        null,
        null,
        false,
        null,
        null,
        err
      );
    }

    // Schedule next attempt with exponential backoff
    const backoffTime = Math.min(++this.#connErrorNumber * 200, 10000);
    this._scheduleRetryWithBackoff(backoffTime);

    this.emit('error', error);
  }

  /**
   * Schedules the next connection creation attempt with backoff
   * @param {number} delay - Time to wait before next attempt
   */
  _scheduleRetryWithBackoff(delay) {
    if (this.#closed) {
      return;
    }
    this._managePoolSizeTask = setTimeout(() => {
      this._managePoolSizeTask = null;
      if (!this.#requests.isEmpty()) {
        this._managePoolSize();
      }
    }, delay);
  }

  /**
   * Creates a new connection for the pool with proper error handling
   * @param {Function} onSuccess - Success callback
   * @param {Function} onError - Error callback
   * @param {number} timeoutEnd - Timestamp when connection attempt should time out
   */
  _createPoolConnection(onSuccess, onError, timeoutEnd) {
    const minTimeout = timeoutEnd - Date.now();
    const connectionOpts = Object.assign({}, this.opts.connOptions, {
      connectTimeout: Math.max(1, Math.min(minTimeout, this.opts.connOptions.connectTimeout || Number.MAX_SAFE_INTEGER))
    });
    const conn = new Connection(connectionOpts);
    this._connectionCreationTask = null;
    // Use direct callback approach instead of Promise
    conn
      .connect()
      .then((conn) => this._prepareNewConnection(conn, onSuccess, onError))
      .catch((err) => this._handleConnectionCreationError(err, onSuccess, onError, timeoutEnd));
  }

  /**
   * Sets up a newly created connection for use in the pool
   * @param {Connection} conn - The new connection
   * @param {Function} onSuccess - Success callback
   * @param {Function} onError - Error callback
   */
  _prepareNewConnection(conn, onSuccess, onError) {
    // Handle pool closed during connection creation
    if (this.#closed) {
      this._cleanupConnection(conn, 'pool_closed');
      onError(
        new Errors.createFatalError(
          'Cannot create new connection to pool, pool closed',
          Errors.ER_ADD_CONNECTION_CLOSED_POOL
        )
      );
      return;
    }

    // Initialize connection for pool use
    conn.lastUse = Date.now();

    // Setup connection for pool use
    conn.forceEnd = conn.end;
    conn.release = (callback) => this._handleRelease(conn, callback);
    conn.end = conn.release;

    // Override destroy method to handle pool cleanup
    this._overrideConnectionMethods(conn);

    // Setup error handler for connection failures
    this._setupConnectionErrorHandler(conn);

    // Add to idle connections and mark creation as complete
    this.#idleConnections.push(conn);
    this.#connectionInCreation = false;

    // Emit events and call success callback
    this.emit('_idle');
    this.emit('connection', conn);
    onSuccess(conn);
  }

  /**
   * Overrides connection methods for pool integration
   * @param {Connection} conn - The connection to modify
   */
  _overrideConnectionMethods(conn) {
    const nativeDestroy = conn.destroy.bind(conn);
    const pool = this;

    conn.destroy = function () {
      pool._endLeak(conn);
      delete pool.#activeConnections[conn.threadId];
      nativeDestroy();
      pool.emit('validateSize');
    };
  }

  /**
   * Sets up error handler for a connection
   * @param {Connection} conn - The connection to set up
   */
  _setupConnectionErrorHandler(conn) {
    const pool = this;

    conn.once('error', () => {
      // Clean up this connection
      pool._endLeak(conn);
      delete pool.#activeConnections[conn.threadId];

      // Process idle connections
      pool._processIdleConnectionsOnError(conn);

      // Check if we need to create more connections
      setImmediate(() => {
        if (!pool.#requests.isEmpty()) {
          pool._managePoolSize();
        }
      });
    });
  }

  /**
   * Processes idle connections when an error occurs
   * @param {Connection} errorConn - The connection that had an error
   */
  _processIdleConnectionsOnError(errorConn) {
    let idx = 0;
    while (idx < this.#idleConnections.length) {
      const currConn = this.#idleConnections.peekAt(idx);

      if (currConn === errorConn) {
        this.#idleConnections.removeOne(idx);
        continue;
      }

      // Force validation on other connections
      currConn.lastUse = Math.min(currConn.lastUse, Date.now() - this.opts.minDelayValidation);
      idx++;
    }
  }

  /**
   * Handles errors during connection creation
   * @param {Error} err - The error that occurred
   * @param {Function} onSuccess - Success callback
   * @param {Function} onError - Error callback
   * @param {number} timeoutEnd - Timestamp when connection attempt should time out
   */
  _handleConnectionCreationError(err, onSuccess, onError, timeoutEnd) {
    // Handle connection creation errors
    if (err instanceof AggregateError) {
      err = err.errors[0];
    }
    if (!this.#errorCreatingConnection) this.#errorCreatingConnection = err;
    // Determine if we should retry or fail
    const isFatalError =
      this.#closed || (err.errno && [1524, 1045, 1698].includes(err.errno)) || timeoutEnd < Date.now();
    if (isFatalError) {
      // Fatal error - call error callback with additional pool info
      err.message = err.message + this._errorMsgAddon();
      this._connectionCreationTask = null;
      onError(err);
      return;
    }

    // Retry connection after delay
    this._connectionCreationTask = setTimeout(
      () => this._createPoolConnection(onSuccess, onError, timeoutEnd),
      Math.min(500, timeoutEnd - Date.now())
    );
  }

  /**
   * Checks for timed-out requests and rejects them
   */
  _checkRequestTimeouts() {
    this.#requestTimeoutId = null;
    const currentTime = Date.now();

    while (this.#requests.length > 0) {
      const request = this.#requests.peekFront();

      if (this._hasRequestTimedOut(request, currentTime)) {
        this._rejectTimedOutRequest(request, currentTime);
        continue;
      }

      this._scheduleNextTimeoutCheck(request, currentTime);
      return;
    }
  }

  /**
   * Checks if a request has timed out
   * @param {Request} request - The request to check
   * @param {number} currentTime - Current timestamp
   * @returns {boolean} - True if request has timed out
   */
  _hasRequestTimedOut(request, currentTime) {
    return request.timeout <= currentTime;
  }

  /**
   * Rejects a timed out request
   * @param {Request} request - The request to reject
   * @param {number} currentTime - Current timestamp
   */
  _rejectTimedOutRequest(request, currentTime) {
    this.#requests.shift();

    // Determine the cause of the timeout
    const timeoutCause = this.activeConnections() === 0 ? this.#errorCreatingConnection : null;
    const waitTime = Math.abs(currentTime - (request.timeout - this.opts.acquireTimeout));

    // Create appropriate error message with pool state information
    const timeoutError = Errors.createError(
      `pool timeout: failed to retrieve a connection from pool after ${waitTime}ms${this._errorMsgAddon()}`,
      Errors.ER_GET_CONNECTION_TIMEOUT,
      null,
      'HY000',
      null,
      false,
      request.stack,
      null,
      timeoutCause
    );

    request.reject(timeoutError);
  }

  /**
   * Schedules the next timeout check
   * @param {Request} request - The next request in queue
   * @param {number} currentTime - Current timestamp
   */
  _scheduleNextTimeoutCheck(request, currentTime) {
    const timeUntilNextTimeout = request.timeout - currentTime;
    this.#requestTimeoutId = setTimeout(() => this._checkRequestTimeouts(), timeUntilNextTimeout);
  }

  _destroy(conn) {
    this._endLeak(conn);
    delete this.#activeConnections[conn.threadId];
    conn.lastUse = Date.now();
    conn.forceEnd(
      null,
      () => {},
      () => {}
    );

    if (this.totalConnections() === 0) {
      this._stopConnectionReaping();
    }

    this.emit('validateSize');
  }

  release(conn) {
    if (!this.#activeConnections[conn.threadId]) {
      return; // Already released
    }

    this._endLeak(conn);
    this.#activeConnections[conn.threadId] = null;
    conn.lastUse = Date.now();

    if (this.#closed) {
      this._cleanupConnection(conn, 'pool_closed');
      return;
    }

    // Only basic validation here - full validation happens when acquiring
    if (conn.isValid()) {
      this.emit('release', conn);
      this.#idleConnections.push(conn);
      process.nextTick(this.emit.bind(this, '_idle'));
    } else {
      this._cleanupConnection(conn, 'validation_failed');
    }
  }

  _endLeak(conn) {
    if (conn.leakProcess) {
      clearTimeout(conn.leakProcess);
      conn.leakProcess = null;
      if (conn.leaked) {
        conn.opts.logger.warning(
          `Previous possible leak connection with thread ${conn.info.threadId} was returned to pool`
        );
      }
    }
  }

  /**
   * Permit to remove idle connection if unused for some time.
   */
  _startConnectionReaping() {
    if (!this.#unusedConnectionRemoverId && this.opts.idleTimeout > 0) {
      this.#unusedConnectionRemoverId = setInterval(this._removeIdleConnections.bind(this), 500);
    }
  }

  _stopConnectionReaping() {
    if (this.#unusedConnectionRemoverId && this.totalConnections() === 0) {
      clearInterval(this.#unusedConnectionRemoverId);
    }
  }

  /**
   * Removes idle connections that have been unused for too long
   */
  _removeIdleConnections() {
    const idleTimeRemoval = Date.now() - this.opts.idleTimeout * 1000;
    let maxRemoval = Math.max(0, this.#idleConnections.length - this.opts.minimumIdle);

    while (maxRemoval > 0) {
      const conn = this.#idleConnections.peek();
      maxRemoval--;

      if (conn && conn.lastUse < idleTimeRemoval) {
        this.#idleConnections.shift();
        conn.forceEnd(
          null,
          () => {},
          () => {}
        );
        continue;
      }
      break;
    }

    if (this.totalConnections() === 0) {
      this._stopConnectionReaping();
    }
    this.emit('validateSize');
  }

  _shouldCreateMoreConnections() {
    return (
      !this.#connectionInCreation &&
      this.#idleConnections.length < this.opts.minimumIdle &&
      this.totalConnections() < this.opts.connectionLimit &&
      !this.#closed
    );
  }

  /**
   * Processes the next request in the queue if connections are available
   */
  _processNextPendingRequest() {
    clearTimeout(this.#requestTimeoutId);
    this.#requestTimeoutId = null;

    const request = this.#requests.shift();
    if (!request) return;

    const conn = this.#idleConnections.shift();
    if (conn) {
      if (this.opts.leakDetectionTimeout > 0) {
        this._startLeakDetection(conn);
      }
      this.#activeConnections[conn.threadId] = conn;
      this.emit('acquire', conn);
      request.resolver(conn);
    } else {
      this.#requests.unshift(request);
    }

    this._checkRequestTimeouts();
  }

  _hasIdleConnection() {
    return !this.#idleConnections.isEmpty();
  }

  /**
   * Acquires an idle connection from the pool
   * @param {Function} callback - Callback function(err, conn)
   */
  _acquireIdleConnection(callback) {
    // Quick check if acquisition is possible
    if (!this._hasIdleConnection() || this.#closed) {
      callback(new Error('No idle connections available'));
      return;
    }

    this._findValidIdleConnection(callback, false);
  }

  /**
   * Search info object of an existing connection. to know server type and version.
   * @returns information object if connection available.
   */
  _searchInfo() {
    let info = null;
    let conn = this.#idleConnections.get(0);

    if (!conn) {
      for (const threadId in Object.keys(this.#activeConnections)) {
        conn = this.#activeConnections[threadId];
        if (!conn) {
          break;
        }
      }
    }

    if (conn) {
      info = conn.info;
    }
    return info;
  }

  /**
   * Recursively searches for a valid idle connection
   * @param {Function} callback - Callback function(err, conn)
   * @param {boolean} needPoolSizeCheck - Whether to check pool size after
   */
  _findValidIdleConnection(callback, needPoolSizeCheck) {
    if (this.#idleConnections.isEmpty()) {
      // No more connections to check
      if (needPoolSizeCheck) {
        setImmediate(() => this.emit('validateSize'));
      }
      callback(new Error('No valid connections found'));
      return;
    }

    const conn = this.#idleConnections.shift();
    this.#activeConnections[conn.threadId] = conn;
    this._validateConnectionHealth(conn, (isValid) => {
      if (isValid) {
        if (this.opts.leakDetectionTimeout > 0) {
          this._startLeakDetection(conn);
        }

        if (needPoolSizeCheck) {
          setImmediate(() => this.emit('validateSize'));
        }

        callback(null, conn);
        return;
      } else {
        delete this.#activeConnections[conn.threadId];
      }

      // Connection failed validation, try next one
      this._findValidIdleConnection(callback, true);
    });
  }

  /**
   * Validates if a connection is healthy and can be used
   * @param {Connection} conn - The connection to validate
   * @param {Function} callback - Callback function(isValid)
   */
  _validateConnectionHealth(conn, callback) {
    if (!conn) {
      callback(false);
      return;
    }

    // Skip validation if connection is already invalid or was recently used
    const recentlyUsed = this.opts.minDelayValidation > 0 && Date.now() - conn.lastUse <= this.opts.minDelayValidation;

    if (!conn.isValid() || recentlyUsed) {
      callback(conn.isValid());
      return;
    }

    // Perform ping to verify connection is responsive
    const pingOptions = { opts: { timeout: this.opts.pingTimeout } };
    conn.ping(
      pingOptions,
      () => callback(true),
      () => callback(false)
    );
  }

  _leakedConnections() {
    let counter = 0;
    for (const connection of Object.values(this.#activeConnections)) {
      if (connection && connection.leaked) counter++;
    }
    return counter;
  }

  _errorMsgAddon() {
    if (this.opts.leakDetectionTimeout > 0) {
      return `\n    (pool connections: active=${this.activeConnections()} idle=${this.idleConnections()} leak=${this._leakedConnections()} limit=${
        this.opts.connectionLimit
      })`;
    }
    return `\n    (pool connections: active=${this.activeConnections()} idle=${this.idleConnections()} limit=${
      this.opts.connectionLimit
    })`;
  }

  toString() {
    return `active=${this.activeConnections()} idle=${this.idleConnections()} limit=${this.opts.connectionLimit}`;
  }

  //*****************************************************************
  // public methods
  //*****************************************************************

  get closed() {
    return this.#closed;
  }

  /**
   * Get current total connection number.
   * @return {number}
   */
  totalConnections() {
    return this.activeConnections() + this.idleConnections();
  }

  /**
   * Get current active connections.
   * @return {number}
   */
  activeConnections() {
    let counter = 0;
    for (const connection of Object.values(this.#activeConnections)) {
      if (connection) counter++;
    }
    return counter;
  }

  /**
   * Get current idle connection number.
   * @return {number}
   */
  idleConnections() {
    return this.#idleConnections.length;
  }

  /**
   * Get current stacked connection request.
   * @return {number}
   */
  taskQueueSize() {
    return this.#requests.length;
  }

  escape(value) {
    return Utils.escape(this.opts.connOptions, this._searchInfo(), value);
  }

  escapeId(value) {
    return Utils.escapeId(this.opts.connOptions, this._searchInfo(), value);
  }

  //*****************************************************************
  // promise methods
  //*****************************************************************

  /**
   * Retrieve a connection from the pool.
   * Create a new one if limit is not reached.
   * wait until acquireTimeout.
   * @param cmdParam for stackTrace error
   * @param {Function} callback - Callback function(err, conn)
   */
  getConnection(cmdParam, callback) {
    if (typeof cmdParam === 'function') {
      callback = cmdParam;
      cmdParam = {};
    }

    if (this.#closed) {
      const err = Errors.createError(
        'pool is closed',
        Errors.ER_POOL_ALREADY_CLOSED,
        null,
        'HY000',
        cmdParam === null ? null : cmdParam.sql,
        false,
        cmdParam.stack
      );
      callback(err);
      return;
    }

    this._acquireIdleConnection((err, conn) => {
      if (!err && conn) {
        // connection is available
        this.emit('acquire', conn);
        callback(null, conn);
        return;
      }

      if (this.#closed) {
        callback(
          Errors.createError(
            'Cannot add request to pool, pool is closed',
            Errors.ER_POOL_ALREADY_CLOSED,
            null,
            'HY000',
            cmdParam === null ? null : cmdParam.sql,
            false,
            cmdParam.stack
          )
        );
        return;
      }

      // no idle connection available
      // creates a new connection if the limit is not reached
      setImmediate(this.emit.bind(this, 'validateSize'));

      // stack request
      setImmediate(this.emit.bind(this, 'enqueue'));
      const request = new Request(
        Date.now() + this.opts.acquireTimeout,
        cmdParam.stack,
        (conn) => callback(null, conn),
        (err) => callback(err)
      );

      this.#requests.push(request);

      if (!this.#requestTimeoutId) {
        this.#requestTimeoutId = setTimeout(this._checkRequestTimeouts.bind(this), this.opts.acquireTimeout);
      }
    });
  }

  /**
   * Close all connection in pool
   * Ends in multiple step :
   * - close idle connections
   * - ensure that no new request is possible
   *   (active connection release are automatically closed on release)
   * - if remaining, after 10 seconds, close remaining active connections
   *
   * @return Promise
   */
  end() {
    if (this.#closed) {
      return Promise.reject(Errors.createError('pool is already closed', Errors.ER_POOL_ALREADY_CLOSED));
    }

    this.#closed = true;
    clearInterval(this.#unusedConnectionRemoverId);
    clearInterval(this._managePoolSizeTask);
    clearTimeout(this._connectionCreationTask);
    clearTimeout(this.#requestTimeoutId);

    const cmdParam = {};
    if (this.opts.trace) Error.captureStackTrace(cmdParam);
    //close unused connections
    const idleConnectionsEndings = [];
    let conn;
    while ((conn = this.#idleConnections.shift())) {
      idleConnectionsEndings.push(new Promise(conn.forceEnd.bind(conn, cmdParam)));
    }

    clearTimeout(this.#requestTimeoutId);
    this.#requestTimeoutId = null;

    //reject all waiting task
    if (!this.#requests.isEmpty()) {
      const err = Errors.createError(
        'pool is ending, connection request aborted',
        Errors.ER_CLOSING_POOL,
        null,
        'HY000',
        null,
        false,
        cmdParam.stack
      );
      let task;
      while ((task = this.#requests.shift())) {
        task.reject(err);
      }
    }
    const pool = this;
    return Promise.all(idleConnectionsEndings).then(async () => {
      if (pool.activeConnections() > 0) {
        // wait up to 10 seconds, that active connection are released
        let remaining = 100;
        while (remaining-- > 0) {
          if (pool.activeConnections() > 0) {
            await new Promise((res) => setTimeout(() => res(), 100));
          }
        }

        // force close any remaining active connections
        for (const connection of Object.values(pool.#activeConnections)) {
          if (connection) connection.destroy();
        }
      }
      return Promise.resolve();
    });
  }

  _cleanupConnection(conn, reason = '') {
    if (!conn) return;

    this._endLeak(conn);
    delete this.#activeConnections[conn.threadId];

    try {
      // using end in case pool ends while connection succeed without still having function wrappers
      const endingFct = conn.forceEnd ? conn.forceEnd : conn.end;
      endingFct.call(
        conn,
        null,
        () => this.emit('connectionClosed', { threadId: conn.threadId, reason }),
        () => {}
      );
    } catch (err) {
      this.emit('error', new Error(`Failed to cleanup connection: ${err.message}`));
    }

    if (this.totalConnections() === 0) {
      this._stopConnectionReaping();
    }

    this.emit('validateSize');
  }

  /**
   * Handles the release of a connection back to the pool
   * @param {Connection} conn - The connection to release
   * @param {Function} callback - Callback function when complete
   */
  _handleRelease(conn, callback) {
    callback = callback || function () {};

    // Handle special cases first
    if (this.#closed || !conn.isValid()) {
      this._destroy(conn);
      callback();
      return;
    }

    // Skip transaction state reset if configured
    if (this.opts.noControlAfterUse) {
      this.release(conn);
      callback();
      return;
    }

    // Reset connection state before returning to pool
    const resetFunction = this._getRevertFunction(conn);

    resetFunction((err) => {
      if (err) {
        this._destroy(conn);
      } else {
        this.release(conn);
      }
      callback();
    });
  }

  /**
   * Get the appropriate function to reset connection state
   * @returns {Function} Function that takes a callback
   */
  _getRevertFunction(conn) {
    const canUseReset =
      this.opts.resetAfterUse &&
      conn.info.isMariaDB() &&
      ((conn.info.serverVersion.minor === 2 && conn.info.hasMinVersion(10, 2, 22)) ||
        conn.info.hasMinVersion(10, 3, 13));

    return canUseReset
      ? (callback) => conn.reset({}, callback)
      : (callback) =>
          conn.changeTransaction(
            { sql: 'ROLLBACK' },
            () => callback(null),
            (err) => callback(err)
          );
  }

  /**
   * Sets up leak detection for a connection
   * @param {Connection} conn - The connection to monitor
   */
  _startLeakDetection(conn) {
    conn.lastUse = Date.now();
    conn.leaked = false;

    // Set timeout to detect potential leaks
    conn.leakProcess = setTimeout(
      () => {
        conn.leaked = true;
        const unusedTime = Date.now() - conn.lastUse;

        // Log warning about potential leak
        conn.opts.logger.warning(
          `A possible connection leak on thread ${conn.info.threadId} ` +
            `(connection not returned to pool for ${unusedTime}ms). ` +
            `Has connection.release() been called?${this._errorMsgAddon()}`
        );
      },
      this.opts.leakDetectionTimeout,
      conn
    );
  }
}

class Request {
  constructor(timeout, stack, resolver, rejecter) {
    this.timeout = timeout;
    this.stack = stack;
    this.resolver = resolver;
    this.rejecter = rejecter;
  }

  reject(err) {
    process.nextTick(this.rejecter, err);
  }
}

module.exports = Pool;
