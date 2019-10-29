'use strict';

const Collations = require('../const/collations.js');
const urlFormat = /mariadb:\/\/(([^/@:]+)?(:([^/]+))?@)?(([^/:]+)(:([0-9]+))?)\/([^?]+)(\?(.*))?$/;
const moment = require('moment-timezone');
const Errors = require('../misc/errors');

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
    this.bigNumberStrings = opts.bigNumberStrings || false;
    this.bulk = opts.bulk === undefined || opts.bulk;
    if (opts.charset && typeof opts.charset === 'string') {
      this.collation = Collations.fromCharset(opts.charset.toLowerCase());
      if (this.collation === undefined) {
        this.collation = Collations.fromName(opts.charset.toUpperCase());
        if (this.collation !== undefined) {
          console.log(
            "warning: please use option 'collation' " +
              "in replacement of 'charset' when using a collation name ('" +
              opts.charset +
              "')\n" +
              "(collation looks like 'UTF8MB4_UNICODE_CI', charset like 'utf8')."
          );
        }
      }
      if (this.collation === undefined)
        throw new RangeError("Unknown charset '" + opts.charset + "'");
    } else if (opts.collation && typeof opts.collation === 'string') {
      this.collation = Collations.fromName(opts.collation.toUpperCase());
      if (this.collation === undefined)
        throw new RangeError("Unknown collation '" + opts.collation + "'");
    } else {
      this.collation = Collations.fromIndex(opts.charsetNumber) || Collations.fromIndex(224); //UTF8MB4_UNICODE_CI;
    }
    this.compress = opts.compress || false;
    this.logPackets = opts.logPackets || false;
    this.connectAttributes = opts.connectAttributes || false;
    this.connectTimeout = opts.connectTimeout === undefined ? 10000 : opts.connectTimeout;
    this.socketTimeout = opts.socketTimeout === undefined ? 0 : opts.socketTimeout;
    this.database = opts.database;
    this.dateStrings = opts.dateStrings || false;
    this.debug = opts.debug || false;
    this.debugCompress = opts.debugCompress || false;
    this.debugLen = opts.debugLen || 256;
    this.foundRows = opts.foundRows === undefined || opts.foundRows;
    this.host = opts.host || 'localhost';
    this.initSql = opts.initSql;
    this.maxAllowedPacket = opts.maxAllowedPacket;
    this.metaAsArray = opts.metaAsArray || false;
    this.multipleStatements = opts.multipleStatements || false;
    this.namedPlaceholders = opts.namedPlaceholders || false;
    this.nestTables = opts.nestTables === undefined ? undefined : opts.nestTables;
    this.password = opts.password;
    this.permitSetMultiParamEntries = opts.permitSetMultiParamEntries || false;
    this.permitConnectionWhenExpired = opts.permitConnectionWhenExpired || false;
    this.pipelining = opts.pipelining === undefined || opts.pipelining;
    if (opts.pipelining === undefined) {
      this.permitLocalInfile = opts.permitLocalInfile || false;
      this.pipelining = !this.permitLocalInfile;
    } else {
      this.pipelining = opts.pipelining;
      if (opts.permitLocalInfile === true && this.pipelining) {
        throw new Error(
          'enabling options `permitLocalInfile` and ' +
            '`pipelining` is not possible, options are incompatible.'
        );
      }
      this.permitLocalInfile = this.pipelining ? false : opts.permitLocalInfile || false;
    }
    this.port = opts.port || 3306;
    this.rowsAsArray = opts.rowsAsArray || false;
    this.socketPath = opts.socketPath;
    this.sessionVariables = opts.sessionVariables;
    this.ssl = opts.ssl;
    if (opts.ssl) {
      if (typeof opts.ssl !== 'boolean' && typeof opts.ssl !== 'string') {
        this.ssl.rejectUnauthorized = opts.ssl.rejectUnauthorized !== false;
      }
    }
    this.supportBigNumbers = opts.supportBigNumbers || false;
    this.timezone = opts.timezone || 'local';
    if (this.timezone && this.timezone !== 'local' && this.timezone !== 'auto') {
      let tzName = this.timezone;
      if (this.timezone === 'Z') {
        tzName = 'Etc/UTC';
      } else {
        const matched = this.timezone.match(/([+\-\s])(\d\d):?(\d\d)?/);
        if (matched) {
          const hour = (matched[1] === '-' ? 1 : -1) * Number.parseInt(matched[2], 10);
          const minutes = matched.length > 2 && matched[3] ? Number.parseInt(matched[3], 10) : 0;
          if (minutes > 0) {
            throw new RangeError(
              "timezone format incompatible with IANA standard timezone format was '" +
                this.timezone +
                "'"
            );
          }
          tzName = 'Etc/GMT' + (matched[1] === '-' ? '+' : '') + hour;
          console.log(
            "warning: please use IANA standard timezone format ('Etc/GMT" +
              (matched[1] === '-' ? '+' : '') +
              hour +
              "')"
          );
        }
      }
      this.localTz = moment.tz.guess();
      if (tzName === this.localTz) {
        this.tz = null;
      } else {
        this.tz = moment.tz.setDefault(tzName);
        if (!this.tz.defaultZone) {
          throw Errors.createError(
            "Unknown IANA timezone '" + tzName + "'.",
            true,
            null,
            '08S01',
            Errors.ER_WRONG_IANA_TIMEZONE
          );
        }
      }
    }
    this.trace = opts.trace || false;
    this.typeCast = opts.typeCast;
    if (this.typeCast !== undefined && typeof this.typeCast !== 'function') {
      this.typeCast = undefined;
    }
    this.user = opts.user || process.env.USERNAME;

    if (this.maxAllowedPacket && !Number.isInteger(this.maxAllowedPacket)) {
      throw new RangeError(
        "maxAllowedPacket must be an integer. was '" + this.maxAllowedPacket + "'"
      );
    }
  }

  /**
   * When parsing from String, correcting type.
   *
   * @param opts options
   * @return {opts}
   */
  static parseOptionDataType(opts) {
    if (opts.bigNumberStrings) opts.bigNumberStrings = opts.bigNumberStrings == 'true';
    if (opts.bulk) opts.bulk = opts.bulk == 'true';
    if (opts.logPackets) opts.logPackets = opts.logPackets == 'true';
    if (opts.charsetNumber && !isNaN(Number.parseInt(opts.charsetNumber))) {
      opts.charsetNumber = Number.parseInt(opts.charsetNumber);
    }
    if (opts.compress) opts.compress = opts.compress == 'true';
    if (opts.connectAttributes) opts.connectAttributes = opts.connectAttributes == 'true';
    if (opts.connectTimeout) opts.connectTimeout = parseInt(opts.connectTimeout);
    if (opts.socketTimeout) opts.socketTimeout = parseInt(opts.socketTimeout);
    if (opts.dateStrings) opts.dateStrings = opts.dateStrings == 'true';
    if (opts.debug) opts.debug = opts.debug == 'true';
    if (opts.debugCompress) opts.debugCompress = opts.debugCompress == 'true';
    if (opts.debugLen) opts.debugLen = parseInt(opts.debugLen);
    if (opts.foundRows) opts.foundRows = opts.foundRows == 'true';
    if (opts.maxAllowedPacket && !isNaN(Number.parseInt(opts.maxAllowedPacket)))
      opts.maxAllowedPacket = parseInt(opts.maxAllowedPacket);
    if (opts.metaAsArray) opts.metaAsArray = opts.metaAsArray == 'true';
    if (opts.multipleStatements) opts.multipleStatements = opts.multipleStatements == 'true';
    if (opts.namedPlaceholders) opts.namedPlaceholders = opts.namedPlaceholders == 'true';
    if (opts.nestTables) opts.nestTables = opts.nestTables == 'true';
    if (opts.permitSetMultiParamEntries)
      opts.permitSetMultiParamEntries = opts.permitSetMultiParamEntries == 'true';
    if (opts.pipelining) opts.pipelining = opts.pipelining == 'true';
    if (opts.rowsAsArray) opts.rowsAsArray = opts.rowsAsArray == 'true';
    if (opts.supportBigNumbers) opts.supportBigNumbers = opts.supportBigNumbers == 'true';
    if (opts.trace) opts.trace = opts.trace == 'true';
    if (opts.ssl && (opts.ssl == 'true' || opts.ssl == 'false')) opts.ssl = opts.ssl == 'true';
    return opts;
  }

  static parse(opts) {
    const matchResults = opts.match(urlFormat);

    if (!matchResults) {
      throw new Error(
        "error parsing connection string '" +
          opts +
          "'. format must be 'mariadb://[<user>[:<password>]@]<host>[:<port>]/[<db>[?<opt1>=<value1>[&<opt2>=<value2>]]]'"
      );
    }
    const options = {
      user: matchResults[2],
      password: matchResults[4],
      host: matchResults[6],
      port: matchResults[8] ? parseInt(matchResults[8]) : undefined,
      database: matchResults[9]
    };

    const variousOptsString = matchResults[11];
    if (variousOptsString) {
      const keyVals = variousOptsString.split('&');
      keyVals.forEach(function(keyVal) {
        const equalIdx = keyVal.indexOf('=');
        if (equalIdx !== 1) {
          options[keyVal.substring(0, equalIdx)] = keyVal.substring(equalIdx + 1);
        }
      });
    }

    return this.parseOptionDataType(options);
  }
}

module.exports = ConnectionOptions;
