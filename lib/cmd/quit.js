'use strict';

const Command = require('./command');
const QUIT_COMMAND = new Uint8Array([1, 0, 0, 0, 0x01]);

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
    out.fastFlush(this, QUIT_COMMAND);
    this.emit('send_end');
    this.successEnd();
  }

  skipResults(packet, out, opts, info) {
    //deliberately empty, if server send answer
  }
}

module.exports = Quit;
