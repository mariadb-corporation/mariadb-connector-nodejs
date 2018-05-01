"use strict";

const EventEmitter = require("events");
const PoolOptions = require("./config/pool-options.js");

function Pool(args) {
  const opts = new PoolOptions(args);

  this.getConnection = function(cb) {
    //TODO
  };

  this.acquireConnection = function(connection, cb) {
    //TODO
  };

  this.releaseConnection = function(connection) {
    //TODO
  };

  this.end = function(cb) {
    //TODO
  };

  this.query = function(sql, values, cb) {
    //TODO
  };
}

module.exports = Pool;
