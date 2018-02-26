"use strict";

let Connection = require("../src/connection");
let ConnOptions = require("../src/config/connection-options");
let Conf = require("./conf");

const connOptions = new ConnOptions(Conf.baseConfig);

//*****************************************************************
// initialize share connection
//*****************************************************************
before("share initialization", function(done) {
  if (global.shareConn) {
    done();
  } else {
    let conn = new Connection(connOptions);
    conn.connect(() => done());
    global.shareConn = conn;
  }
});

after("share destroy", () => {
  if (shareConn) {
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
