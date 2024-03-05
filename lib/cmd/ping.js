//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

const Command = require('./command');
const ServerStatus = require('../const/server-status');

const PING_COMMAND = new Uint8Array([1, 0, 0, 0, 0x0e]);

/**
 * send a COM_PING: permits sending a packet containing one byte to check that the connection is active.
 * see https://mariadb.com/kb/en/library/com_ping/
 */
class Ping extends Command {
  constructor(cmdParam, resolve, reject) {
    super(cmdParam, resolve, reject);
  }

  start(out, opts, info) {
    if (opts.logger.query) opts.logger.query('PING');
    this.onPacketReceive = this.readPingResponsePacket;
    out.fastFlush(this, PING_COMMAND);
    this.emit('send_end');
  }

  /**
   * Read ping response packet.
   * packet can be :
   * - an ERR_Packet
   * - an OK_Packet
   *
   * @param packet  query response
   * @param out     output writer
   * @param opts    connection options
   * @param info    connection info
   */
  readPingResponsePacket(packet, out, opts, info) {
    packet.skip(1); //skip header
    packet.skipLengthCodedNumber(); //affected rows
    packet.skipLengthCodedNumber(); //insert ids
    info.status = packet.readUInt16();
    if (info.redirectRequest && (info.status & ServerStatus.STATUS_IN_TRANS) === 0) {
      info.redirect(info.redirectRequest, this.successEnd.bind(this, null));
    } else {
      this.successEnd(null);
    }
  }
}

module.exports = Ping;
