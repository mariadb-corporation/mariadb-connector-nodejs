'use strict';

const Command = require('./command');

/**
 * Quit (close connection)
 * see https://mariadb.com/kb/en/library/com_quit/
 */
class Quit extends Command {
  constructor(resolve, reject) {
    super(resolve, reject);
  }

  start(out, opts, info) {
    out.startPacket(this);
    out.writeInt8(0x01);
    out.flushBuffer(true);
    this.emit('send_end');
    this.successEnd();
    this.onPacketReceive = this.skipResults;
  }

  skipResults(packet, out, opts, info) {
    //deliberately empty, if server send answer
  }
}

module.exports = Quit;
