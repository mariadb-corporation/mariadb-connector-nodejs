"use strict";

const EventEmitter = require("events");
const PoolOptions = require("./config/pool-options.js");

class Pool extends EventEmitter {
  constructor(args) {
    super();
    this.opts = new PoolOptions(args);
    //TODO
  }

  getConnection(cb) {
    //TODO
  }

  acquireConnection(connection, cb) {
    //TODO
  }

  releaseConnection(connection) {
    //TODO
  }

  end(cb) {
    //TODO
  }

  query(sql, values, cb) {
    //TODO
  }
}

module.exports = Pool;
