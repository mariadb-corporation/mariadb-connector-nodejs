'use strict';

const EventEmitter = require('events');
const util = require('util');
const Queue = require('denque');
const Errors = require('./misc/errors');
const Utils = require('./misc/utils');

const QUERY = 1;
const EXECUTE = 2;
const BATCH = 3;

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
  this.getConnection = function () {
    return addRequest(this);
  };

  /**
   * Execute a query on one connection from pool.
   *
   * @param sql   sql command
   * @param value parameter value of sql command (not mandatory)
   * @return {Promise}
   */
  this.query = function (sql, value) {
    return addRequest(this, sql, value, QUERY);
  };

  /**
   * Execute command on one connection from pool.
   *
   * @param sql   sql command
   * @param value parameter value of sql command (not mandatory)
   * @return {Promise}
   */
  this.execute = function (sql, value) {
    return addRequest(this, sql, value, EXECUTE);
  };

  /**
   * Execute a batch on one connection from pool.
   *
   * @param sql   sql command
   * @param value parameter value of sql command (not mandatory)
   * @return {Promise}
   */
  this.batch = function (sql, value) {
    return addRequest(this, sql, value, BATCH);
  };

  /**
   * Close all connection in pool
   *
   * @return Promise
   */
  this.end = function () {
    if (closed) {
      return Promise.reject(
        Errors.createError('pool is already closed', Errors.ER_POOL_ALREADY_CLOSED)
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

    clearTimeout(tasksTimeoutId);
    tasksTimeoutId = null;

    //reject all waiting task
    if (!taskQueue.isEmpty()) {
      const err = Errors.createError(
        'pool is ending, connection request aborted',
        Errors.ER_CLOSING_POOL
      );

      let task;
      while ((task = taskQueue.shift())) {
        task.reject(err);
      }
    }

    return Promise.all(idleConnectionsEndings);
  };

  /**
   * Get current active connections.
   * @return {number}
   */
  this.activeConnections = function () {
    return Object.keys(activeConnections).length;
  };

  /**
   * Get current total connection number.
   * @return {number}
   */
  this.totalConnections = function () {
    return this.activeConnections() + this.idleConnections();
  };

  /**
   * Get current idle connection number.
   * @return {number}
   */
  this.idleConnections = function () {
    return idleConnections.length;
  };

  /**
   * Get current stacked connection request.
   * @return {number}
   */
  this.taskQueueSize = function () {
    return taskQueue.length;
  };

  /**
   * First connection creation.
   * activation is slightly different than pooling grow : If connection fails, there is many retries for 30s
   * (option initializationTimeout).
   * If connection fails, error will be thrown to request / console if no request, to ensure that error is thrown.
   */
  this.initialize = function () {
    connectionInCreation = true;
    const pool = this;
    const timeoutEnd = Date.now() + opts.initializationTimeout;
    connectionCreationLoop(pool, 0, timeoutEnd)
      .then((conn) => {
        //add to pool
        if (closed) {
          conn.forceEnd().catch((err) => {});
        } else {
          addPoolConnection(pool, conn);
          if (opts.idleTimeout > 0) {
            idleMaintainingTask = setInterval(idleMaintainer, 500, pool);
          }
        }
      })
      .catch((err) => {
        connectionInCreation = false;
        const task = taskQueue.shift();
        if (task) {
          pool.rejectTask(task, err);
        } else if (!closed) {
          console.error(err);
        }
      })
      .finally(() => {
        ensurePoolSize(pool);
      });
  };

  this.rejectTask = (task, err) => {
    clearTimeout(tasksTimeoutId);
    tasksTimeoutId = null;
    task.reject(err);
    taskTimeoutHandler();
  };

  this.escape = (value) => {
    return Utils.escape(options.connOptions, searchInfo(), value);
  };

  this.escapeId = (value) => {
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
   * @param type      command type
   * @return {*}
   */
  const addRequest = function (pool, sql, values, type) {
    if (type && !sql) {
      // request for query/execute/batch without sql
      return Promise.reject(
        Errors.createError('sql parameter is mandatory', Errors.ER_POOL_UNDEFINED_SQL)
      );
    }
    if (closed) {
      return Promise.reject(Errors.createError('pool is closed', Errors.ER_POOL_ALREADY_CLOSED));
    }

    return getIdleValidConnection(pool).then(
      (conn) => {
        // connection is available. process task
        pool.emit('acquire', conn);
        return processTask(conn, sql, values, type);
      },
      () => {
        // no idle connection available
        // create a new connection if limit is not reached
        ensurePoolSize(pool);

        const task = new Task(sql, values, type, opts);
        if (!tasksTimeoutId) {
          tasksTimeoutId = setTimeout(taskTimeoutHandler, opts.acquireTimeout);
        }

        // stack task
        process.nextTick(() => pool.emit('enqueue'));
        taskQueue.push(task);

        return task.promise;
      }
    );
  };

  /**
   * Return an idle Connection.
   * If connection has not been used for some time ( minDelayValidation), validate connection status.
   *
   * @param pool pool
   * @returns {Promise<Connection>} connection of null of no valid idle connection.
   */
  const getIdleValidConnection = function (pool) {
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
        .catch((err) => {
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

  const taskTimeoutHandler = () => {
    //handle next Timer
    tasksTimeoutId = null;
    const currTime = Date.now();
    let task;
    while ((task = taskQueue.peekFront())) {
      if (task.timeout <= currTime) {
        taskQueue.shift();
        task.reject(
          Errors.createError(
            `retrieve connection from pool timeout after ${Math.abs(
              Date.now() - (task.timeout - opts.acquireTimeout)
            )}ms`,
            Errors.ER_GET_CONNECTION_TIMEOUT
          )
        );
      } else {
        tasksTimeoutId = setTimeout(taskTimeoutHandler, task.timeout - currTime);
        return;
      }
    }
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
  const connectionCreationLoop = function (pool, iteration, timeoutEnd) {
    return new Promise(function (resolve, reject) {
      const creationTryout = function (resolve, reject) {
        if (closed) {
          reject(
            Errors.createFatalError(
              'Cannot create new connection to pool, pool closed',
              Errors.ER_ADD_CONNECTION_CLOSED_POOL
            )
          );
          return;
        }
        iteration++;
        createConnectionPool(pool)
          .then((conn) => {
            resolve(conn);
          })
          .catch((err) => {
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

  const addPoolConnection = function (pool, conn) {
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
    conn.on('error', (err) => {
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

  this._releaseConnection = function (conn) {
    removeLeakProcess(conn);
    conn.lastUse = Date.now();
    delete activeConnections[conn.threadId];
    const pool = this;
    if (closed) {
      conn.forceEnd().catch(() => {});
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
  const ensurePoolSize = function (pool) {
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
            .then((conn) => {
              if (closed) {
                return conn.forceEnd().catch((err) => {});
              }
              addPoolConnection(pool, conn);
            })
            .catch((err) => {
              if (pool.totalConnections() === 0) {
                const task = taskQueue.shift();
                if (task) {
                  pool.rejectTask(task, err);
                }
              } else if (!closed) {
                console.error(`pool fail to create connection (${err.message})`);
              }

              //delay next try
              setTimeout(() => {
                connectionInCreation = false;
                if (!taskQueue.isEmpty()) {
                  ensurePoolSize(pool);
                }
              }, 500);
            });
        }
      });
    }
  };

  /**
   * Permit to remove idle connection if unused for some time.
   * @param pool  current pool
   */
  const idleMaintainer = function (pool) {
    let toRemove = Math.max(1, pool.idleConnections() - opts.minimumIdle);
    while (toRemove > 0) {
      const conn = idleConnections.peek();
      --toRemove;
      if (conn && conn.lastUse + opts.idleTimeout * 1000 < Date.now()) {
        idleConnections.shift();
        conn.forceEnd().catch((err) => {});
        continue;
      }
      break;
    }
    ensurePoolSize(pool);
  };

  this._discardConnection = (conn) => {
    removeLeakProcess(conn);
    delete activeConnections[conn.threadId];
    conn.forceEnd().catch((err) => {});
    this.emit('_remove-conn');
  };

  const logLeak = (conn) => {
    console.log(
      `Possible connection leak on thread ${
        conn.info.threadId
      } (connection not returned to pool since ${
        Date.now() - conn.lastUse
      }ms. Did connection.released() been implemented`
    );
    conn.leaked = true;
  };

  const _initLeakProcess = (conn) => {
    conn.lastUse = Date.now();
    conn.leaked = false;
    conn.leakProcess = setTimeout(logLeak, opts.leakDetectionTimeout, conn);
  };

  const _removeLeakProcess = (conn) => {
    clearTimeout(conn.leakProcess);
    conn.leakProcess = null;
    if (conn.leaked) {
      console.log(
        `Previous possible leak connection with thread ${conn.info.threadId} was returned to pool`
      );
    }
  };

  /**
   * Launch next waiting task request if available connections.
   */
  const handleTaskQueue = function () {
    clearTimeout(tasksTimeoutId);
    tasksTimeoutId = null;
    const task = taskQueue.shift();

    if (task) {
      const conn = idleConnections.shift();
      if (conn) {
        initLeakProcess(conn);
        this.emit('acquire', conn);
        activeConnections[conn.threadId] = conn;
        processTask(conn, task.sql, task.values, task.type)
          .then(task.resolver)
          .catch(task.rejecter);
      } else {
        taskQueue.unshift(task);
      }
      taskTimeoutHandler();
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
  let tasksTimeoutId;
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

class Task {
  constructor(sql, values, type, opts) {
    this.timeout = Date.now() + opts.acquireTimeout;
    this.sql = sql;
    this.values = values;
    this.type = type;
    this.resolver = null;
    this.rejecter = null;
  }

  get promise() {
    const task = this;
    return new Promise(function (resolver, rejecter) {
      task.resolver = resolver;
      task.rejecter = rejecter;
    });
  }

  reject(err) {
    process.nextTick(this.rejecter, err);
  }
}

util.inherits(PoolBase, EventEmitter);
module.exports = PoolBase;
module.exports.QUERY = QUERY;
module.exports.EXECUTE = EXECUTE;
module.exports.BATCH = BATCH;
