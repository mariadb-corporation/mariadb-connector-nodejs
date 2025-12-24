//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

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

module.exports.isMaxscale = function isMaxscale() {
  if (!global.maxscaleVersion) {
    const maxscaleVersion = global.shareConn.info.maxscaleVersion;
    if (!maxscaleVersion) {
      // maxscale before 23.08
      return process.env.DB_TYPE === 'maxscale' || process.env.srv === 'maxscale';
    }
  }
  return true;
};

module.exports.isMaxscaleMinVersion = function isMaxscaleMinVersion(major, minor, patch) {
  if (!global.maxscaleVersion) {
    const maxscaleVersion = global.shareConn.info.maxscaleVersion;
    if (!maxscaleVersion) {
      // maxscale before 23.08
      return false;
    }
    let car;
    let offset = 0;
    let type = 0;
    let val = 0;
    let maxscaleMajor = 0;
    let maxscaleMinor = 0;
    let maxscalePatch = 0;
    for (; offset < maxscaleVersion.length; offset++) {
      car = maxscaleVersion.charCodeAt(offset);
      if (car < 48 || car > 57) {
        switch (type) {
          case 0:
            maxscaleMajor = val;
            break;
          case 1:
            maxscaleMinor = val;
            break;
          case 2:
            maxscalePatch = val;
            return;
        }
        type++;
        val = 0;
      } else {
        val = val * 10 + car - 48;
      }
    }
    //serverVersion finished by number like "5.5.57", assign patchVersion
    if (type === 2) maxscalePatch = val;
    global.maxscaleVersion = {
      major: maxscaleMajor,
      minor: maxscaleMinor,
      patch: maxscalePatch
    };
  }

  let ver = global.maxscaleVersion;
  return (
    ver.major > major ||
    (ver.major === major && ver.minor > minor) ||
    (ver.major === major && ver.minor === minor && ver.patch >= patch)
  );
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

module.exports.getHostSuffix = function getHostSuffix() {
  if (process.env.LOCAL_DB === 'local') {
    return "@'localhost'";
  }
  return "@'%'";
};

module.exports.isLocalDb = function isLocalDb() {
  return process.env.LOCAL_DB === 'local' || localEnv === undefined;
};
