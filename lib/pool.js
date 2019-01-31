"use strict";

const Connection = require("./connection");
const ConnectionCallback = require("./connection-callback");
const Queue = require("denque");
const Errors = require("./misc/errors");

function Pool(options, useCallback) {
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
    return handleRequest(this);
  };

  /**
   * Execute a query on one connection from pool.
   *
   * @param sql   sql command
   * @param value parameter value of sql command (not mandatory)
   * @return {Promise}
   */
  this.query = function(sql, value) {
    return handleRequest(this, sql, value, false);
  };

  /**
   * Execute a batch on one connection from pool.
   *
   * @param sql   sql command
   * @param value parameter value of sql command (not mandatory)
   * @return {Promise}
   */
  this.batch = function(sql, value) {
    return handleRequest(this, sql, value, true);
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
          "pool is already closed",
          false,
          null,
          "HY000",
          Errors.ER_POOL_ALREADY_CLOSED,
          undefined,
          false
        )
      );
    }
    closed = true;

    //close unused connections
    const idleConnectionsEndings = [];
    let conn;
    while ((conn = idleConnections.shift())) {
      idleConnectionsEndings.push(conn.end());
    }

    firstTaskTimeout = clearTimeout(firstTaskTimeout);

    //reject all waiting task
    if (taskQueue.size() > 0) {
      let task;
      const err = Errors.createError(
        "retrieve connection from pool timeout",
        false,
        null,
        "HY000",
        Errors.ER_GET_CONNECTION_TIMEOUT,
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

  //*****************************************************************
  // internal methods
  //*****************************************************************

  /**
   * Get a connection from pool / execute query
   *
   * @param pool      current pool
   * @param sql       sql value (not mandatory)
   * @param values    sql parameter (not mandatory)
   * @param isBatch   is batch request
   * @return {*}
   */
  const handleRequest = function(pool, sql, values, isBatch) {
    if (closed) {
      return Promise.reject(
        Errors.createError(
          "pool is closed",
          false,
          null,
          "HY000",
          Errors.ER_POOL_ALREADY_CLOSED,
          undefined,
          false
        )
      );
    }
    checkPoolSize(pool);
    return getIdleValidConnection().then(
      conn => {
        if (sql) {
          return useConnection(conn, sql, values, isBatch);
        }
        return Promise.resolve(conn);
      },
      () => {
        //no idle connection available
        //create a new connection if limit is not reached
        if (!connectionInCreation && opts.connectionLimit > pool.totalConnections()) {
          connectionInCreation = true;
          addConnectionToPool(pool);
        }
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

  const getIdleValidConnection = function() {
    if (idleConnections.isEmpty()) {
      return Promise.reject(null);
    }

    const conn = idleConnections.shift();
    activeConnections[conn.threadId] = conn;
    if (opts.minDelayValidation <= 0 || Date.now() - conn.lastUse > opts.minDelayValidation) {
      if (useCallback) {
        return new Promise((resolve, reject) => {
          conn.ping(err => {
            if (err) {
              delete activeConnections[conn.threadId];
              return getIdleValidConnection();
            } else resolve(conn);
          });
        });
      } else {
        return conn
          .ping()
          .then(() => {
            return Promise.resolve(conn);
          })
          .catch(err => {
            delete activeConnections[conn.threadId];
            return getIdleValidConnection();
          });
      }
    } else {
      //just check connection state
      if (conn.isValid()) {
        return Promise.resolve(conn);
      } else {
        delete activeConnections[conn.threadId];
        return getIdleValidConnection();
      }
    }
  };

  const useConnectionPromise = function(conn, sql, values, isBatch) {
    if (sql) {
      const fct = isBatch ? conn.batch : conn.query;
      return fct(sql, values)
        .then(res => {
          conn.releaseWithoutError();
          return Promise.resolve(res);
        })
        .catch(err => {
          conn.releaseWithoutError();
          return Promise.reject(err);
        });
    } else {
      return Promise.resolve(conn);
    }
  };

  const useConnectionCallback = function(conn, sql, values, isBatch) {
    if (sql) {
      return new Promise((resolve, reject) => {
        const fct = isBatch ? conn.batch : conn.query;
        fct(sql, values, (err, rows, fields) => {
          conn.releaseWithoutError();
          if (err) reject(err);
          return resolve(rows);
        });
      });
    } else {
      return Promise.resolve(conn);
    }
  };

  /**
   * Task request timeout handler
   * @param task
   */
  const rejectTimeout = task => {
    firstTaskTimeout = null;
    if (task === taskQueue.peekFront()) {
      taskQueue.shift();
      process.nextTick(task.reject,
        Errors.createError(
          "retrieve connection from pool timeout",
          false,
          null,
          "HY000",
          Errors.ER_GET_CONNECTION_TIMEOUT,
          undefined,
          false
        )
      );
    } else {
      throw new Error("Rejection by timeout without task !!!");
    }
  };

  /**
   * Reject task, and reset timeout to next waiting task if any.
   * @param task
   */
  const rejectAndResetTimeout = task => {
    rejectTimeout(task);
    resetTimeoutToNextTask();
  };

  this.activatePool = function() {
    connectionInCreation = true;
    addConnectionToPool(this);
  };

  /**
   * Will throw an error to current task if pool fail to connect.
   * or log if no waiting task.
   *
   * @param pool  current pool
   * @param err   connection error
   */
  const handleConnectionError = function(pool, err) {
    if (pool.totalConnections() === 0) {
      const task = taskQueue.shift();
      if (task) {
        firstTaskTimeout = clearTimeout(firstTaskTimeout);
        process.nextTick(task.reject, err);
        resetTimeoutToNextTask();
      }
    } else {
      console.error("pool fail to create connection (" + err.message + ")");
    }

    connectionInCreation = false;
    if (taskQueue.size() > 0 || !err.errno || err.errno !== 1045) {
      // in case of wrong authentication, not relaunching automatic connection creation.
      checkPoolSize(pool);
    }
  };

  /**
   * Add connection to pool.
   */
  const addConnectionToPoolPromise = function(pool) {
    const conn = new Connection(opts.connOptions);
    conn
      .connect()
      .then(() => {
        if (closed) {
          conn
            .end()
            .then(() => {})
            .catch(() => {});
        } else {
          overlayNewConnection(conn, pool, function(conn, self) {
            const initialEndFct = conn.end;
            conn.end = () => {
              if (opts.noControlAfterUse) {
                conn.lastUse = Date.now();
                delete activeConnections[conn.threadId];
                if (closed) {
                  return initialEndFct().catch(() => {
                    return Promise.resolve();
                  });
                } else if (conn.isValid()) {
                  idleConnections.push(conn);
                  process.nextTick(handleTaskQueue);
                }
                return Promise.resolve();
              }
              //if server permit it, reset the connection, or rollback only if not
              let revertFunction = conn.rollback;
              if (
                opts.resetAfterUse &&
                ((conn.info.isMariaDB() && conn.info.hasMinVersion(10, 2, 4)) ||
                  (!conn.info.isMariaDB() && conn.info.hasMinVersion(5, 7, 3)))
              ) {
                revertFunction = conn.reset;
              }

              return revertFunction()
                .then(() => {
                  conn.lastUse = Date.now();
                  delete activeConnections[conn.threadId];
                  if (closed) {
                    return initialEndFct().catch(() => {
                      return Promise.resolve();
                    });
                  } else if (conn.isValid()) {
                    idleConnections.push(conn);
                    process.nextTick(handleTaskQueue);
                  }
                  return Promise.resolve();
                })
                .catch(err => {
                  //uncertain connection state.
                  // discard it
                  delete activeConnections[conn.threadId];
                  return initialEndFct()
                    .then(() => {
                      checkPoolSize(self);
                      return Promise.resolve();
                    })
                    .catch(() => {
                      checkPoolSize(self);
                      return Promise.resolve();
                    });
                });
            };

            //for mysql compatibility
            conn.release = conn.end;

            conn.releaseWithoutError = () => {
              conn.end().catch(() => {});
            };
          });
        }
      })
      .catch(err => {
        handleConnectionError(pool, err);
      });
  };

  /**
   * Add connection to pool.
   */
  const addConnectionCallbackToPool = function(pool) {
    const conn = new ConnectionCallback(opts.connOptions);
    conn.connect(err => {
      if (err) {
        handleConnectionError(pool, err);
      } else {
        if (closed) {
          //discard connection
          conn.end(() => {});
        } else {
          overlayNewConnection(conn, pool, function(conn, self) {
            const initialEndFct = conn.end;
            conn.end = function(cb) {
              if (opts.noControlAfterUse) {
                conn.lastUse = Date.now();
                delete activeConnections[conn.threadId];
                if (closed) {
                  initialEndFct(err => {});
                } else if (conn.isValid()) {
                  idleConnections.push(conn);
                  process.nextTick(handleTaskQueue);
                }
                if (cb) cb();
                return;
              }

              //if server permit it, reset the connection, or rollback only if not
              let revertFunction = conn.rollback;
              if (
                opts.resetAfterUse &&
                ((conn.info.isMariaDB() && conn.info.hasMinVersion(10, 2, 4)) ||
                  (!conn.info.isMariaDB() && conn.info.hasMinVersion(5, 7, 3)))
              ) {
                revertFunction = conn.reset;
              }
              revertFunction(errCall => {
                if (errCall) {
                  //uncertain connection state.
                  delete activeConnections[conn.threadId];
                  initialEndFct(err => {});
                  checkPoolSize(self);
                } else {
                  conn.lastUse = Date.now();
                  delete activeConnections[conn.threadId];
                  if (closed) {
                    initialEndFct(err => {});
                  } else if (conn.isValid()) {
                    idleConnections.push(conn);
                    process.nextTick(handleTaskQueue);
                  }
                }
                if (cb) cb();
              });
            };

            //for mysql compatibility
            conn.release = conn.end;

            conn.releaseWithoutError = () => {
              conn.end(err => {});
            };
          });
        }
      }
    });
  };

  /**
   * Wrapping new connection
   *
   * @param conn          new connection
   * @param self          current pool
   * @param fctOverlay    overlay function
   */
  const overlayNewConnection = function(conn, self, fctOverlay) {
    idleConnections.push(conn);
    conn.lastUse = Date.now();
    fctOverlay(conn, self);

    const initialDestroyFct = conn.destroy;
    conn.destroy = () => {
      delete activeConnections[conn.threadId];
      initialDestroyFct();
      checkPoolSize(self);
    };

    //Connection error
    // -> evict connection from pool
    conn.on("error", err => {
      let idx = 0;
      let currConn;
      delete activeConnections[conn.threadId];
      while ((currConn = idleConnections.peekAt(idx))) {
        if (currConn === conn) {
          idleConnections.removeOne(idx);
          break;
        } else {
          //since connection did have an error, other waiting connection might too
          //forcing validation when borrowed next time, even if "minDelayValidation" is not reached.
          currConn.lastUse = new Date(0);
        }
        idx++;
      }
      checkPoolSize(self);
    });
    connectionInCreation = false;

    checkPoolSize(self);
    handleTaskQueue();
  };

  /**
   * Grow pool connections until reaching connection limit.
   */
  const checkPoolSize = function(pool) {
    if (!connectionInCreation && pool.totalConnections() < opts.connectionLimit && !closed) {
      connectionInCreation = true;
      process.nextTick(addConnectionToPool, pool);
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
        activeConnections[conn.threadId] = conn;

        resetTimeoutToNextTask();

        //handle task
        if (task.sql) {
          const fct = task.isBatch ? conn.batch : conn.query;
          if (useCallback) {
            fct(task.sql, task.values, (err, rows, fields) => {
              conn.releaseWithoutError();
              if (err) {
                task.reject(err);
              } else {
                task.resolve(rows);
              }
            });
          } else {
            fct(task.sql, task.values)
              .then(res => {
                conn.releaseWithoutError();
                task.resolve(res);
              })
              .catch(err => {
                conn.releaseWithoutError();
                task.reject(err);
              });
          }
        } else {
          task.resolve(conn);
        }
      } else {
        taskQueue.unshift(task);
      }
    }
  };

  const resetTimeoutToNextTask = () => {
    //handle next Timer
    const currTime = Date.now();
    let nextTask;
    while ((nextTask = taskQueue.peekFront())) {
      if (nextTask.timeout < currTime) {
        rejectTimeout(nextTask);
      } else {
        firstTaskTimeout = setTimeout(rejectAndResetTimeout, nextTask.timeout - currTime, nextTask);
        return;
      }
    }
  };

  const opts = options;
  let closed = false;
  let connectionInCreation = false;

  const idleConnections = new Queue();
  const activeConnections = {};
  const addConnectionToPool = useCallback
    ? addConnectionCallbackToPool
    : addConnectionToPoolPromise;
  const useConnection = useCallback ? useConnectionCallback : useConnectionPromise;
  const taskQueue = new Queue();
  let firstTaskTimeout;
}

module.exports = Pool;
