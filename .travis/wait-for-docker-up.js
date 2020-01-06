"use strict";

const basePromise = require("../promise");
const Conf = require('../test/conf');

let decrement = 60;

const checkConnection = function() {
  decrement-=1;

  basePromise.createConnection(Conf.baseConfig)
    .then((conn) => {
      conn.end();
      console.log("docker db server up");
    })
    .catch((err) => {
        console.error("Error connecting docker server (connection try " + (60 - decrement) + " of 60)");
        if (decrement === 0) {
          throw err;
        } else {
          setTimeout(checkConnection, 1000);
        }
      }
    )
};
checkConnection();
