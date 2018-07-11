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
  this.end = async function() {
    if (taskRequestTimeout) clearTimeout(taskRequestTimeout);
    if (closed) {
      throw Errors.createError(
        "pool is closed",
        false,
        null,
        "HY000",
        Errors.ER_POOL_ALREADY_CLOSED,
        undefined,
        false
      );
    }

    //close unused connections
    const idleConnectionsEndings = [];
    let conn;
    while ((conn = idleConnections.shift())) {
      idleConnectionsEndings.push(conn.end());
    }

    closed = true;
    taskRequests.clear();
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
    return taskRequests.size();
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
      throw Errors.createError(
        "pool is closed",
        false,
        null,
        "HY000",
        Errors.ER_POOL_ALREADY_CLOSED,
        undefined,
        false
      );
    }

    try {
      //check for idle connection
      const conn = await getIdleValidConnection();
      if (sql) {
        return useConnection(conn, sql, values);
      }
      return conn;
    } catch (err) {
      //no idle connection available
      //create a new connection if limit is not reached
      if (!connectionInCreation && opts.connectionLimit > pool.totalConnections()) {
        addConnectionToPool(this);
      }

      //connections are all used, stack demand.
      return new Promise((resolve, reject) => {
        const task = {
          timeout: new Date().getTime() + opts.acquireTimeout,
          reject: reject,
          resolve: resolve,
          sql: sql,
          values: values
        };
        if (!taskRequestTimeout)
          taskRequestTimeout = setTimeout(rejectTimeout, opts.acquireTimeout);
        taskRequests.push(task);
      });
    }
  };

  const getIdleValidConnection = async function() {
    if (idleConnections.isEmpty()) throw null;

    const conn = idleConnections.shift();
    activeConnections[conn.threadId] = conn;
    if (
      opts.minDelayValidation <= 0 ||
      new Date().getTime() - conn.lastUse > opts.minDelayValidation
    ) {
      try {
        await conn.ping();
        return conn;
      } catch (err) {
        delete activeConnections[conn.threadId];
        return getIdleValidConnection();
      }
    } else {
      //just check connection state
      if (conn.isValid()) {
        return conn;
      } else {
        delete activeConnections[conn.threadId];
        return getIdleValidConnection();
      }
    }
  };

  const useConnection = async function(conn, sql, values) {
    if (sql) {
      try {
        const res = await conn.query(sql, values);
        conn.end().catch(() => {});
        return res;
      } catch (err) {
        conn.end().catch(() => {});
        throw err;
      }
    } else {
      conn.lastUse = new Date().getTime();
      return conn;
    }
  };

  /**
   * Task request timeout handler
   * @param task
   */
  const rejectTimeout = () => {
    taskRequestTimeout = null;
    const task = taskRequests.shift(); //remove from queue
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

  this.activatePool = function() {
    addConnectionToPool(this);
  };

  /**
   * Add connection to pool.
   */
  const addConnectionToPool = async function(pool) {
    connectionInCreation = true;
    const conn = new Connection(opts.connOptions);
    try {
      await conn.connect();
      if (closed) {
        //discard connection
        conn.end().catch(() => {});
      } else {
        overlayNewConnection(conn, pool);
      }
    } catch (err) {
      connectionInCreation = false;
      checkPoolSize.apply(pool);
    }
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
    conn.end = async () => {
      try {
        await conn.rollback();
        delete activeConnections[conn.threadId];
        if (closed) {
          initialEndFct().catch(() => {});
        } else {
          idleConnections.push(conn);
          process.nextTick(handleTaskQueue.bind(self));
        }
        return;
      } catch (err) {
        //uncertain connection state.
        // discard it
        delete activeConnections[conn.threadId];
        initialEndFct().catch(() => {});
        checkPoolSize.apply(self);
      }
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
      process.nextTick(addConnectionToPool, this);
    }
  };

  /**
   * Launch next waiting task request if available connections.
   */
  const handleTaskQueue = function() {
    if (taskRequestTimeout) clearTimeout(taskRequestTimeout);
    const task = taskRequests.shift();
    if (task) {
      const conn = idleConnections.shift();
      activeConnections[conn.threadId] = conn;

      resetTimeoutToNextTask();

      //handle task
      if (task.sql) {
        conn
          .query(task.sql, task.values)
          .then(res => {
            conn.lastUse = new Date().getTime();
            conn.end().catch(err => {});
            task.resolve(res);
          })
          .catch(err => {
            conn.end().catch(err => {});
            task.reject(err);
          });
      } else {
        conn.lastUse = new Date().getTime();
        task.resolve(conn);
      }
    }
  };

  const resetTimeoutToNextTask = () => {
    //handle next Timer
    const currTime = new Date().getTime();
    let nextTask;
    while ((nextTask = taskRequests.peekFront()) && nextTask.timeout < currTime) {
      rejectTimeout();
    }
    if (nextTask) taskRequestTimeout = setTimeout(rejectTimeout, nextTask.timeout - currTime);
  };

  const opts = options;
  let closed = false;
  let connectionInCreation = false;

  const idleConnections = new Queue();
  const activeConnections = {};

  const taskRequests = new Queue();
  let taskRequestTimeout;
}

module.exports = Pool;
