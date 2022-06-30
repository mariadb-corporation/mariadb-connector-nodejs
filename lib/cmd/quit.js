'use strict';

const Command = require('./command');

/**
 * Quit (close connection)
 * see https://mariadb.com/kb/en/library/com_quit/
 */
class Quit extends Command {
  constructor(cmdParam, resolve, reject) {
    super(cmdParam, resolve, reject);
  }

  start(out, opts, info) {
    if (opts.logger.query) opts.logger.query(`QUIT`);
    this.onPacketReceive = this.skipResults;
    out.startPacket(this);
    out.writeInt8(0x01);
    out.flush();
    this.emit('send_end');
    this.successEnd();
  }

  skipResults(packet, out, opts, info) {
    //deliberately empty, if server send answer
  }
}

module.exports = Quit;
