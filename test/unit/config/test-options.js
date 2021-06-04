'use strict';

const { assert } = require('chai');
const basePromise = require('../../../promise');
const baseCallback = require('../../../callback');
const Collations = require('../../../lib/const/collations.js');

describe('test options', () => {
  it('default options', () => {
    const defaultOpts = basePromise.defaultOptions({ timezone: '+00:00' });
    const defaultOptsCall = baseCallback.defaultOptions({ timezone: '+00:00' });
    const expected = {
      host: 'localhost',
      port: 3306,
      user: process.env.USERNAME,
      password: undefined,
      database: undefined,
      prepareCacheLength: 256,
      collation: Collations.fromName('UTF8MB4_UNICODE_CI'),
      initSql: undefined,
      connectTimeout: 10000,
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
      socketPath: undefined,
      sessionVariables: undefined,
      ssl: undefined,
      queryTimeout: 0,
      socketTimeout: 0,
      keepAliveDelay: 0,
      debug: false,
      debugCompress: false,
      debugLen: 256,
      logPackets: false,
      trace: false,
      checkDuplicate: true,
      dateStrings: false,
      foundRows: true,
      metaAsArray: false,
      multipleStatements: false,
      namedPlaceholders: false,
      nestTables: undefined,
      autoJsonMap: true,
      arrayParenthesis: false,
      permitSetMultiParamEntries: false,
      rowsAsArray: false,
      decimalAsNumber: false,
      insertIdAsNumber: false,
      skipSetTimezone: false,
      typeCast: undefined,
      bigIntAsNumber: false,
      bulk: true,
      permitLocalInfile: false,
      tz: 'Etc/UTC'
    };
    assert.deepEqual(expected, defaultOpts);
    assert.deepEqual(expected, defaultOptsCall);
  });
});
