"use strict";

const Connection = require("../src/connection");
const ConnOptions = require("../src/config/connection-options");
const Conf = require('../test/conf');

const connOptions = new ConnOptions(Conf.baseConfig);
let decrement = 20;
var callback = () => console.log("connected to docker server");
const checkConnection = function() {
  decrement-=1;

  let conn = new Connection(connOptions);
  conn.on('error', (err) => {
    console.error("Error connecting docker server (connection:" + decrement + ")");
    if (decrement === 0) {
      throw err;
    } else {
      setTimeout(checkConnection, 1000);
    }
  });
  conn.on('connect', () => {
    conn.end();
    callback();
  });

};
checkConnection();
