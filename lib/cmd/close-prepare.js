'use strict';

const Command = require('./command');

/**
 * Close prepared statement
 * see https://mariadb.com/kb/en/3-binary-protocol-prepared-statements-com_stmt_close/
 */
class ClosePrepare extends Command {
  constructor(cmdParam, resolve, reject, prepare) {
    super(cmdParam, resolve, reject);
    this.prepare = prepare;
  }

  start(out, opts, info) {
    if (opts.logger.query) opts.logger.query(`CLOSE PREPARE: (${this.prepare.id}) ${this.prepare.query}`);
    out.startPacket(this);
    out.writeInt8(0x19);
    out.writeInt32(this.prepare.id);
    out.flush();
    this.onPacketReceive = null;
    this.emit('send_end');
    this.emit('end');
  }
}

module.exports = ClosePrepare;
