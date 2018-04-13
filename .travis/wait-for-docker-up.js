"use strict";

const Connection = require("../src/connection");
const ConnOptions = require("../src/config/connection-options");
const Conf = require('../test/conf');

const connOptions = new ConnOptions(Conf.baseConfig);
let decrement = 20;
const callback = () => console.log("docker db server up");
const checkConnection = function() {
  decrement-=1;

  let conn = new Connection(connOptions);
  conn.on('error', (err) => {
    console.error("Error connecting docker server (connection try " + (20 - decrement) + " of 20)");
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
