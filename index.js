"use strict";

let Connection = require('./lib/connection.js');
let ConnOptions = require('./lib/config/connection-options.js');

module.exports.createConnection = function createConnection(opts) {
  try {
    let connOptions = new ConnOptions(opts);
    const conn = new Connection(connOptions);
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
