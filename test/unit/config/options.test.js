//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import * as basePromise from '../../../promise.js';
import * as baseCallback from '../../../callback.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';

describe('test options', () => {
  test('default options', function () {
    const defaultOpts = basePromise.defaultOptions({ timezone: '+00:00', ssl: true });
    const defaultOptsCall = baseCallback.defaultOptions({ timezone: '+00:00', ssl: true });
    const expected = {
      host: 'localhost',
      port: 3306,
      fullResult: undefined,
      user: process.env.USERNAME,
      password: undefined,
      database: undefined,
      prepareCacheLength: 256,
      collation: undefined,
      initSql: undefined,
      connectTimeout: 1000,
      connectAttributes: false,
      compress: false,
      rsaPublicKey: undefined,
      cachingRsaPublicKey: undefined,
      restrictedAuth: undefined,
      allowPublicKeyRetrieval: false,
      forceVersionCheck: false,
      maxAllowedPacket: undefined,
      permitConnectionWhenExpired: false,
      pipelining: true,
      timezone: '+00:00',
      bitOneIsBoolean: true,
      socketPath: undefined,
      sessionVariables: undefined,
      ssl: true,
      infileStreamFactory: undefined,
      queryTimeout: 0,
      socketTimeout: 0,
      debug: false,
      debugCompress: false,
      debugLen: 256,
      trace: false,
      checkDuplicate: true,
      checkNumberRange: false,
      dateStrings: false,
      foundRows: true,
      logger: {
        error: null,
        network: null,
        query: null,
        warning: console.log
      },
      logParam: true,
      metaAsArray: false,
      metaEnumerable: false,
      multipleStatements: false,
      namedPlaceholders: false,
      nestTables: undefined,
      autoJsonMap: true,
      arrayParenthesis: false,
      permitSetMultiParamEntries: false,
      rowsAsArray: false,
      decimalAsNumber: false,
      insertIdAsNumber: false,
      typeCast: undefined,
      stream: undefined,
      bigIntAsNumber: false,
      bulk: true,
      keepEof: false,
      jsonStrings: false,
      keepAliveDelay: undefined,
      permitLocalInfile: false,
      bigNumberStrings: false,
      supportBigNumbers: false,
      permitRedirect: true
    };
    assert.deepEqual(expected, defaultOpts);
    assert.deepEqual(expected, defaultOptsCall);
  });
});
