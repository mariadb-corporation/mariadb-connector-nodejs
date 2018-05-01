"use strict";

const PoolClusterOptions = require("./config/pool-cluster-options.js");

function PoolCluster(args) {
  const opts = new PoolClusterOptions(args);

  this.add = (id, config) => {
    //TODO
  };

  this.end = callback => {
    //TODO
  };

  this.of = (pattern, selector) => {
    //TODO
  };

  this.remove = pattern => {
    //TODO
  };

  this.getConnection = (pattern, selector, cb) => {
    //TODO
  };
}

module.exports = PoolCluster;
