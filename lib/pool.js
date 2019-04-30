'use strict';

const Connection = require('./connection');
const ConnectionCallback = require('./connection-callback');
const Queue = require('denque');
const Errors = require('./misc/errors');

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
        'retrieve connection from pool timeout',
        false,
        null,
        'HY000',
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

  /**
   * First connection creation.
   * activation i slightly different than pooling grow : If connection fails, there is many retries for 30s
   * (option initializationTimeout). If connection fails, error will be thrown to request / console if no request.
   */
  this.activatePool = function() {
    connectionInCreation = true;
    const self = this;
    const timeoutEnd = Date.now() + opts.initializationTimeout;
    connectionCreationLoop(self, 0, timeoutEnd)
      .then(conn => {
        //add to pool
        if (closed) {
          conn.forceEnd().catch(err => {});
        } else {
          attachConnectionToPool(self, conn);
          if (opts.idleTimeout > 0) {
            idleMaintainingTask = setInterval(idleMaintainer, 500, self);
          }
          checkPoolSize(self);
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
        checkPoolSize(self);
      });
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
        if (sql) {
          return useConnection(conn, sql, values, isBatch);
        }
        return Promise.resolve(conn);
      },
      () => {
        //no idle connection available
        //create a new connection if limit is not reached
        checkPoolSize(pool);

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
            firstTaskTimeout = setTimeout(
              rejectAndResetTimeout,
              opts.acquireTimeout,
              task
            );
          }
          taskQueue.push(task);
        });
      }
    );
  };

  const getIdleValidConnection = function(pool) {
    if (idleConnections.isEmpty()) {
      checkPoolSize(pool);
      return Promise.reject(null);
    }

    const conn = idleConnections.shift();
    activeConnections[conn.threadId] = conn;
    if (
      opts.minDelayValidation <= 0 ||
      Date.now() - conn.lastUse > opts.minDelayValidation
    ) {
      if (useCallback) {
        return new Promise((resolve, reject) => {
          conn.ping(err => {
            if (err) {
              delete activeConnections[conn.threadId];
              return getIdleValidConnection(pool);
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
            return getIdleValidConnection(pool);
          });
      }
    } else {
      //just check connection state
      if (conn.isValid()) {
        return Promise.resolve(conn);
      } else {
        delete activeConnections[conn.threadId];
        return getIdleValidConnection(pool);
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

  /**
   * Task request timeout handler
   * @param task
   */
  const rejectTimeout = task => {
    firstTaskTimeout = null;
    if (task === taskQueue.peekFront()) {
      taskQueue.shift();
      process.nextTick(
        task.reject,
        Errors.createError(
          'retrieve connection from pool timeout',
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
    rejectTimeout(task);
    resetTimeoutToNextTask();
  };

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
              (err.errno &&
                (err.errno === 1524 ||
                  err.errno === 1045 ||
                  err.errno === 1698)) ||
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

  const increasePoolSize = function(pool) {
    const timeoutEnd = Date.now() + opts.initializationTimeout;
    if (!closed) {
      connectionCreationLoop(pool, 0, timeoutEnd)
        .then(conn => {
          if (closed) {
            conn.forceEnd().catch(err => {});
          } else {
            attachConnectionToPool(pool, conn);
            checkPoolSize(pool);
          }
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
              checkPoolSize(pool);
            }
          }, 500);
        });
    }
  };

  const attachConnectionToPool = function(pool, conn) {
    idleConnections.push(conn);
    conn.lastUse = Date.now();
    const initialDestroyFct = conn.destroy;
    conn.destroy = () => {
      delete activeConnections[conn.threadId];
      initialDestroyFct();
      checkPoolSize(pool);
    };

    //Connection error
    // -> evict connection from pool
    conn.on('error', err => {
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
          currConn.lastUse = Math.min(
            Date.now() - opts.minDelayValidation,
            currConn.lastUse
          );
        }
        idx++;
      }
      checkPoolSize(pool);
    });
    connectionInCreation = false;

    handleTaskQueue();
  };

  const releasePool = function(conn) {
    conn.lastUse = Date.now();
    delete activeConnections[conn.threadId];
    if (closed) {
      return conn.forceEnd().catch(() => {
        return Promise.resolve();
      });
    } else if (conn.isValid()) {
      idleConnections.push(conn);
      process.nextTick(handleTaskQueue);
    }
  };

  /**
   * Add connection to pool.
   */
  const createConnectionPoolPromise = function(pool) {
    const conn = new Connection(opts.connOptions);
    return conn
      .connect()
      .then(() => {
        if (closed) {
          conn
            .end()
            .then(() => {})
            .catch(() => {});
          return Promise.reject(
            Errors.createError(
              'Cannot create new connection to pool, pool closed',
              true,
              null,
              '08S01',
              Errors.ER_ADD_CONNECTION_CLOSED_POOL,
              null
            )
          );
        }

        conn.releaseWithoutError = () => {
          conn.end().catch(() => {});
        };

        conn.forceEnd = conn.end;

        const discard = () => {
          delete activeConnections[conn.threadId];
          return conn
            .forceEnd()
            .then(() => {
              checkPoolSize(pool);
              return Promise.resolve();
            })
            .catch(() => {
              checkPoolSize(pool);
              return Promise.resolve();
            });
        };

        conn.release = () => {
          if (closed) discard();
          if (opts.noControlAfterUse) {
            releasePool(conn);
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
              releasePool(conn);
              return Promise.resolve();
            })
            .catch(err => {
              //uncertain connection state.
              // discard it
              return discard();
            });
        };
        conn.end = conn.release;
        return Promise.resolve(conn);
      })
      .catch(err => {
        return Promise.reject(err);
      });
  };

  /**
   * Grow pool connections until reaching connection limit.
   */
  const checkPoolSize = function(pool) {
    if (
      !connectionInCreation &&
      pool.idleConnections() < opts.minimumIdle &&
      pool.totalConnections() < opts.connectionLimit &&
      !closed
    ) {
      connectionInCreation = true;
      process.nextTick(increasePoolSize, pool);
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
        firstTaskTimeout = setTimeout(
          rejectAndResetTimeout,
          nextTask.timeout - currTime,
          nextTask
        );
        return;
      }
    }
  };

  /************************************************************************************
   * Removing idle connection
   ***********************************************************************************/
  const idleMaintainer = function(pool) {
    let toRemove = Math.max(1, pool.idleConnections() - opts.minimumIdle);
    while (toRemove > 0) {
      const conn = idleConnections.peek();
      --toRemove;
      if (conn && conn.lastUse + opts.idleTimeout * 1000 < Date.now()) {
        idleConnections.shift();
        conn.forceEnd().catch(err => {});
        conn.releaseWithoutError();
        continue;
      }
      break;
    }
  };

  /************************************************************************************
   * Callback addons
   ***********************************************************************************/

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

  const createConnectionPoolCallback = function(pool) {
    const conn = new ConnectionCallback(opts.connOptions);
    return new Promise(function(resolve, reject) {
      conn.connect(err => {
        if (err) {
          reject(err);
        } else {
          if (closed) {
            //discard connection
            conn.end(err => {});
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
          } else {
            const initialEnd = conn.end;
            conn.forceEnd = () => {
              return new Promise(function(res, rej) {
                initialEnd(err => {
                  if (err) {
                    rej(err);
                  } else {
                    res();
                  }
                });
              });
            };

            const discard = cb => {
              delete activeConnections[conn.threadId];
              conn
                .forceEnd()
                .then(() => {
                  checkPoolSize(pool);
                  if (cb) cb();
                })
                .catch(() => {
                  checkPoolSize(pool);
                  if (cb) cb();
                });
            };

            conn.release = function(cb) {
              if (closed) discard(cb);
              if (opts.noControlAfterUse) {
                releasePool(conn);
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
                  discard(cb);
                  return;
                } else {
                  releasePool(conn);
                }
                if (cb) cb();
              });
            };
            conn.end = conn.release;
            conn.releaseWithoutError = () => {
              conn.end(err => {});
            };
            resolve(conn);
          }
        }
      });
    });
  };

  const opts = options;
  let closed = false;
  let connectionInCreation = false;

  const idleConnections = new Queue();
  const activeConnections = {};
  const createConnectionPool = useCallback
    ? createConnectionPoolCallback
    : createConnectionPoolPromise;
  const useConnection = useCallback
    ? useConnectionCallback
    : useConnectionPromise;
  const taskQueue = new Queue();
  let idleMaintainingTask;
  let firstTaskTimeout;
}

module.exports = Pool;
