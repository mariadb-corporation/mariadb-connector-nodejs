'use strict';

const { EventEmitter } = require('events');

const Queue = require('denque');
const Errors = require('./misc/errors');
const Utils = require('./misc/utils');
const Connection = require('./connection');

class Pool extends EventEmitter {
  #opts;
  #closed = false;
  #connectionInCreation = false;
  #idleConnections = new Queue();
  #activeConnections = {};
  #requests = new Queue();
  #unusedConnectionRemoverId;
  #requestTimeoutId;
  #connErrorNumber = 0;
  _sizeHandlerTimeout;

  constructor(options) {
    super();
    this.#opts = options;

    this.on('_idle', this._requestsHandler);
    this.on('validateSize', this._sizeHandler);

    this._sizeHandler();
  }

  //*****************************************************************
  // pool automatic handlers
  //*****************************************************************

  _doCreateConnection(resolve, reject, timeoutEnd) {
    this._createConnection()
      .then((conn) => {
        if (this.#closed) {
          conn.forceEnd(
            () => {},
            () => {}
          );
          throw new Errors.createFatalError(
            'Cannot create new connection to pool, pool closed',
            Errors.ER_ADD_CONNECTION_CLOSED_POOL
          );
        }

        conn.lastUse = Date.now();
        const nativeDestroy = conn.destroy.bind(conn);
        const pool = this;

        conn.destroy = function () {
          pool._endLeak(conn);
          delete pool.#activeConnections[conn.threadId];
          nativeDestroy();
          pool.emit('validateSize');
        };

        conn.once('error', function () {
          let idx = 0;
          let currConn;
          pool._endLeak(conn);
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
          setTimeout(() => {
            if (!pool.#requests.isEmpty()) {
              pool._sizeHandler();
            }
          }, 0);
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
          reject(err);
          return;
        }
        setTimeout(this._doCreateConnection.bind(this), 500, resolve, reject, timeoutEnd);
      });
  }

  _destroy(conn) {
    this._endLeak(conn);
    delete this.#activeConnections[conn.threadId];

    conn.lastUse = Date.now();
    conn.forceEnd(
      () => {},
      () => {}
    );

    if (this.totalConnections() == 0) {
      this._stopReaping();
    }

    this.emit('validateSize');
  }

  release(conn) {
    this._endLeak(conn);
    delete this.#activeConnections[conn.threadId];

    conn.lastUse = Date.now();
    if (this.#closed) {
      conn.forceEnd(
        () => {},
        () => {}
      );
      this.emit('validateSize');
    } else if (conn.isValid()) {
      this.emit('release', conn);

      this.#idleConnections.push(conn);
      process.nextTick(
        function () {
          this.emit('_idle');
        }.bind(this)
      );
    } else {
      this.emit('validateSize');
    }
  }

  _checkLeak(conn) {
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

  _endLeak(conn) {
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
  _startReaping() {
    if (!this.#unusedConnectionRemoverId && this.#opts.idleTimeout > 0) {
      this.#unusedConnectionRemoverId = setInterval(this._reaper.bind(this), 500);
    }
  }

  _stopReaping() {
    if (this.#unusedConnectionRemoverId && this.totalConnections() == 0) {
      clearInterval(this.#unusedConnectionRemoverId);
    }
  }

  _reaper() {
    const idleTimeRemoval = Date.now() - this.#opts.idleTimeout * 1000;
    let maxRemoval = Math.max(0, this.#idleConnections.length - this.#opts.minimumIdle);
    while (maxRemoval > 0) {
      const conn = this.#idleConnections.peek();
      maxRemoval--;
      if (conn && conn.lastUse < idleTimeRemoval) {
        this.#idleConnections.shift();
        conn.forceEnd(
          () => {},
          () => {}
        );
        continue;
      }
      break;
    }

    if (this.totalConnections() == 0) {
      this._stopReaping();
    }
    this.emit('validateSize');
  }

  _shouldCreateMoreConnections() {
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
  _sizeHandler() {
    if (this._shouldCreateMoreConnections() && !this._sizeHandlerTimeout) {
      this.#connectionInCreation = true;
      setImmediate(
        function () {
          const timeoutEnd = Date.now() + this.#opts.initializationTimeout;
          new Promise((resolve, reject) => {
            this._doCreateConnection(resolve, reject, timeoutEnd);
          })
            .then(() => {
              this.#connErrorNumber = 0;
              if (this._shouldCreateMoreConnections()) {
                this.emit('validateSize');
              }
              this._startReaping();
            })
            .catch((err) => {
              this.#connectionInCreation = false;
              if (this.totalConnections() === 0) {
                const task = this.#requests.shift();
                if (task) {
                  this._rejectTask(task, err);
                }
              } else if (!this.#closed) {
                console.error(`pool fail to create connection (${err.message})`);
              }

              //delay next try
              this._sizeHandlerTimeout = setTimeout(
                function () {
                  this._sizeHandlerTimeout = null;
                  if (!this.#requests.isEmpty()) {
                    this._sizeHandler();
                  }
                }.bind(this),
                Math.min(++this.#connErrorNumber * 500, 10000)
              );
            });
        }.bind(this)
      );
    }
  }

  /**
   * Launch next waiting task request if available connections.
   */
  _requestsHandler() {
    clearTimeout(this.#requestTimeoutId);
    this.#requestTimeoutId = null;
    const request = this.#requests.shift();
    if (request) {
      const conn = this.#idleConnections.shift();
      if (conn) {
        if (this.#opts.leakDetectionTimeout > 0) this._checkLeak(conn);
        this.emit('acquire', conn);
        this.#activeConnections[conn.threadId] = conn;
        request.resolver(conn);
      } else {
        this.#requests.unshift(request);
      }
      this._requestTimeoutHandler();
    }
  }

  _hasIdleConnection() {
    return !this.#idleConnections.isEmpty();
  }

  /**
   * Return an idle Connection.
   * If connection has not been used for some time ( minDelayValidation), validate connection status.
   *
   * @returns {Promise<Connection>} connection of null of no valid idle connection.
   */
  _doAcquire() {
    if (!this._hasIdleConnection() || this.#closed) return Promise.reject();

    const conn = this.#idleConnections.shift();
    this.#activeConnections[conn.threadId] = conn;

    if (this.#opts.minDelayValidation <= 0 || Date.now() - conn.lastUse > this.#opts.minDelayValidation) {
      return new Promise(conn.ping.bind(conn, this.#opts.pingTimeout)).then(
        () => {
          if (this.#opts.leakDetectionTimeout > 0) this._checkLeak(conn);
          return Promise.resolve(conn);
        },
        () => {
          delete this.#activeConnections[conn.threadId];
          this.emit('validateSize');
          return this._doAcquire();
        }
      );
    } else {
      //just check connection state
      if (conn.isValid()) {
        if (this.#opts.leakDetectionTimeout > 0) this._checkLeak(conn);
        return Promise.resolve(conn);
      }
    }
  }

  _requestTimeoutHandler() {
    //handle next Timer
    this.#requestTimeoutId = null;
    const currTime = Date.now();
    let request;
    while ((request = this.#requests.peekFront())) {
      if (request.timeout <= currTime) {
        this.#requests.shift();
        request.reject(
          Errors.createError(
            `retrieve connection from pool timeout after ${Math.abs(
              Date.now() - (request.timeout - this.#opts.acquireTimeout)
            )}ms`,
            Errors.ER_GET_CONNECTION_TIMEOUT
          )
        );
      } else {
        this.#requestTimeoutId = setTimeout(this._requestTimeoutHandler.bind(this), request.timeout - currTime);
        return;
      }
    }
  }

  /**
   * Search info object of an existing connection. to know server type and version.
   * @returns information object if connection available.
   */
  _searchInfo() {
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

  _rejectTask(task, err) {
    clearTimeout(this.#requestTimeoutId);
    this.#requestTimeoutId = null;
    task.reject(err);
    this._requestTimeoutHandler();
  }

  async _createConnection() {
    const conn = new Connection(this.#opts.connOptions);
    await conn.connect();
    const pool = this;
    conn.forceEnd = conn.end;
    conn.release = function (resolve, release) {
      if (pool.#closed || !conn.isValid()) {
        pool._destroy(conn);
        resolve();
        return;
      }
      if (pool.#opts.noControlAfterUse) {
        pool.release(conn);
        resolve();
        return;
      }
      //if server permit it, reset the connection, or rollback only if not
      // COM_RESET_CONNECTION exist since mysql 5.7.3 and mariadb 10.2.4
      // but not possible to use it with mysql waiting for https://bugs.mysql.com/bug.php?id=97633 correction.
      // and mariadb only since https://jira.mariadb.org/browse/MDEV-18281
      let revertFunction;
      if (
        pool.#opts.resetAfterUse &&
        conn.info.isMariaDB() &&
        ((conn.info.serverVersion.minor === 2 && conn.info.hasMinVersion(10, 2, 22)) ||
          conn.info.hasMinVersion(10, 3, 13))
      ) {
        revertFunction = conn.reset.bind(conn);
      } else revertFunction = conn.changeTransaction.bind(conn, 'ROLLBACK');

      new Promise(revertFunction).then(pool.release.bind(pool, conn), pool._destroy.bind(pool, conn)).finally(resolve);
    };
    conn.end = conn.release;
    return conn;
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
    return Utils.escape(this.#opts.connOptions, this._searchInfo(), value);
  }

  escapeId(value) {
    return Utils.escapeId(this.#opts.connOptions, this._searchInfo(), value);
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
  getConnection() {
    if (this.#closed) {
      return Promise.reject(Errors.createError('pool is closed', Errors.ER_POOL_ALREADY_CLOSED));
    }

    return this._doAcquire().then(
      (conn) => {
        // connection is available. process task
        this.emit('acquire', conn);
        return conn;
      },
      () => {
        if (this.#closed) {
          throw Errors.createError('Cannot add request to pool, pool is closed', Errors.ER_POOL_ALREADY_CLOSED);
        }

        // no idle connection available
        // create a new connection if limit is not reached
        this.emit('validateSize');
        return new Promise(
          function (resolver, rejecter) {
            if (!this.#requestTimeoutId) {
              this.#requestTimeoutId = setTimeout(this._requestTimeoutHandler.bind(this), this.#opts.acquireTimeout);
            }
            // stack request
            setImmediate(this.emit.bind(this, 'enqueue'));
            this.#requests.push(new Request(Date.now() + this.#opts.acquireTimeout, resolver, rejecter));
          }.bind(this)
        );
      }
    );
  }

  /**
   * Close all connection in pool
   *
   * @return Promise
   */
  end() {
    if (this.#closed) {
      return Promise.reject(Errors.createError('pool is already closed', Errors.ER_POOL_ALREADY_CLOSED));
    }
    this.#closed = true;
    clearInterval(this.#unusedConnectionRemoverId);
    clearInterval(this._sizeHandlerTimeout);

    //close unused connections
    const idleConnectionsEndings = [];
    let conn;
    while ((conn = this.#idleConnections.shift())) {
      idleConnectionsEndings.push(new Promise(conn.forceEnd.bind(conn)));
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
}

class Request {
  constructor(timeout, resolver, rejecter) {
    this.timeout = timeout;
    this.resolver = resolver;
    this.rejecter = rejecter;
  }

  reject(err) {
    process.nextTick(this.rejecter, err);
  }
}

module.exports = Pool;
