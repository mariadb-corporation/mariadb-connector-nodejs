'use strict';

const Command = require('./command');

/**
 * Close prepared statement
 * see https://mariadb.com/kb/en/3-binary-protocol-prepared-statements-com_stmt_close/
 */
class ClosePrepare extends Command {
  constructor(resolve, reject, statementId) {
    super(resolve, reject);
    this.statementId = statementId;
  }

  start(out, opts, info) {
    out.startPacket(this);
    out.writeInt8(0x19);
    out.writeInt32(this.statementId);
    out.flush();
    this.onPacketReceive = null;
    this.emit('send_end');
    this.emit('end');
  }
}

module.exports = ClosePrepare;
