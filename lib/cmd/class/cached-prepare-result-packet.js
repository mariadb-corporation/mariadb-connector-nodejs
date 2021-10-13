'use strict';

const PrepareResultPacket = require('./prepare-result-packet');

/**
 * Prepare result
 * see https://mariadb.com/kb/en/com_stmt_prepare/#com_stmt_prepare_ok
 */
class CachedPrepareResultPacket extends PrepareResultPacket {
  constructor(statementId, parameters, columns, database, sql, placeHolderIndex, executePromise, emitter, isCallback) {
    super(statementId, parameters, columns, database, sql, placeHolderIndex, executePromise, emitter, isCallback);
    this.cached = true;
    this.use = 1;
  }

  incrementUse() {
    this.use += 1;
  }

  unCache() {
    this.cached = false;
    if (this.use <= 0) {
      super.close();
    }
  }

  close() {
    this.use -= 1;
    if (this.use <= 0 && !this.cached) {
      super.close();
    }
  }
}

module.exports = CachedPrepareResultPacket;
