//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

/**
 * Ok_Packet
 * see https://mariadb.com/kb/en/ok_packet/
 */
class OkPacket {
  constructor(affectedRows, insertId, warningStatus) {
    this.affectedRows = affectedRows;
    this.insertId = insertId;
    this.warningStatus = warningStatus;
  }
}

module.exports = OkPacket;
