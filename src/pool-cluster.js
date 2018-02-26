"use strict";

const EventEmitter = require("events");
const PoolClusterOptions = require("./config/pool-cluster-options.js");

class PoolCluster extends EventEmitter {
  constructor(args) {
    super();
    this.opts = new PoolClusterOptions(args);
    //TODO
  }

  add(id, config) {
    //TODO
  }

  end(callback) {
    //TODO
  }

  of(pattern, selector) {
    //TODO
  }

  remove(pattern) {
    //TODO
  }

  getConnection(pattern, selector, cb) {
    //TODO
  }
}

module.exports = PoolCluster;
