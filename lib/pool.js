'use strict';

const { EventEmitter } = require('events');

const Queue = require('denque');
const Errors = require('./misc/errors');
const Utils = require('./misc/utils');
const Connection = require('./connection');
const ConnectionCallback = require('./connection-callback');

const QUERY = 1,
  EXECUTE = 2,
  BATCH = 3;

class Pool extends EventEmitter {
  #opts;
  #closed = false;
  #connectionInCreation = false;
  #idleConnections = new Queue();
  #activeConnections = {};
  #requests = new Queue();
  #unusedConnectionRemoverId;
  #requestTimeoutId;

  // methods dependent of promise/callback implementation
  #ping;
  #createConnection;
  #processTask;

  constructor(options, callback) {
    super();
    this.#opts = options;

    this.on('_idle', this.#requestsHandler);
    this.on('_validateSize', this.#sizeHandler);

    this.#sizeHandler();

    this.#ping = callback ? this.#pingCallback : this.#pingPromise;
    this.#createConnection = callback ? this.#createConnectionCallback : this.#createConnectionPromise;
    this.#processTask = callback ? this.#processTaskCallback : this.#processTaskPromise;
    this.getConnection = callback ? this.#getConnectionCallback : this.#getConnectionPromise;
    this.end = callback ? this.#endCallback : this.#endPromise;
    this.query = callback ? this.#queryCallback : this.#queryPromise;
    this.execute = callback ? this.#executeCallback : this.#executePromise;
    this.batch = callback ? this.#batchCallback : this.#batchPromise;
  }

  //*****************************************************************
  // pool automatic handlers
  //*****************************************************************

  #doCreateConnection(resolve, reject, timeoutEnd) {
    this.#createConnection()
      .then((conn) => {
        if (this.#closed) {
          conn.forceEnd().catch(() => {});
          throw new Errors.createFatalError(
            'Cannot create new connection to pool, pool closed',
            Errors.ER_ADD_CONNECTION_CLOSED_POOL
          );
        }

        conn.lastUse = Date.now();
        const nativeDestroy = conn.destroy;
        const pool = this;

        conn.destroy = function () {
          pool.#endLeak(conn);
          delete pool.#activeConnections[conn.threadId];
          nativeDestroy();
          pool.emit('_validateSize');
        };

        conn.on('error', function () {
          let idx = 0;
          let currConn;
          pool.#endLeak(conn);
          delete pool.#activeConnections[conn.threadId];
          while ((currConn = pool.#idleConnections.peekAt(idx))) {
            if (currConn === conn) {
              pool.#idleConnections.removeOne(idx);
              break;
            }
            //since connection did have an error, other waiting connection might too
            //forcing validation when borrowed next time, even if "minDelayValidation" is not reached.
            currConn.lastUse = Math.min(currConn.lastUse, Date.now() - pool.#opts.minDelayValidation);
            idx++;
          }
          pool.#sizeHandler();
        });

        this.#idleConnections.push(conn);
        this.#connectionInCreation = false;
        this.emit('_idle');
        this.emit('connection', conn);
        resolve(conn);
      })
      .catch((err) => {
        //if timeout is reached or authentication fail return error
        if (
          this.#closed ||
          (err.errno && (err.errno === 1524 || err.errno === 1045 || err.errno === 1698)) ||
          timeoutEnd < Date.now()
        ) {
          throw err;
        }
        setTimeout(this.#doCreateConnection.bind(this), 500, resolve, reject, timeoutEnd);
      });
  }

  #destroy(conn) {
    this.#endLeak(conn);
    delete this.#activeConnections[conn.threadId];

    conn.lastUse = Date.now();
    conn.forceEnd().catch(() => {});

    if (this.totalConnections() == 0) {
      this.#stopReaping();
    }

    this.emit('_validateSize');
  }

  #release(conn) {
    this.#endLeak(conn);
    delete this.#activeConnections[conn.threadId];

    conn.lastUse = Date.now();
    if (this.#closed) {
      conn.forceEnd().catch(() => {});
      this.emit('_validateSize');
    } else if (conn.isValid()) {
      this.emit('release', conn);

      this.#idleConnections.push(conn);
      process.nextTick(
        function () {
          this.emit('_idle');
        }.bind(this)
      );
    } else {
      this.emit('_validateSize');
    }
  }

  #checkLeak(conn) {
    conn.lastUse = Date.now();
    conn.leaked = false;
    conn.leakProcess = setTimeout(
      (conn) => {
        console.log(
          `Possible connection leak on thread ${conn.info.threadId} (connection not returned to pool since ${
            Date.now() - conn.lastUse
          }ms. Did connection.released() been implemented`
        );
        conn.leaked = true;
      },
      this.#opts.leakDetectionTimeout,
      conn
    );
  }

  #endLeak(conn) {
    if (conn.leakProcess) {
      clearTimeout(conn.leakProcess);
      conn.leakProcess = null;
      if (conn.leaked) {
        console.log(`Previous possible leak connection with thread ${conn.info.threadId} was returned to pool`);
      }
    }
  }

  /**
   * Permit to remove idle connection if unused for some time.
   */
  #startReaping() {
    if (!this.#unusedConnectionRemoverId && this.#opts.idleTimeout > 0) {
      this.#unusedConnectionRemoverId = setInterval(this.#reaper.bind(this), 500);
    }
  }

  #stopReaping() {
    if (this.#unusedConnectionRemoverId && this.totalConnections() == 0) {
      clearInterval(this.#unusedConnectionRemoverId);
    }
  }

  #reaper() {
    const idleTimeRemoval = Date.now() - this.#opts.idleTimeout * 1000;
    let maxRemoval = Math.max(0, this.#idleConnections.length - this.#opts.minimumIdle);
    while (maxRemoval > 0) {
      const conn = this.#idleConnections.peek();
      maxRemoval--;
      if (conn && conn.lastUse < idleTimeRemoval) {
        this.#idleConnections.shift();
        conn.forceEnd().catch(() => {});
        continue;
      }
      break;
    }

    if (this.totalConnections() == 0) {
      this.#stopReaping();
    }
    this.emit('_validateSize');
  }

  #shouldCreateMoreConnections() {
    return (
      !this.#connectionInCreation &&
      this.#idleConnections.length < this.#opts.minimumIdle &&
      this.totalConnections() < this.#opts.connectionLimit &&
      !this.#closed
    );
  }

  /**
   * Grow pool connections until reaching connection limit.
   */
  #sizeHandler() {
    if (this.#shouldCreateMoreConnections()) {
      this.#connectionInCreation = true;
      process.nextTick(
        function () {
          const timeoutEnd = Date.now() + this.#opts.initializationTimeout;
          new Promise((resolve, reject) => {
            this.#doCreateConnection(resolve, reject, timeoutEnd);
          })
            .then(() => {
              if (this.#shouldCreateMoreConnections()) {
                this.emit('_validateSize');
              }
              this.#startReaping();
            })
            .catch((err) => {
              this.#connectionInCreation = false;
              if (this.totalConnections() === 0) {
                const task = this.#requests.shift();
                if (task) {
                  this.#rejectTask(task, err);
                }
              } else if (!this.#closed) {
                console.error(`pool fail to create connection (${err.message})`);
              }

              //delay next try
              setTimeout(
                function () {
                  if (!this.#requests.isEmpty()) {
                    this.#sizeHandler();
                  }
                }.bind(this),
                500
              );
            });
        }.bind(this)
      );
    }
  }

  /**
   * Get a connection from pool / execute query
   *
   * @param sql       sql value (not mandatory)
   * @param values    sql parameter (not mandatory)
   * @param type      command type
   * @return {*}
   */
  #request(sql, values, type) {
    if (type && !sql) {
      // request for query/execute/batch without sql
      return Promise.reject(Errors.createError('sql parameter is mandatory', Errors.ER_POOL_UNDEFINED_SQL));
    }
    if (this.#closed) {
      return Promise.reject(Errors.createError('pool is closed', Errors.ER_POOL_ALREADY_CLOSED));
    }

    return this.#doAcquire().then(
      (conn) => {
        // connection is available. process task
        this.emit('acquire', conn);
        return this.#processTask(conn, sql, values, type);
      },
      () => {
        if (this.#closed) {
          return Promise.reject(
            Errors.createError('Cannot add request to pool, pool is closed', Errors.ER_POOL_ALREADY_CLOSED)
          );
        }

        // no idle connection available
        // create a new connection if limit is not reached
        this.emit('_validateSize');
        const request = new Request(sql, values, type, this.#opts);
        if (!this.#requestTimeoutId) {
          this.#requestTimeoutId = setTimeout(this.#requestTimeoutHandler.bind(this), this.#opts.acquireTimeout);
        }

        // stack request
        process.nextTick(
          function () {
            this.emit('enqueue');
          }.bind(this)
        );
        this.#requests.push(request);

        return request.promise;
      }
    );
  }

  /**
   * Launch next waiting task request if available connections.
   */
  #requestsHandler() {
    clearTimeout(this.#requestTimeoutId);
    this.#requestTimeoutId = null;
    const task = this.#requests.shift();
    if (task) {
      const conn = this.#idleConnections.shift();
      if (conn) {
        if (this.#opts.leakDetectionTimeout > 0) this.#checkLeak(conn);
        this.emit('acquire', conn);
        this.#activeConnections[conn.threadId] = conn;
        this.#processTask(conn, task.sql, task.values, task.type).then(task.resolver).catch(task.rejecter);
      } else {
        this.#requests.unshift(task);
      }
      this.#requestTimeoutHandler();
    }
  }

  #hasIdleConnection() {
    return !this.#idleConnections.isEmpty();
  }

  /**
   * Return an idle Connection.
   * If connection has not been used for some time ( minDelayValidation), validate connection status.
   *
   * @returns {Promise<Connection>} connection of null of no valid idle connection.
   */
  async #doAcquire() {
    if (!this.#hasIdleConnection() || this.#closed) throw null;

    const conn = this.#idleConnections.shift();
    this.#activeConnections[conn.threadId] = conn;
    if (this.#opts.minDelayValidation <= 0 || Date.now() - conn.lastUse > this.#opts.minDelayValidation) {
      try {
        await this.#ping(conn);
        if (this.#opts.leakDetectionTimeout > 0) this.#checkLeak(conn);
        return conn;
      } catch (err) {
        //eat
      }
    } else {
      //just check connection state
      if (conn.isValid()) {
        if (this.#opts.leakDetectionTimeout > 0) this.#checkLeak(conn);
        return conn;
      }
    }
    delete this.#activeConnections[conn.threadId];
    this.emit('_validateSize');
    return this.#doAcquire();
  }

  #requestTimeoutHandler() {
    //handle next Timer
    //console.log('diego requestTimeoutHandler ' + this.#requests.length);
    this.#requestTimeoutId = null;
    const currTime = Date.now();
    let task;
    while ((task = this.#requests.peekFront())) {
      //console.log('diego task found. timeout:' + (task.timeout - currTime));
      if (task.timeout <= currTime) {
        this.#requests.shift();
        task.reject(
          Errors.createError(
            `retrieve connection from pool timeout after ${Math.abs(
              Date.now() - (task.timeout - this.#opts.acquireTimeout)
            )}ms`,
            Errors.ER_GET_CONNECTION_TIMEOUT
          )
        );
      } else {
        //        console.log('diego new timeout timeout:' + (task.timeout - currTime));
        this.#requestTimeoutId = setTimeout(this.#requestTimeoutHandler.bind(this), task.timeout - currTime);
        return;
      }
    }
  }

  /**
   * Search info object of an existing connection. to know server type and version.
   * @returns information object if connection available.
   */
  #searchInfo() {
    let info = null;
    let conn = this.#idleConnections.get(0);

    if (conn == null) {
      conn = Object.keys(this.#activeConnections)[0];
    }

    if (conn != null) {
      info = conn.info;
    }
    return info;
  }

  #rejectTask(task, err) {
    clearTimeout(this.#requestTimeoutId);
    this.#requestTimeoutId = null;
    task.reject(err);
    this.#requestTimeoutHandler();
  }

  async #processTaskPromise(conn, sql, values, type) {
    if (sql) {
      const fct = type === QUERY ? conn.query : type === EXECUTE ? conn.execute : conn.batch;
      try {
        return await fct(sql, values);
      } finally {
        this.#release(conn);
      }
    }
    return conn;
  }

  async #createConnectionPromise() {
    const conn = new Connection(this.#opts.connOptions);
    await conn.connect();
    const pool = this;
    conn.forceEnd = conn.end;

    conn.release = function () {
      if (pool.#closed) {
        pool.#destroy(conn);
        return Promise.resolve();
      }
      if (pool.#opts.noControlAfterUse) {
        pool.#release(conn);
        return Promise.resolve();
      }
      //if server permit it, reset the connection, or rollback only if not
      // COM_RESET_CONNECTION exist since mysql 5.7.3 and mariadb 10.2.4
      // but not possible to use it with mysql waiting for https://bugs.mysql.com/bug.php?id=97633 correction.
      // and mariadb only since https://jira.mariadb.org/browse/MDEV-18281
      let revertFunction = conn.rollback;
      if (
        pool.#opts.resetAfterUse &&
        conn.info.isMariaDB() &&
        ((conn.info.serverVersion.minor === 2 && conn.info.hasMinVersion(10, 2, 22)) ||
          conn.info.hasMinVersion(10, 3, 13))
      ) {
        revertFunction = conn.reset;
      }
      return revertFunction()
        .then(() => {
          pool.#release(conn);
          return Promise.resolve();
        })
        .catch((err) => {
          //uncertain connection state.
          // discard it
          pool.#destroy(conn);
          return Promise.resolve();
        });
    };
    conn.end = conn.release;
    return conn;
  }

  #pingPromise(conn) {
    return conn.ping(this.#opts.pingTimeout);
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
    return Object.keys(this.#activeConnections).length;
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
    return Utils.escape(this.#opts.connOptions, this.#searchInfo(), value);
  }

  escapeId(value) {
    return Utils.escapeId(this.#opts.connOptions, this.#searchInfo(), value);
  }

  //*****************************************************************
  // promise methods
  //*****************************************************************

  /**
   * Retrieve a connection from pool.
   * Create a new one, if limit is not reached.
   * wait until acquireTimeout.
   *
   * @return {Promise}
   */
  #getConnectionPromise() {
    return this.#request();
  }

  /**
   * Execute a query on one connection from pool.
   *
   * @param sql   sql command
   * @param value parameter value of sql command (not mandatory)
   * @return {Promise}
   */
  #queryPromise(sql, value) {
    return this.#request(sql, value, QUERY);
  }

  /**
   * Execute command on one connection from pool.
   *
   * @param sql   sql command
   * @param value parameter value of sql command (not mandatory)
   * @return {Promise}
   */
  #executePromise(sql, value) {
    return this.#request(sql, value, EXECUTE);
  }

  /**
   * Execute a batch on one connection from pool.
   *
   * @param sql   sql command
   * @param value parameter value of sql command (not mandatory)
   * @return {Promise}
   */
  #batchPromise(sql, value) {
    return this.#request(sql, value, BATCH);
  }

  /**
   * Close all connection in pool
   *
   * @return Promise
   */
  #endPromise() {
    if (this.#closed) {
      return Promise.reject(Errors.createError('pool is already closed', Errors.ER_POOL_ALREADY_CLOSED));
    }
    this.#closed = true;
    clearInterval(this.#unusedConnectionRemoverId);

    //close unused connections
    const idleConnectionsEndings = [];
    let conn;
    while ((conn = this.#idleConnections.shift())) {
      idleConnectionsEndings.push(conn.forceEnd());
    }

    clearTimeout(this.#requestTimeoutId);
    this.#requestTimeoutId = null;

    //reject all waiting task
    if (!this.#requests.isEmpty()) {
      const err = Errors.createError('pool is ending, connection request aborted', Errors.ER_CLOSING_POOL);

      let task;
      while ((task = this.#requests.shift())) {
        task.reject(err);
      }
    }

    return Promise.all(idleConnectionsEndings);
  }

  //*****************************************************************
  // callback methods
  //*****************************************************************
  #emptyError(err) {}

  async #processTaskCallback(conn, sql, values, type) {
    if (sql) {
      const pool = this;
      return new Promise((resolve, reject) => {
        const fct = type === QUERY ? conn.query : type === EXECUTE ? conn.execute : conn.batch;
        fct(sql, values, (err, rows, fields) => {
          pool.#release(conn);
          if (err) {
            reject(err);
            return;
          }
          rows.meta = fields;
          resolve(rows);
        });
      });
    } else {
      return conn;
    }
  }

  async #createConnectionCallback() {
    const conn = new ConnectionCallback(this.#opts.connOptions);
    const pool = this;
    return new Promise(function (resolve, reject) {
      conn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          if (pool.#closed) {
            //discard connection
            conn.end((err) => {});
            reject(
              Errors.createFatalError(
                'Cannot create new connection to pool, pool closed',
                Errors.ER_ADD_CONNECTION_CLOSED_POOL
              )
            );
          } else {
            const initialEnd = conn.end;
            conn.forceEnd = () => {
              return new Promise(function (res, rej) {
                initialEnd((err) => {
                  if (err) {
                    rej(err);
                  } else {
                    res();
                  }
                });
              });
            };

            conn.release = function (cb) {
              if (pool.#closed) {
                pool.#destroy(conn);
                if (cb) cb();
                return;
              }
              if (pool.#opts.noControlAfterUse) {
                pool.#release(conn);
                if (cb) cb();
                return;
              }

              //if server permit it, reset the connection, or rollback only if not
              // COM_RESET_CONNECTION exist since mysql 5.7.3 and mariadb 10.2.4
              // but not possible to use it with mysql waiting for https://bugs.mysql.com/bug.php?id=97633 correction.
              // and mariadb only since https://jira.mariadb.org/browse/MDEV-18281
              let revertFunction = conn.rollback;
              if (
                pool.#opts.resetAfterUse &&
                conn.info.isMariaDB() &&
                ((conn.info.serverVersion.minor === 2 && conn.info.hasMinVersion(10, 2, 22)) ||
                  conn.info.hasMinVersion(10, 3, 13))
              ) {
                revertFunction = conn.reset;
              }
              revertFunction((errCall) => {
                if (errCall) {
                  //uncertain connection state.
                  pool.#destroy(conn);
                  if (cb) cb();
                  return;
                } else {
                  pool.#release(conn);
                }
                if (cb) cb();
              });
            };
            conn.end = conn.release;

            resolve(conn);
          }
        }
      });
    });
  }

  async #pingCallback(conn) {
    const pool = this;
    return new Promise((resolve, reject) => {
      conn.ping(pool.#opts.pingTimeout, (err) => {
        if (err) {
          reject(err);
        } else resolve();
      });
    });
  }

  #getConnectionCallback(callback) {
    this.#getConnectionPromise()
      .then((conn) => {
        if (callback) callback(null, conn);
      })
      .catch(callback || this.#emptyError);
  }

  #endCallback(callback) {
    this.#endPromise()
      .then(() => {
        if (callback) callback(null);
      })
      .catch(callback || this.#emptyError);
  }

  /**
   * Execute query using text protocol with callback emit columns/data/end/error
   * events to permit streaming big result-set
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  object / array of placeholder values (not mandatory)
   * @param cb      callback
   * @returns {Query} query
   */
  #queryCallback(sql, values, cb) {
    let _cb = cb,
      _values = values;

    if (typeof values === 'function') {
      _cb = values;
      _values = undefined;
    }

    this.#queryPromise(sql, _values)
      .then((rows) => {
        if (_cb) {
          const meta = rows.meta;
          delete rows.meta;
          _cb(null, rows, meta);
        }
      })
      .catch(_cb || this.#emptyError);
  }

  /**
   * Execute query using binary protocol with callback emit columns/data/end/error
   * events to permit streaming big result-set
   *
   * @param sql     sql parameter Object can be used to supersede default option.
   *                Object must then have sql property.
   * @param values  object / array of placeholder values (not mandatory)
   * @param cb      callback
   * @returns {Query} query
   */
  #executeCallback(sql, values, cb) {
    let _cb = cb,
      _values = values;

    if (typeof values === 'function') {
      _cb = values;
      _values = undefined;
    }

    this.#executePromise(sql, _values)
      .then((rows) => {
        if (_cb) {
          const meta = rows.meta;
          delete rows.meta;
          _cb(null, rows, meta);
        }
      })
      .catch(_cb || this.#emptyError);
  }

  #batchCallback(sql, values, cb) {
    let _values = values,
      _cb = cb;

    if (typeof values === 'function') {
      _cb = values;
      _values = undefined;
    }

    this.#batchPromise(sql, _values)
      .then((rows) => {
        if (_cb) _cb(null, rows, rows.meta);
      })
      .catch(_cb || this.#emptyError);
  }
}

class Request {
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

module.exports = Pool;
