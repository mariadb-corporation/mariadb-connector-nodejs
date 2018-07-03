"use strict";

const Collations = require("../const/collations.js");

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
    if (!opts) opts = {};
    if (opts.charset && typeof opts.charset === "string") {
      this.collation = Collations.fromName(opts.charset.toUpperCase());
      if (this.collation === undefined)
        throw new RangeError("Unknown charset '" + opts.charset + "'");
    } else {
      this.collation = Collations.fromIndex(opts.charsetNumber) || Collations.fromIndex(224); //UTF8MB4_UNICODE_CI;
    }
    this.compress = opts.compress || false;
    this.metaAsArray = opts.metaAsArray || false;
    this.connectAttributes = opts.connectAttributes || false;
    this.connectTimeout = opts.connectTimeout === undefined ? 10000 : opts.connectTimeout;
    this.socketTimeout = opts.socketTimeout === undefined ? 0 : opts.socketTimeout;
    this.database = opts.database;
    this.dateStrings = opts.dateStrings || false;
    this.debug = opts.debug || false;
    this.debugLen = opts.debugLen || 256;
    this.bigNumberStrings = opts.bigNumberStrings || false;
    this.foundRows = opts.foundRows === undefined || opts.foundRows;
    this.host = opts.host || "localhost";
    this.maxPreparedStatements = opts.maxPreparedStatements || 128;
    this.multipleStatements = opts.multipleStatements || false;
    this.namedPlaceholders = opts.namedPlaceholders || false;
    this.password = opts.password;
    this.pipelining = opts.pipelining === undefined || opts.pipelining;
    if (opts.pipelining === undefined) {
      this.permitLocalInfile = opts.permitLocalInfile || false;
      this.pipelining = !this.permitLocalInfile;
    } else {
      this.pipelining = opts.pipelining;
      this.permitLocalInfile = this.pipelining ? false : opts.permitLocalInfile || false;
    }
    this.port = opts.port || 3306;
    this.socketPath = opts.socketPath;
    this.supportBigNumbers = opts.supportBigNumbers || false;
    this.timezone = opts.timezone || "local";
    if (this.timezone !== "local") {
      if (this.timezone === "Z") {
        this.timezoneMillisOffset = 0;
      } else {
        const matched = this.timezone.match(/([\+\-\s])(\d\d):?(\d\d)?/);
        if (!matched) {
          throw new RangeError(
            "timezone format error. must be 'local'/'Z' or ±HH:MM. was '" + this.timezone + "'"
          );
        }
        const hour = Number.parseInt(matched[2], 10);
        const minutes = matched.length > 2 && matched[3] ? Number.parseInt(matched[3], 10) : 0;
        this.timezoneMillisOffset = hour * 3600000 + minutes * 60000;
      }
    }
    this.trace = opts.trace || false;
    this.typeCast = opts.typeCast;
    if (this.typeCast != undefined && typeof this.typeCast !== "function") {
      this.typeCast = undefined;
    }
    this.user = opts.user || process.env.USERNAME;
    this.nestTables = opts.nestTables === undefined ? undefined : opts.nestTables;
    this.rowsAsArray = opts.rowsAsArray || false;
    this.ssl = opts.ssl;
    if (opts.ssl) {
      if (typeof opts.ssl !== "boolean") {
        this.ssl.rejectUnauthorized = opts.ssl.rejectUnauthorized !== false;
      }
    }
  }
}

module.exports = ConnectionOptions;
