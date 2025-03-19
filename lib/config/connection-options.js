//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

const Collations = require('../const/collations.js');
const urlFormat = /mariadb:\/\/(([^/@:]+)?(:([^/]+))?@)?(([^/:]+)(:([0-9]+))?)\/([^?]+)(\?(.*))?$/;

/**
 * Default option similar to mysql driver.
 * known differences
 * - no queryFormat option. Permitting client to parse is a security risk. Best is to give SQL + parameters
 *   Only possible Objects are :
 *   - Buffer
 *   - Date
 *   - Object that implement toSqlString function
 *   - JSON object
 * + rowsAsArray (in mysql2) permit to have rows by index, not by name. Avoiding to parsing metadata string => faster
 */
class ConnectionOptions {
  constructor(opts) {
    if (typeof opts === 'string') {
      opts = ConnectionOptions.parse(opts);
    }

    if (!opts) opts = {};
    this.host = opts.host || 'localhost';
    this.port = opts.port ? Number(opts.port) : 3306;
    this.keepEof = Boolean(opts.keepEof) || false;
    this.user = opts.user || process.env.USERNAME;
    this.password = opts.password;
    this.database = opts.database;
    this.stream = opts.stream;
    this.fullResult = opts.fullResult;

    // log
    this.debug = Boolean(opts.debug) || false;
    this.debugCompress = Boolean(opts.debugCompress) || false;
    this.debugLen = opts.debugLen ? Number(opts.debugLen) : 256;
    this.logParam = opts.logParam === undefined ? true : Boolean(opts.logParam);
    if (opts.logger) {
      if (typeof opts.logger === 'function') {
        this.logger = {
          network: opts.logger,
          query: opts.logger,
          error: opts.logger,
          warning: opts.logger
        };
      } else {
        this.logger = {
          network: opts.logger.network,
          query: opts.logger.query,
          error: opts.logger.error,
          warning: opts.logger.warning || console.log
        };
        if (opts.logger.logParam !== undefined) this.logParam = Boolean(opts.logger.logParam);
      }
    } else {
      this.logger = {
        network: this.debug || this.debugCompress ? console.log : null,
        query: null,
        error: null,
        warning: console.log
      };
    }
    this.debug = !!this.logger.network;

    if (opts.charset && typeof opts.charset === 'string') {
      this.collation = Collations.fromCharset(opts.charset.toLowerCase());
      if (this.collation === undefined) {
        this.collation = Collations.fromName(opts.charset.toUpperCase());
        if (this.collation !== undefined) {
          this.logger.warning(
            "warning: please use option 'collation' " +
              "in replacement of 'charset' when using a collation name ('" +
              opts.charset +
              "')\n" +
              "(collation looks like 'UTF8MB4_UNICODE_CI', charset like 'utf8')."
          );
        } else {
          this.charset = opts.charset;
        }
      }
    } else if (opts.collation && typeof opts.collation === 'string') {
      this.collation = Collations.fromName(opts.collation.toUpperCase());
      if (this.collation === undefined) throw new RangeError("Unknown collation '" + opts.collation + "'");
    } else {
      this.collation = opts.charsetNumber ? Collations.fromIndex(Number(opts.charsetNumber)) : undefined;
    }

    // connection options
    this.permitRedirect = opts.permitRedirect === undefined ? true : Boolean(opts.permitRedirect);
    this.initSql = opts.initSql;
    this.connectTimeout = opts.connectTimeout === undefined ? 1000 : Number(opts.connectTimeout);
    this.connectAttributes = opts.connectAttributes || false;
    this.compress = Boolean(opts.compress) || false;
    this.rsaPublicKey = opts.rsaPublicKey;
    this.cachingRsaPublicKey = opts.cachingRsaPublicKey;
    this.allowPublicKeyRetrieval = Boolean(opts.allowPublicKeyRetrieval) || false;
    this.forceVersionCheck = Boolean(opts.forceVersionCheck) || false;
    this.maxAllowedPacket = opts.maxAllowedPacket ? Number(opts.maxAllowedPacket) : undefined;
    this.permitConnectionWhenExpired = Boolean(opts.permitConnectionWhenExpired) || false;
    this.pipelining = opts.pipelining;
    this.timezone = opts.timezone || 'local';
    this.socketPath = opts.socketPath;
    this.sessionVariables = opts.sessionVariables;
    this.infileStreamFactory = opts.infileStreamFactory;
    this.ssl = opts.ssl;
    if (opts.ssl) {
      if (typeof opts.ssl !== 'boolean' && typeof opts.ssl !== 'string') {
        this.ssl.rejectUnauthorized = opts.ssl.rejectUnauthorized !== false;
      }
    }

    // socket
    this.queryTimeout = isNaN(opts.queryTimeout) || Number(opts.queryTimeout) < 0 ? 0 : Number(opts.queryTimeout);
    this.socketTimeout = isNaN(opts.socketTimeout) || Number(opts.socketTimeout) < 0 ? 0 : Number(opts.socketTimeout);
    this.keepAliveDelay = opts.keepAliveDelay === undefined ? 0 : Number(opts.keepAliveDelay);
    if (!opts.keepAliveDelay) {
      // for mysql2 compatibility, check keepAliveInitialDelay/enableKeepAlive options.
      if (opts.enableKeepAlive === true && opts.keepAliveInitialDelay !== undefined) {
        this.keepAliveDelay = Number(opts.keepAliveInitialDelay);
      }
    }
    this.trace = Boolean(opts.trace) || false;

    // result-set
    this.checkDuplicate = opts.checkDuplicate === undefined ? true : Boolean(opts.checkDuplicate);
    this.dateStrings = Boolean(opts.dateStrings) || false;
    this.foundRows = opts.foundRows === undefined || Boolean(opts.foundRows);
    this.metaAsArray = Boolean(opts.metaAsArray) || false;
    this.metaEnumerable = Boolean(opts.metaEnumerable) || false;
    this.multipleStatements = Boolean(opts.multipleStatements) || false;
    this.namedPlaceholders = Boolean(opts.namedPlaceholders) || false;
    this.nestTables = opts.nestTables;
    this.autoJsonMap = opts.autoJsonMap === undefined ? true : Boolean(opts.autoJsonMap);
    this.jsonStrings = Boolean(opts.jsonStrings) || false;
    if (opts.jsonStrings !== undefined) {
      this.autoJsonMap = !this.jsonStrings;
    }
    this.bitOneIsBoolean = opts.bitOneIsBoolean === undefined ? true : Boolean(opts.bitOneIsBoolean);
    this.arrayParenthesis = Boolean(opts.arrayParenthesis) || false;
    this.permitSetMultiParamEntries = Boolean(opts.permitSetMultiParamEntries) || false;
    this.rowsAsArray = Boolean(opts.rowsAsArray) || false;
    this.typeCast = opts.typeCast;
    if (this.typeCast !== undefined && typeof this.typeCast !== 'function') {
      this.typeCast = undefined;
    }
    this.bulk = opts.bulk === undefined || Boolean(opts.bulk);
    this.checkNumberRange = Boolean(opts.checkNumberRange) || false;

    // coherence check
    if (opts.pipelining === undefined) {
      this.permitLocalInfile = Boolean(opts.permitLocalInfile) || false;
      this.pipelining = !this.permitLocalInfile;
    } else {
      this.pipelining = Boolean(opts.pipelining);
      if (opts.permitLocalInfile === true && this.pipelining) {
        throw new Error(
          'enabling options `permitLocalInfile` and `pipelining` is not possible, options are incompatible.'
        );
      }
      this.permitLocalInfile = this.pipelining ? false : Boolean(opts.permitLocalInfile) || false;
    }
    this.prepareCacheLength = opts.prepareCacheLength === undefined ? 256 : Number(opts.prepareCacheLength);
    this.restrictedAuth = opts.restrictedAuth;
    if (this.restrictedAuth != null) {
      if (!Array.isArray(this.restrictedAuth)) {
        this.restrictedAuth = this.restrictedAuth.split(',');
      }
    }

    // for compatibility with 2.x version and mysql/mysql2
    this.bigIntAsNumber = Boolean(opts.bigIntAsNumber) || false;
    this.insertIdAsNumber = Boolean(opts.insertIdAsNumber) || false;
    this.decimalAsNumber = Boolean(opts.decimalAsNumber) || false;
    this.supportBigNumbers = Boolean(opts.supportBigNumbers) || false;
    this.bigNumberStrings = Boolean(opts.bigNumberStrings) || false;

    if (opts.maxAllowedPacket && isNaN(this.maxAllowedPacket)) {
      throw new RangeError(`maxAllowedPacket must be an integer. was '${opts.maxAllowedPacket}'`);
    }
  }

  /**
   * When parsing from String, correcting type.
   *
   * @param {object} opts - options
   * @return {object} options with corrected data types
   */
  static parseOptionDataType(opts) {
    // Convert boolean strings to boolean values
    const booleanOptions = [
      'bulk',
      'allowPublicKeyRetrieval',
      'insertIdAsNumber',
      'decimalAsNumber',
      'bigIntAsNumber',
      'permitRedirect',
      'logParam',
      'compress',
      'dateStrings',
      'debug',
      'autoJsonMap',
      'arrayParenthesis',
      'checkDuplicate',
      'debugCompress',
      'foundRows',
      'metaAsArray',
      'metaEnumerable',
      'multipleStatements',
      'namedPlaceholders',
      'nestTables',
      'permitSetMultiParamEntries',
      'pipelining',
      'forceVersionCheck',
      'rowsAsArray',
      'trace',
      'bitOneIsBoolean',
      'jsonStrings',
      'enableKeepAlive',
      'supportBigNumbers',
      'bigNumberStrings',
      'keepEof',
      'permitLocalInfile',
      'permitConnectionWhenExpired'
    ];

    booleanOptions.forEach((option) => {
      if (opts[option] !== undefined && typeof opts[option] === 'string') {
        opts[option] = opts[option] === 'true';
      }
    });

    // Convert numeric strings to numbers
    const numericOptions = [
      'charsetNumber',
      'connectTimeout',
      'keepAliveDelay',
      'socketTimeout',
      'debugLen',
      'prepareCacheLength',
      'queryTimeout',
      'maxAllowedPacket',
      'keepAliveInitialDelay',
      'port'
    ];

    numericOptions.forEach((option) => {
      if (opts[option] !== undefined && typeof opts[option] === 'string') {
        const parsedValue = parseInt(opts[option], 10);
        if (!isNaN(parsedValue)) {
          opts[option] = parsedValue;
        }
      }
    });

    // Handle special case for SSL
    if (opts.ssl !== undefined && typeof opts.ssl === 'string') {
      opts.ssl = opts.ssl === 'true';
    }

    // Handle special case for connectAttributes (JSON parsing)
    if (opts.connectAttributes !== undefined && typeof opts.connectAttributes === 'string') {
      try {
        opts.connectAttributes = JSON.parse(opts.connectAttributes);
      } catch (e) {
        throw new Error(`Failed to parse connectAttributes as JSON: ${e.message}`);
      }
    }

    // Handle special case for sessionVariables (JSON parsing if it's a string and looks like JSON)
    if (opts.sessionVariables !== undefined && typeof opts.sessionVariables === 'string') {
      if (opts.sessionVariables.trim().startsWith('{')) {
        try {
          opts.sessionVariables = JSON.parse(opts.sessionVariables);
        } catch (e) {
          // If it fails to parse, keep it as a string
        }
      }
    }

    return opts;
  }

  static parse(opts) {
    const matchResults = opts.match(urlFormat);

    if (!matchResults) {
      throw new Error(
        `error parsing connection string '${opts}'. format must be 'mariadb://[<user>[:<password>]@]<host>[:<port>]/[<db>[?<opt1>=<value1>[&<opt2>=<value2>]]]'`
      );
    }
    const options = {
      user: matchResults[2] ? decodeURIComponent(matchResults[2]) : undefined,
      password: matchResults[4] ? decodeURIComponent(matchResults[4]) : undefined,
      host: matchResults[6] ? decodeURIComponent(matchResults[6]) : matchResults[6],
      port: matchResults[8] ? parseInt(matchResults[8]) : undefined,
      database: matchResults[9] ? decodeURIComponent(matchResults[9]) : matchResults[9]
    };

    const variousOptsString = matchResults[11];
    if (variousOptsString) {
      const keyValues = variousOptsString.split('&');
      keyValues.forEach(function (keyVal) {
        const equalIdx = keyVal.indexOf('=');
        if (equalIdx !== 1) {
          let val = keyVal.substring(equalIdx + 1);
          val = val ? decodeURIComponent(val) : undefined;
          options[keyVal.substring(0, equalIdx)] = val;
        }
      });
    }

    return this.parseOptionDataType(options);
  }
}

module.exports = ConnectionOptions;
