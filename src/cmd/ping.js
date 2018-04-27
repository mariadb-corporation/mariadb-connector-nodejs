"use strict";

const Command = require("./command");
const Errors = require("../misc/errors");

/**
 * send a COM_PING: permits sending a packet containing one byte to check that the connection is active.
 * see https://mariadb.com/kb/en/library/com_ping/
 */
class Ping extends Command {
  constructor(connEvents, onResult) {
    super(connEvents);
    this.onResult = onResult;
  }

  start(out, opts, info) {
    out.startPacket(this);
    out.writeInt8(0x0e);
    out.flushBuffer(true);
    this.emit("send_end");

    return this.readPingResponsePacket;
  }

  /**
   * Read ping response packet.
   * packet can be :
   * - an ERR_Packet
   * - a OK_Packet
   *
   * @param packet  query response
   * @param out     output writer
   * @param opts    connection options
   * @param info    connection info
   * @returns {null}
   */
  readPingResponsePacket(packet, out, opts, info) {
    switch (packet.peek()) {
      //*********************************************************************************************************
      //* OK response
      //*********************************************************************************************************
      case 0x00:
        packet.skip(1); //skip header
        info.status = packet.readUInt16();
        if (this.onResult) process.nextTick(this.onResult, null);
        this.emit("end");
        return null;

      //*********************************************************************************************************
      //* ERROR response
      //*********************************************************************************************************
      case 0xff:
        const err = packet.readError(info);
        this.throwError(err);
        return null;

      default:
        const errUnexpected = Errors.createError(
          "unexpected packet",
          false,
          info,
          "42000",
          Errors.ER_PING_BAD_PACKET
        );
        this.throwError(errUnexpected);
        return null;
    }
  }
}

module.exports = Ping;
