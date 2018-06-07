"use strict";

const basePromise = require("../index");
const Conf = require('../test/conf');

let decrement = 30;

const checkConnection = function() {
  decrement-=1;

  basePromise.createConnection(Conf.baseConfig)
    .then((conn) => {
      conn.end();
      console.log("docker db server up");
    })
    .catch((err) => {
        console.error("Error connecting docker server (connection try " + (30 - decrement) + " of 30)");
        if (decrement === 0) {
          throw err;
        } else {
          setTimeout(checkConnection, 1000);
        }
      }
    )
};
checkConnection();
