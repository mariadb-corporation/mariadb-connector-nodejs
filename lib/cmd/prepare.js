'use strict';
const Parser = require('./parser');
const Parse = require('../misc/parse');
const BinaryEncoder = require('./encoder/binary-encoder');
const CachedPrepareResultPacket = require('./class/cached-prepare-result-packet');
const PrepareResult = require('./class/prepare-result-packet');

/**
 * send a COM_STMT_PREPARE: permits sending a prepare packet
 * see https://mariadb.com/kb/en/com_stmt_prepare/
 */
class Prepare extends Parser {
  constructor(resolve, reject, connOpts, cmdParam, conn) {
    super(resolve, reject, connOpts, cmdParam);
    this.encoder = new BinaryEncoder(this.opts);
    this.binary = true;
    this.conn = conn;
  }

  /**
   * Send COM_STMT_PREPARE
   *
   * @param out   output writer
   * @param opts  connection options
   * @param info  connection information
   */
  start(out, opts, info) {
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
    if (opts.logger.query) opts.logger.query(`PREPARE: ${this.sql}`);
    this.onPacketReceive = this.readPrepareResultPacket;

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

  successPrepare(info, opts) {
    let prepare;
    if (info._prepareCache) {
      const key = info.database + '|' + this.sql;
      prepare = new CachedPrepareResultPacket(
        this.statementId,
        this._parameterPrepare,
        this._columnsPrepare,
        info.database,
        this.sql,
        this.placeHolderIndex,
        this.conn,
        opts
      );
      info._prepareCache.set(key, prepare);
    } else {
      prepare = new PrepareResult(
        this.statementId,
        this._parameterPrepare,
        this._columnsPrepare,
        info.database,
        this.sql,
        this.placeHolderIndex,
        this.conn,
        opts
      );
    }
    this._columnsPrepare = null;
    this._parameterPrepare = null;
    return this.success(prepare);
  }

  /**
   * Display current SQL with parameters (truncated if too big)
   *
   * @returns {string}
   */
  displaySql() {
    if (this.opts) {
      if (this.sql.length > this.opts.debugLen) {
        return this.sql.substring(0, this.opts.debugLen) + '...';
      }
    }
    return this.sql;
  }
}

module.exports = Prepare;
