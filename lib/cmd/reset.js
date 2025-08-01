//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import Command from './command.js';
import * as ServerStatus from '../const/server-status.js';

const RESET_COMMAND = new Uint8Array([1, 0, 0, 0, 0x1f]);
/**
 * send a COM_RESET_CONNECTION: permits to reset a connection without re-authentication.
 * see https://mariadb.com/kb/en/library/com_reset_connection/
 */
class Reset extends Command {
  constructor(cmdParam, resolve, reject) {
    super(cmdParam, resolve, reject);
  }

  start(out, opts, info) {
    if (opts.logger.query) opts.logger.query('RESET');
    this.onPacketReceive = this.readResetResponsePacket;
    out.fastFlush(this, RESET_COMMAND);
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
    packet.skip(1); //skip header
    packet.skipLengthCodedNumber(); //affected rows
    packet.skipLengthCodedNumber(); //insert ids

    info.status = packet.readUInt16();
    if (info.redirectRequest && (info.status & ServerStatus.STATUS_IN_TRANS) === 0) {
      info.redirect(info.redirectRequest, this.successEnd.bind(this));
    } else {
      this.successEnd();
    }
  }
}

export default Reset;
