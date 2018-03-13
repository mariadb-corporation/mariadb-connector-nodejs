"use strict";

const Command = require("./command");

/**
 * Quit (close connection)
 * see https://mariadb.com/kb/en/library/com_quit/
 */
class Quit extends Command {
  constructor(connEvents, callback) {
    super(connEvents);
    this.callback = callback;
  }

  start(out, opts, info) {
    out.startPacket(this);
    out.writeInt8(0x01);
    out.flushBuffer(true);
    this.callback();
    this.emit("end");
    return null;
  }
}

module.exports = Quit;
