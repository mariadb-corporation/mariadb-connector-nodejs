'use strict';

const basePromise = require('../promise');
const baseCallback = require('../callback');
const Conf = require('./conf');
const Collations = require('../lib/const/collations.js');
const { assert } = require('chai');

//*****************************************************************
// initialize share connection
//*****************************************************************
before('share initialization', async () => {
  if (!global.shareConn) {
    try {
      global.shareConn = await basePromise.createConnection(Conf.baseConfig);
    } catch (e) {
      // retry
      global.shareConn = await basePromise.createConnection(Conf.baseConfig);
    }
  }
});

after('share destroy', async () => {
  if (shareConn) {
    try {
      await shareConn.end();
      global.shareConn = undefined;
    } catch (err) {
      global.shareConn = undefined;
      console.log('Error when ending shared connection : ' + err.message);
    }
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

const isXpandFct = () => {
  return process.env.srv === 'xpand' || global.shareConn.serverVersion().includes('Xpand');
};
module.exports.isXpand = isXpandFct;
