'use strict';

const basePromise = require('../promise');
const baseCallback = require('../callback');
const Conf = require('./conf');
const Collations = require('../lib/const/collations.js');
const { assert } = require('chai');

//*****************************************************************
// initialize share connection
//*****************************************************************
before('share initialization', (done) => {
  if (global.shareConn) {
    done();
  } else {
    basePromise
      .createConnection(Conf.baseConfig)
      .then((conn) => {
        global.shareConn = conn;
        done();
      })
      .catch(done);
  }
});

after('share destroy', () => {
  if (shareConn) {
    shareConn
      .end()
      .then(() => (global.shareConn = undefined))
      .catch((err) => {
        global.shareConn = undefined;
        console.log('Error when ending shared connection : ' + err.message);
      });
  }
});

//*****************************************************************
// create test connection with default test options + param
//*****************************************************************
module.exports.createConnection = function createConnection(opts) {
  const connOptionTemp = Object.assign({}, Conf.baseConfig, opts);
  return basePromise.createConnection(connOptionTemp);
};

module.exports.createPool = (opts) => {
  const poolOptionTemp = Object.assign({}, Conf.baseConfig, opts);
  return basePromise.createPool(poolOptionTemp);
};

module.exports.createCallbackConnection = function createConnection(opts) {
  let connOptionTemp = Object.assign({}, Conf.baseConfig, opts);
  return baseCallback.createConnection(connOptionTemp);
};

module.exports.createPoolCallback = (opts) => {
  const poolOptionTemp = Object.assign({}, Conf.baseConfig, opts);
  return baseCallback.createPool(poolOptionTemp);
};

module.exports.utf8Collation = () => {
  const collationString = Conf.baseConfig.collation;
  if (!collationString) return true;
  const collation = Collations.fromName(collationString.toUpperCase());
  return collation.charset === 'utf8' || collation.charset === 'utf8mb4';
};
