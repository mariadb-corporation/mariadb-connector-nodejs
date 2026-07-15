//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import Collations from '../const/collations.js';
import os from 'node:os';

const MIN_DEFAULT_MAX_ALLOWED_PACKET = 16 * 1024 * 1024; //16Mb
const MAX_DEFAULT_MAX_ALLOWED_PACKET = 1024 * 1024 * 1024; //1Gb

/**
 * Memory the process may use for packet buffers: the cgroup limit when containerised, physical
 * memory otherwise.
 *
 * @return {number} bytes the process can be expected to use
 */
const usableMemory = () => {
  const total = os.totalmem();
  const constrained = process.constrainedMemory();
  return constrained > 0 && constrained < total ? constrained : total;
};

/**
 * Value used when `maxAllowedPacket` is not set: a quarter of the usable memory, bounded to
 * [16Mb, 1Gb].
 */
export const DEFAULT_MAX_ALLOWED_PACKET = Math.min(
  MAX_DEFAULT_MAX_ALLOWED_PACKET,
  Math.max(MIN_DEFAULT_MAX_ALLOWED_PACKET, Math.floor(usableMemory() / 4))
);

/**
 * Value to send in the handshake response / SSLRequest `max packet size` field.
 * Clamped to the 4-byte signed range that {@link PacketOutputStream#writeInt32} can encode.
 *
 * @param {object} opts - connection options
 * @return {number} advertised max packet size
 */
export const handshakeMaxPacketSize = (opts) =>
  Math.min(opts.maxAllowedPacket || DEFAULT_MAX_ALLOWED_PACKET, 0x7fffffff);

/**
 * Default option similar to mysql driver.
 * known differences
 * - no queryFormat option. Permitting a client to parse is a security risk. Best is to give SQL + parameters
 *   Only possible Objects are:
 *   - Buffer
 *   - Date
 *   - Object that implement toSqlString function
 *   - JSON object
 * + rowsAsArray (in mysql2) permit having rows by index, not by name. Avoiding parsing metadata string => faster
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
      if (opts.collation && typeof opts.collation === 'string') {
        // charset AND collation
        this.collation = Collations.fromCharsetAndName(opts.charset.toLowerCase(), opts.collation.toUpperCase());
        if (this.collation === undefined)
          throw new RangeError("Unknown collation '" + opts.collation + "' with charset '" + opts.charset + "'");
      }
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
    this.initSql = opts.initSql;
    this.connectTimeout = opts.connectTimeout === undefined ? 1000 : Number(opts.connectTimeout);
    this.connectAttributes = opts.connectAttributes || false;
    this.compress = Boolean(opts.compress) || false;
    this.rsaPublicKey = opts.rsaPublicKey;
    this.cachingRsaPublicKey = opts.cachingRsaPublicKey;
    this.allowPublicKeyRetrieval = Boolean(opts.allowPublicKeyRetrieval) || false;
    this.forceVersionCheck = Boolean(opts.forceVersionCheck) || false;
    this.maxAllowedPacket = opts.maxAllowedPacket ? Number(opts.maxAllowedPacket) : DEFAULT_MAX_ALLOWED_PACKET;
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
    this.permitRedirect =
      opts.permitRedirect === undefined
        ? !!this.ssl && this.ssl.rejectUnauthorized !== false
        : Boolean(opts.permitRedirect);

    // socket
    this.queryTimeout = isNaN(opts.queryTimeout) || Number(opts.queryTimeout) < 0 ? 0 : Number(opts.queryTimeout);
    this.socketTimeout = isNaN(opts.socketTimeout) || Number(opts.socketTimeout) < 0 ? 0 : Number(opts.socketTimeout);
    this.keepAliveDelay = opts.keepAliveDelay === undefined ? undefined : Number(opts.keepAliveDelay);
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

    // for compatibility with the 2.x version and mysql/mysql2
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

  /**
   * Remove the brackets WHATWG URL keeps around IPv6 literals (e.g. '[::1]' ->
   * '::1'), so the bare address can be handed to the socket layer.
   *
   * @param hostname  URL.hostname value
   * @returns {string} hostname without IPv6 brackets
   */
  static unwrapIpv6(hostname) {
    return hostname.length > 1 && hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  }

  static parse(opts) {
    const errorMsg =
      'error parsing connection string ' +
      opts +
      '. format must be ' +
      "'mariadb://[<user>[:<password>]@]<host>[:<port>]/[<db>[?<opt1>=<value1>[&<opt2>=<value2>]]]'";

    let url;
    try {
      url = new URL(opts);
    } catch (e) {
      throw new Error(errorMsg);
    }
    if (url.protocol !== 'mariadb:') {
      throw new Error(errorMsg);
    }

    // database is the path without its leading '/', and is mandatory
    const database = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
    if (database === '') {
      throw new Error(errorMsg);
    }

    const options = {
      user: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      host: ConnectionOptions.unwrapIpv6(url.hostname),
      port: url.port ? parseInt(url.port, 10) : undefined,
      database: decodeURIComponent(database)
    };

    // Parse the query string manually rather than with URLSearchParams to keep
    // the historical semantics: only values are decoded, and decodeURIComponent
    // (unlike URLSearchParams) does not turn '+' into a space.
    const variousOptsString = url.search ? url.search.slice(1) : '';
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

export default ConnectionOptions;
