'use strict';
const Parser = require('./parser');
const Parse = require('../misc/parse');
const BinaryEncoder = require('./encoder/binary-encoder');

/**
 * send a COM_STMT_PREPARE: permits sending a prepare packet
 * see https://mariadb.com/kb/en/com_stmt_prepare/
 */
class Prepare extends Parser {
  constructor(resolve, reject, opts, connOpts, sql, connection) {
    super(resolve, reject, opts, connOpts, sql, null);
    this.encoder = new BinaryEncoder(this.opts);
    this.binary = true;
    this._connection = connection;
  }

  /**
   * Send COM_STMT_PREPARE
   *
   * @param out   output writer
   * @param opts  connection options
   * @param info  connection information
   */
  start(out, opts, info) {
    if (opts.logger.query) opts.logger.query(`PREPARE: ${this.sql}`);
    this.onPacketReceive = this.readPrepareResultPacket;
    // check in cache if enabled
    if (info._prepareCache) {
      const key = info.database + '|' + this.sql;
      const cachedItem = info._prepareCache.get(key);
      if (cachedItem) {
        cachedItem.incrementUse();
        this.emit('send_end');
        return this.successEnd(cachedItem);
      }
    }

    if (this.opts.namedPlaceholders) {
      const res = Parse.searchPlaceholder(this.sql);
      this.sql = res.sql;
      this.placeHolderIndex = res.placeHolderIndex;
    }

    out.startPacket(this);
    out.writeInt8(0x16);
    out.writeString(this.sql);
    out.flush();
    this.emit('send_end');
  }

  /**
   * Display current SQL with parameters (truncated if too big)
   *
   * @returns {string}
   */
  displaySql() {
    if (this.opts) {
      if (this.sql.length > this.opts.debugLen) {
        return 'sql: ' + this.sql.substring(0, this.opts.debugLen) + '...';
      }
    }
    return 'sql: ' + this.sql;
  }
}

module.exports = Prepare;
