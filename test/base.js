//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import * as basePromise from '../promise.js';
import * as baseCallback from '../callback.js';
import Conf from './conf.js';
import Collation from '../lib/const/collations.js';

//*****************************************************************
// create test connection with default test options + param
//*****************************************************************
export function createConnection(opts) {
  const connOptionTemp = Object.assign({}, Conf.baseConfig, opts);
  return basePromise.createConnection(connOptionTemp);
}

export function isMaxscale(shareConn) {
  if (!globalThis.maxscaleVersion) {
    globalThis.maxscaleVersion = shareConn.info.maxscaleVersion;
    if (!maxscaleVersion) {
      // maxscale before 23.08
      return getEnv('DB_TYPE') === 'maxscale' || getEnv('srv') === 'maxscale';
    }
  }
  return true;
}

export function isMaxscaleMinVersion(shareConn, major, minor, patch) {
  if (!globalThis.maxscaleVersionJson) {
    const maxscaleVersion = shareConn.info.maxscaleVersion;
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
    globalThis.maxscaleVersionJson = {
      major: maxscaleMajor,
      minor: maxscaleMinor,
      patch: maxscalePatch
    };
  }

  let ver = globalThis.maxscaleVersionJson;
  return (
    ver.major > major ||
    (ver.major === major && ver.minor > minor) ||
    (ver.major === major && ver.minor === minor && ver.patch >= patch)
  );
}

export function createPool(opts) {
  const poolOptionTemp = Object.assign({}, Conf.baseConfig, opts);
  return basePromise.createPool(poolOptionTemp);
}

export function createCallbackConnection(opts) {
  let connOptionTemp = Object.assign({}, Conf.baseConfig, opts);
  return baseCallback.createConnection(connOptionTemp);
}

export function createPoolCallback(opts) {
  const poolOptionTemp = Object.assign({}, Conf.baseConfig, opts);
  return baseCallback.createPool(poolOptionTemp);
}

export function utf8Collation() {
  const collationString = Conf.baseConfig.collation;
  if (!collationString) return true;
  const collation = Collation.fromName(collationString.toUpperCase());
  return collation.charset === 'utf8' || collation.charset === 'utf8mb4';
}

export function getHostSuffix() {
  if (getEnv('LOCAL_DB') === 'local') {
    return "@'localhost'";
  }
  return "@'%'";
}

// Cross-platform environment variable getter
export function getEnv(key) {
  if (typeof Deno !== 'undefined' && Deno.env && Deno.env.get) {
    try {
      return Deno.env.get(key);
    } catch (e) {
      return undefined;
    }
  } else if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

export function isDeno() {
  if (typeof Deno !== 'undefined') {
    return true;
  }
  return false;
}
export function isWindows() {
  if (typeof Deno !== 'undefined') {
    return 'windows' === Deno.build.os;
  }
  return process.platform === 'win32';
}

export function isLocalDb() {
  const localEnv = getEnv('LOCAL_DB');
  return localEnv === 'local' || localEnv === undefined;
}
