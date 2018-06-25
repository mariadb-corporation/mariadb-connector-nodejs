"use strict";

const basePromise = require("../lib/index");
const baseCallback = require("../lib/callback");
const Conf = require("./conf");

//*****************************************************************
// initialize share connection
//*****************************************************************
before("share initialization", done => {
  if (global.shareConn) {
    done();
  } else {
    basePromise
      .createConnection(Conf.baseConfig)
      .then(conn => {
        global.shareConn = conn;
        done();
      })
      .catch(done);
  }
});

after("share destroy", () => {
  if (shareConn) {
    shareConn
      .end()
      .then(() => (global.shareConn = undefined))
      .catch(err => {
        global.shareConn = undefined;
        console.log("Error when ending shared connection : " + err.message);
      });
  }
});

//*****************************************************************
// create test connection with default test options + param
//*****************************************************************
module.exports.createConnection = function createConnection(opts) {
  let connOptionTemp = Object.assign({}, Conf.baseConfig, opts);
  return basePromise.createConnection(connOptionTemp);
};

module.exports.createCallbackConnection = function createConnection(opts) {
  let connOptionTemp = Object.assign({}, Conf.baseConfig, opts);
  return baseCallback.createConnection(connOptionTemp);
};
