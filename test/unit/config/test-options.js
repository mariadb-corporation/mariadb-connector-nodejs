//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

const { assert } = require('chai');
const basePromise = require('../../../promise');
const baseCallback = require('../../../callback');
const Collations = require('../../../lib/const/collations.js');

describe('test options', () => {
  it('default options', function () {
    const defaultOpts = basePromise.defaultOptions({ timezone: '+00:00' });
    const defaultOptsCall = baseCallback.defaultOptions({ timezone: '+00:00' });
    const expected = {
      host: 'localhost',
      port: 3306,
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
      ssl: undefined,
      infileStreamFactory: undefined,
      queryTimeout: 0,
      socketTimeout: 0,
      keepAliveDelay: 0,
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
      permitLocalInfile: false,
      bigNumberStrings: false,
      supportBigNumbers: false,
      permitRedirect: true
    };
    assert.deepEqual(expected, defaultOpts);
    assert.deepEqual(expected, defaultOptsCall);
  });
});
