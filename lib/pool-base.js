'use strict';

const EventEmitter = require('events');
const util = require('util');
const Queue = require('denque');
const Errors = require('./misc/errors');
const Utils = require('./misc/utils');

function PoolBase(options, processTask, createConnectionPool, pingPromise) {
  //*****************************************************************
  // public methods
  //*****************************************************************

  /**
   * Retrieve a connection from pool.
   * Create a new one, if limit is not reached.
   * wait until acquireTimeout.
   *
   * @return {Promise}
   */
  this.getConnection = function() {
    return addRequest(this);
  };

  /**
   * Execute a query on one connection from pool.
   *
   * @param sql   sql command
   * @param value parameter value of sql command (not mandatory)
   * @return {Promise}
   */
  this.query = function(sql, value) {
    return addRequest(this, sql, value, false);
  };

  /**
   * Execute a batch on one connection from pool.
   *
   * @param sql   sql command
   * @param value parameter value of sql command (not mandatory)
   * @return {Promise}
   */
  this.batch = function(sql, value) {
    return addRequest(this, sql, value, true);
  };

  /**
   * Close all connection in pool
   *
   * @return Promise
   */
  this.end = function() {
    if (closed) {
      return Promise.reject(
        Errors.createError(
          'pool is already closed',
          false,
          null,
          'HY000',
          Errors.ER_POOL_ALREADY_CLOSED,
          undefined,
          false
        )
      );
    }
    closed = true;
    clearInterval(idleMaintainingTask);

    //close unused connections
    const idleConnectionsEndings = [];
    let conn;
    while ((conn = idleConnections.shift())) {
      idleConnectionsEndings.push(conn.forceEnd());
    }

    firstTaskTimeout = clearTimeout(firstTaskTimeout);

    //reject all waiting task
    if (taskQueue.size() > 0) {
      let task;
      const err = Errors.createError(
        'pool is ending, connection request aborted',
        false,
        null,
        'HY000',
        Errors.ER_CLOSING_POOL,
        undefined,
        false
      );
      while ((task = taskQueue.shift())) {
        process.nextTick(task.reject, err);
      }
    }

    return Promise.all(idleConnectionsEndings);
  };

  /**
   * Get current active connections.
   * @return {number}
   */
  this.activeConnections = function() {
    return Object.keys(activeConnections).length;
  };

  /**
   * Get current total connection number.
   * @return {number}
   */
  this.totalConnections = function() {
    return this.activeConnections() + this.idleConnections();
  };

  /**
   * Get current idle connection number.
   * @return {number}
   */
  this.idleConnections = function() {
    return idleConnections.size();
  };

  /**
   * Get current stacked connection request.
   * @return {number}
   */
  this.taskQueueSize = function() {
    return taskQueue.size();
  };

  /**
   * First connection creation.
   * activation is slightly different than pooling grow : If connection fails, there is many retries for 30s
   * (option initializationTimeout).
   * If connection fails, error will be thrown to request / console if no request, to ensure that error is thrown.
   */
  this.initialize = function() {
    connectionInCreation = true;
    const self = this;
    const timeoutEnd = Date.now() + opts.initializationTimeout;
    connectionCreationLoop(self, 0, timeoutEnd)
      .then(conn => {
        //add to pool
        if (closed) {
          conn.forceEnd().catch(err => {});
        } else {
          addPoolConnection(self, conn);
          if (opts.idleTimeout > 0) {
            idleMaintainingTask = setInterval(idleMaintainer, 500, self);
          }
          ensurePoolSize(self);
        }
      })
      .catch(err => {
        connectionInCreation = false;
        const task = taskQueue.shift();
        if (task) {
          firstTaskTimeout = clearTimeout(firstTaskTimeout);
          process.nextTick(task.reject, err);
          resetTimeoutToNextTask();
        } else if (!closed) {
          console.error(err);
        }
        ensurePoolSize(self);
      });
  };

  this.escape = value => {
    return Utils.escape(options.connOptions, searchInfo(), value);
  };

  this.escapeId = value => {
    return Utils.escapeId(options.connOptions, searchInfo(), value);
  };

  //*****************************************************************
  // internal methods
  //*****************************************************************

  /**
   * Search info object of an existing connection. to know server type and version.
   * @returns information object if connection available.
   */
  const searchInfo = () => {
    let info = null;
    let conn = idleConnections.get(0);

    if (conn == null) {
      conn = Object.keys(activeConnections)[0];
    }

    if (conn != null) {
      info = conn.info;
    }
    return info;
  };

  /**
   * Get a connection from pool / execute query
   *
   * @param pool      current pool
   * @param sql       sql value (not mandatory)
   * @param values    sql parameter (not mandatory)
   * @param isBatch   is batch request
   * @return {*}
   */
  const addRequest = function(pool, sql, values, isBatch) {
    if (closed) {
      return Promise.reject(
        Errors.createError(
          'pool is closed',
          false,
          null,
          'HY000',
          Errors.ER_POOL_ALREADY_CLOSED,
          undefined,
          false
        )
      );
    }

    return getIdleValidConnection(pool).then(
      conn => {
        pool.emit('acquire', conn);
        return processTask(conn, sql, values, isBatch);
      },
      () => {
        process.nextTick(() => pool.emit('enqueue'));

        //no idle connection available
        //create a new connection if limit is not reached
        ensurePoolSize(pool);

        //connections are all used, stack demand.
        return new Promise((resolve, reject) => {
          const task = {
            timeout: Date.now() + opts.acquireTimeout,
            reject: reject,
            resolve: resolve,
            sql: sql,
            values: values,
            isBatch: isBatch
          };
          if (!firstTaskTimeout) {
            firstTaskTimeout = setTimeout(rejectAndResetTimeout, opts.acquireTimeout, task);
          }
          taskQueue.push(task);
        });
      }
    );
  };

  /**
   * Return an idle Connection.
   * If connection has not been used for some time ( minDelayValidation), validate connection status.
   *
   * @param pool pool
   * @returns {Promise<Connection|null>)} connection of null of no valid idle connection.
   */
  const getIdleValidConnection = function(pool) {
    if (idleConnections.isEmpty()) {
      return Promise.reject(null);
    }
    const conn = idleConnections.shift();
    activeConnections[conn.threadId] = conn;
    if (opts.minDelayValidation <= 0 || Date.now() - conn.lastUse > opts.minDelayValidation) {
      return pingPromise(conn)
        .then(() => {
          initLeakProcess(conn);
          return Promise.resolve(conn);
        })
        .catch(err => {
          delete activeConnections[conn.threadId];
          pool.emit('_remove-conn');
          return getIdleValidConnection(pool);
        });
    } else {
      //just check connection state
      if (conn.isValid()) {
        initLeakProcess(conn);
        return Promise.resolve(conn);
      } else {
        delete activeConnections[conn.threadId];
        pool.emit('_remove-conn');
        return getIdleValidConnection(pool);
      }
    }
  };

  /**
   * Task request timeout handler
   * @param task
   */
  const timeoutTask = task => {
    firstTaskTimeout = null;
    if (task === taskQueue.peekFront()) {
      taskQueue.shift();
      process.nextTick(
        task.reject,
        Errors.createError(
          'retrieve connection from pool timeout after ' +
            Math.abs(Date.now() - (task.timeout - opts.acquireTimeout)) +
            'ms',
          false,
          null,
          'HY000',
          Errors.ER_GET_CONNECTION_TIMEOUT,
          undefined,
          false
        )
      );
    } else {
      throw new Error('Rejection by timeout without task !!!');
    }
  };

  /**
   * Reject task, and reset timeout to next waiting task if any.
   * @param task
   */
  const rejectAndResetTimeout = task => {
    timeoutTask(task);
    resetTimeoutToNextTask();
  };

  /**
   * Loop for connection creation.
   * This permits to wait before next try after a connection fail.
   *
   * @param pool            current pool
   * @param iteration       current iteration
   * @param timeoutEnd      ending timeout
   * @returns {Promise<any>} Connection if found, error if not
   */
  const connectionCreationLoop = function(pool, iteration, timeoutEnd) {
    return new Promise(function(resolve, reject) {
      const creationTryout = function(resolve, reject) {
        if (closed) {
          reject(
            Errors.createError(
              'Cannot create new connection to pool, pool closed',
              true,
              null,
              '08S01',
              Errors.ER_ADD_CONNECTION_CLOSED_POOL,
              null
            )
          );
          return;
        }
        iteration++;
        createConnectionPool(pool)
          .then(conn => {
            resolve(conn);
          })
          .catch(err => {
            //if timeout is reached or authentication fail return error
            if (
              closed ||
              (err.errno && (err.errno === 1524 || err.errno === 1045 || err.errno === 1698)) ||
              timeoutEnd < Date.now()
            ) {
              reject(err);
              return;
            }

            setTimeout(creationTryout.bind(null, resolve, reject), 500);
          });
      };
      //initial without timeout
      creationTryout(resolve, reject);
    });
  };

  const addPoolConnection = function(pool, conn) {
    conn.lastUse = Date.now();
    const initialDestroyFct = conn.destroy;
    conn.destroy = () => {
      removeLeakProcess(conn);
      delete activeConnections[conn.threadId];
      initialDestroyFct();
      pool.emit('_remove-conn');
    };

    //Connection error
    // -> evict connection from pool
    conn.on('error', err => {
      let idx = 0;
      let currConn;
      removeLeakProcess(conn);
      delete activeConnections[conn.threadId];
      while ((currConn = idleConnections.peekAt(idx))) {
        if (currConn === conn) {
          idleConnections.removeOne(idx);
          break;
        } else {
          //since connection did have an error, other waiting connection might too
          //forcing validation when borrowed next time, even if "minDelayValidation" is not reached.
          currConn.lastUse = Math.min(Date.now() - opts.minDelayValidation, currConn.lastUse);
        }
        idx++;
      }
      pool.emit('_remove-conn');
    });
    connectionInCreation = false;
    idleConnections.push(conn);
    pool.emit('_idle-conn');
    process.nextTick(() => pool.emit('connection', conn));
  };

  this._releaseConnection = function(conn) {
    removeLeakProcess(conn);
    conn.lastUse = Date.now();
    delete activeConnections[conn.threadId];
    const pool = this;
    if (closed) {
      return conn.forceEnd().catch(() => {
        return Promise.resolve();
      });
    } else if (conn.isValid()) {
      pool.emit('release', conn);
      idleConnections.push(conn);
      process.nextTick(() => pool.emit('_idle-conn'));
    } else {
      ensurePoolSize(pool);
    }
  };

  /**
   * Grow pool connections until reaching connection limit.
   */
  const ensurePoolSize = function(pool) {
    if (
      !connectionInCreation &&
      pool.idleConnections() < opts.minimumIdle &&
      pool.totalConnections() < opts.connectionLimit &&
      !closed
    ) {
      connectionInCreation = true;
      process.nextTick(() => {
        const timeoutEnd = Date.now() + opts.initializationTimeout;
        if (!closed) {
          connectionCreationLoop(pool, 0, timeoutEnd)
            .then(conn => {
              if (closed) {
                return conn.forceEnd().catch(err => {});
              }
              addPoolConnection(pool, conn);
            })
            .catch(err => {
              if (pool.totalConnections() === 0) {
                const task = taskQueue.shift();
                if (task) {
                  firstTaskTimeout = clearTimeout(firstTaskTimeout);
                  process.nextTick(task.reject, err);
                  resetTimeoutToNextTask();
                }
              } else if (!closed) {
                console.error(`pool fail to create connection (${err.message})`);
              }

              //delay next try
              setTimeout(() => {
                connectionInCreation = false;
                if (taskQueue.size() > 0) {
                  ensurePoolSize(pool);
                }
              }, 500);
            });
        }
      });
    }
  };

  const resetTimeoutToNextTask = () => {
    //handle next Timer
    const currTime = Date.now();
    let nextTask;
    while ((nextTask = taskQueue.peekFront())) {
      if (nextTask.timeout < currTime) {
        timeoutTask(nextTask);
      } else {
        firstTaskTimeout = setTimeout(rejectAndResetTimeout, nextTask.timeout - currTime, nextTask);
        return;
      }
    }
  };

  /**
   * Permit to remove idle connection if unused for some time.
   * @param pool  current pool
   */
  const idleMaintainer = function(pool) {
    let toRemove = Math.max(1, pool.idleConnections() - opts.minimumIdle);
    while (toRemove > 0) {
      const conn = idleConnections.peek();
      --toRemove;
      if (conn && conn.lastUse + opts.idleTimeout * 1000 < Date.now()) {
        idleConnections.shift();
        conn.forceEnd().catch(err => {});
        continue;
      }
      break;
    }
    ensurePoolSize(pool);
  };

  this._discardConnection = conn => {
    removeLeakProcess(conn);
    delete activeConnections[conn.threadId];
    conn.forceEnd().catch(err => {});
    this.emit('_remove-conn');
  };

  const logLeak = conn => {
    console.log(
      'Possible connection leak on thread ' +
        conn.info.threadId +
        ' (connection not returned to pool since ' +
        (Date.now() - conn.lastUse) +
        'ms. Did connection.released() been implemented'
    );
    conn.leaked = true;
  };

  const _initLeakProcess = conn => {
    conn.lastUse = Date.now();
    conn.leaked = false;
    conn.leakProcess = setTimeout(logLeak, opts.leakDetectionTimeout, conn);
  };

  const _removeLeakProcess = conn => {
    conn.leakProcess = clearTimeout(conn.leakProcess);
    if (conn.leaked) {
      console.log(
        'Previous possible leak connection with thread ' +
          conn.info.threadId +
          ' was returned to pool'
      );
    }
  };

  /**
   * Launch next waiting task request if available connections.
   */
  const handleTaskQueue = function() {
    firstTaskTimeout = clearTimeout(firstTaskTimeout);
    const task = taskQueue.shift();

    if (task) {
      const conn = idleConnections.shift();
      if (conn) {
        initLeakProcess(conn);
        this.emit('acquire', conn);
        activeConnections[conn.threadId] = conn;
        resetTimeoutToNextTask();
        processTask(conn, task.sql, task.values, task.isBatch)
          .then(task.resolve)
          .catch(task.reject);
      } else {
        taskQueue.unshift(task);
      }
    }
  };

  const opts = options;
  let closed = false;
  let connectionInCreation = false;
  const initLeakProcess = opts.leakDetectionTimeout > 0 ? _initLeakProcess : () => {};
  const removeLeakProcess = opts.leakDetectionTimeout > 0 ? _removeLeakProcess : () => {};
  const idleConnections = new Queue();
  const activeConnections = {};
  const taskQueue = new Queue();
  let idleMaintainingTask;
  let firstTaskTimeout;
  Object.defineProperty(this, 'closed', {
    get() {
      return closed;
    }
  });

  EventEmitter.call(this);

  this.on('_idle-conn', handleTaskQueue.bind(this));
  this.on('_remove-conn', ensurePoolSize.bind(this, this));
  this.on('connection', ensurePoolSize.bind(this, this));
}

util.inherits(PoolBase, EventEmitter);
module.exports = PoolBase;
