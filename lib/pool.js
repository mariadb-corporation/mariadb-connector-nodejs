"use strict";

const Connection = require("./connection");
const Queue = require("denque");
const Errors = require("./misc/errors");

function Pool(options) {
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
    return handleRequest(this, sql, value);
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

    //close unused connections
    const idleConnectionsEndings = [];
    let conn;
    while ((conn = idleConnections.shift())) {
      idleConnectionsEndings.push(conn.end());
    }

    closed = true;
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
  this.connectionRequests = function() {
    return connectionRequests.size();
  };

  //*****************************************************************
  // internal methods
  //*****************************************************************

  /**
   * Get a connection from pool / execute query
   *
   * @param pool    current pool
   * @param sql     sql value (not mandatory)
   * @param values  sql parameter (not mandatory)
   * @return {*}
   */
  const handleRequest = async function(pool, sql, values) {
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

    //check for free connection in pool
    let conn;
    while ((conn = idleConnections.shift())) {
      activeConnections[conn.threadId] = conn;
      if (
        opts.minDelayValidation <= 0 ||
        new Date().getTime() - conn.lastUse > opts.minDelayValidation
      ) {
        try {
          await conn.ping();
          return useConnection(conn, sql, values);
        } catch (err) {
          delete activeConnections[conn.threadId];
        }
      } else {
        //just check connection state
        if (conn.isValid()) {
          return useConnection(conn, sql, values);
        } else {
          delete activeConnections[conn.threadId];
        }
      }
    }

    //create a new connection if limit is not reached
    if (!connectionInCreation && opts.connectionLimit > pool.totalConnections()) {
      addConnectionToPool();
    }

    //connections are all used, stack demand.
    return new Promise((resolve, reject) => {
      const task = {
        timeout: null,
        reject: reject,
        resolve: resolve,
        sql: sql,
        values: values
      };
      task.timeout = setTimeout(rejectTimeout, opts.acquireTimeout, task);
      connectionRequests.push(task);
    });
  };

  const useConnection = function(conn, sql, values) {
    if (sql) {
      return conn
        .query(sql, values)
        .then(res => {
          conn.release().catch(() => {});
          return Promise.resolve(res);
        })
        .catch(err => {
          conn.release().catch(() => {});
          return Promise.reject(err);
        });
    } else {
      conn.lastUse = new Date().getTime();
      return Promise.resolve(conn);
    }
  };

  /**
   * Task request timeout handler
   * @param task
   */
  const rejectTimeout = task => {
    task.timeout = null;
    connectionRequests.shift(); //remove from queue
    const err = Errors.createError(
      "retrieve connection from pool timeout",
      false,
      null,
      "HY000",
      Errors.ER_GET_CONNECTION_TIMEOUT,
      undefined,
      false
    );
    task.reject(err);
  };

  /**
   * Add connection to pool.
   */
  const addConnectionToPool = function() {
    connectionInCreation = true;
    const self = this;
    const conn = new Connection(opts.connOptions);
    conn
      .connect()
      .then(() => {
        if (closed) {
          //discard connection
          conn.end().catch(() => {});
        } else {
          overlayNewConnection(conn, self);
        }
      })
      .catch(err => {
        connectionInCreation = false;
        checkPoolSize.apply(self);
      });
  };

  /**
   * Wrapping new connection
   *
   * @param conn  new connection
   * @param self  current pool
   */
  const overlayNewConnection = function(conn, self) {
    idleConnections.push(conn);
    conn.lastUse = new Date().getTime();
    const initialEndFct = conn.end;
    conn.end = () => {
      return conn
        .rollback()
        .then(() => {
          delete activeConnections[conn.threadId];
          if (closed) {
            initialEndFct().catch(() => {});
          } else {
            idleConnections.push(conn);
            handleTaskQueue.apply(self);
          }
          return Promise.resolve();
        })
        .catch(err => {
          //uncertain connection state.
          // discard it
          delete activeConnections[conn.threadId];
          initialEndFct().catch(() => {});
          checkPoolSize.apply(self);
          return Promise.reject(err);
        });
    };
    //for mysql compatibility
    conn.release = conn.end;

    const initialDestroyFct = conn.destroy;
    conn.destroy = () => {
      delete activeConnections[conn.threadId];
      initialDestroyFct();
      checkPoolSize.apply(self);
    };

    //Connection error
    // -> evict connection from pool
    conn.on("error", err => {
      let idx = 0;
      let currConn;
      delete activeConnections[conn.threadId];
      while ((currConn = idleConnections.peekAt(idx)) != undefined) {
        if (currConn === conn) {
          idleConnections.removeOne(idx);
          break;
        }
        idx++;
      }
      checkPoolSize.apply(self);
    });
    connectionInCreation = false;
    checkPoolSize.apply(self);
    handleTaskQueue.apply(self);
  };

  /**
   * Grow pool connections until reaching connection limit.
   */
  const checkPoolSize = function() {
    if (!connectionInCreation && this.totalConnections() < opts.connectionLimit) {
      connectionInCreation = true;
      process.nextTick(addConnectionToPool.bind(this));
    }
  };

  /**
   * Launch next waiting task request if available connections.
   */
  const handleTaskQueue = function() {
    const task = connectionRequests.peekFront();
    if (task) {
      //check for free connection in pool
      const conn = idleConnections.shift();
      if (conn) {
        activeConnections[conn.threadId] = conn;
        clearTimeout(task.timeout);
        task.timeout = null;
        //removed from queue
        connectionRequests.shift();
        if (task.sql) {
          conn
            .query(task.sql, task.values)
            .then(res => {
              conn.lastUse = new Date().getTime();
              conn.release().catch(err => {});
              task.resolve(res);
            })
            .catch(err => {
              conn.release().catch(err => {});
              task.reject(err);
            });
        } else {
          conn.lastUse = new Date().getTime();
          task.resolve(conn);
        }
      }
    }
  };

  const opts = options;
  let closed = false;
  let connectionInCreation = false;

  const idleConnections = new Queue();
  const activeConnections = {};
  const connectionRequests = new Queue();

  //create initial connection
  addConnectionToPool.apply(this);
}

module.exports = Pool;
