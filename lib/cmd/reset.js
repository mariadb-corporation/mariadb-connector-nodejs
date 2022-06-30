'use strict';

const Command = require('./command');
const Errors = require('../misc/errors');

/**
 * send a COM_RESET_CONNECTION: permits to reset a connection without re-authentication.
 * see https://mariadb.com/kb/en/library/com_reset_connection/
 */
class Reset extends Command {
  constructor(cmdParam, resolve, reject) {
    super(cmdParam, resolve, reject);
  }

  start(out, opts, info) {
    if (opts.logger.query) opts.logger.query(`RESET`);
    this.onPacketReceive = this.readResetResponsePacket;
    out.startPacket(this);
    out.writeInt8(0x1f);
    out.flush();
    this.emit('send_end');
  }

  /**
   * Read response packet.
   * packet can be :
   * - an ERR_Packet
   * - a OK_Packet
   *
   * @param packet  query response
   * @param out     output writer
   * @param opts    connection options
   * @param info    connection info
   */
  readResetResponsePacket(packet, out, opts, info) {
    if (packet.peek() !== 0x00) {
      return this.throwNewError('unexpected packet', false, info, '42000', Errors.ER_RESET_BAD_PACKET);
    }

    packet.skip(1); //skip header
    packet.skipLengthCodedNumber(); //affected rows
    packet.skipLengthCodedNumber(); //insert ids

    info.status = packet.readUInt16();
    this.successEnd();
  }
}

module.exports = Reset;
