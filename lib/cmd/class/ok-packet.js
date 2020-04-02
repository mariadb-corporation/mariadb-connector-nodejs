'use strict';

const Command = require('../command');

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
