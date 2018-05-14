"use strict";

const Connection = require("../lib/connection");
const ConnOptions = require("../lib/config/connection-options");
const Conf = require('../test/conf');

const connOptions = new ConnOptions(Conf.baseConfig);
let decrement = 30;
const callback = () => console.log("docker db server up");
const checkConnection = function() {
  decrement-=1;

  let conn = new Connection(connOptions);
  conn.connect((err) => {
    if (err) {
      console.error("Error connecting docker server (connection try " + (30 - decrement) + " of 30)");
      if (decrement === 0) {
        throw err;
      } else {
        setTimeout(checkConnection, 1000);
      }
    } else {
      conn.end();
      callback();
    }
  });

};
checkConnection();
