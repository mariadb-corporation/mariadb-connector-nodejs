"use strict";

let Connection = require("./lib/connection");
let ConnOptions = require("./lib/config/connection-options");

module.exports.createConnection = function createConnection(opts) {
  try {
    const options = new ConnOptions(opts);
    const conn = new Connection(options);
    return conn.connect();
  } catch (err) {
    return Promise.reject(err);
  }
};
//
// exports.createPool = function createPool(config) {
//   //TODO
// };
//
// exports.createPoolCluster = function createPoolCluster(config) {
//   //TODO
// };
