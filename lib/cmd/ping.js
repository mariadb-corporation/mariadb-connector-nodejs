"use strict";

const Command = require("./command");
const Errors = require("../misc/errors");

/**
 * send a COM_PING: permits sending a packet containing one byte to check that the connection is active.
 * see https://mariadb.com/kb/en/library/com_ping/
 */
class Ping extends Command {
  constructor(resolve, reject) {
    super(resolve, reject);
  }

  start(out, opts, info) {
    out.startPacket(this);
    out.writeInt8(0x0e);
    out.flushBuffer(true);
    this.emit("send_end");
    this.onPacketReceive = this.readPingResponsePacket;
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
   */
  readPingResponsePacket(packet, out, opts, info) {
    if (packet.peek() !== 0x00) {
      return this.throwNewError(
        "unexpected packet",
        false,
        info,
        "42000",
        Errors.ER_PING_BAD_PACKET
      );
    }
    packet.skip(1); //skip header
    packet.skipLengthCodedNumber(); //affected rows
    packet.skipLengthCodedNumber(); //insert ids
    info.status = packet.readUInt16();
    this.successEnd(null);
  }
}

module.exports = Ping;
