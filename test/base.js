"use strict";

const Connection = require("../src/connection");
const ConnOptions = require("../src/config/connection-options");
const Conf = require("./conf");

const connOptions = new ConnOptions(Conf.baseConfig);

//*****************************************************************
// initialize share connection
//*****************************************************************
before("share initialization", done => {
  if (global.shareConn) {
    done();
  } else {
    let conn = new Connection(connOptions);
    conn.connect(err => {
      if (err) {
        done(err);
      } else {
        done();
      }
    });
    global.shareConn = conn;
  }
});

after("share destroy", () => {
  if (shareConn && shareConn._connected) {
    shareConn.end(() => (global.shareConn = undefined));
  }
});

//*****************************************************************
// create test connection with default test options + param
//*****************************************************************
module.exports.createConnection = function createConnection(opts) {
  let connOptionTemp = Object.assign({}, Conf.baseConfig, opts);
  return new Connection(new ConnOptions(connOptionTemp));
};
