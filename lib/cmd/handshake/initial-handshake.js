'use strict';

const Capabilities = require('../../const/capabilities');
const ConnectionInformation = require('../../misc/connection-information');

/**
 * Parser server initial handshake.
 * see https://mariadb.com/kb/en/library/1-connecting-connecting/#initial-handshake-packet
 */
class InitialHandshake {
  constructor(packet, info) {
    //protocolVersion
    packet.skip(1);
    info.serverVersion = {};
    info.serverVersion.raw = packet.readStringNullEnded();
    info.threadId = packet.readUInt32();

    let seed1 = packet.readBuffer(8);
    packet.skip(1); //reserved byte

    info.serverCapabilities = packet.readUInt16();
    //skip characterSet
    packet.skip(1);
    info.status = packet.readUInt16();
    info.serverCapabilities += packet.readUInt16() << 16;

    let saltLength = 0;
    if (info.serverCapabilities & Capabilities.PLUGIN_AUTH) {
      saltLength = Math.max(12, packet.readUInt8() - 9);
    } else {
      packet.skip(1);
    }
    packet.skip(10);

    if (info.serverCapabilities & Capabilities.SECURE_CONNECTION) {
      let seed2 = packet.readBuffer(saltLength);
      info.seed = Buffer.concat([seed1, seed2]);
    } else {
      info.seed = seed1;
    }
    packet.skip(1);

    /**
     * check for MariaDB 10.x replication hack , remove fake prefix if needed
     * MDEV-4088: in 10.0+, the real version string maybe prefixed with "5.5.5-",
     * to workaround bugs in Oracle MySQL replication
     **/

    if (info.serverVersion.raw.startsWith('5.5.5-')) {
      info.serverVersion.mariaDb = true;
      info.serverVersion.raw = info.serverVersion.raw.substring('5.5.5-'.length);
    } else {
      //Support for MDEV-7780 faking server version
      info.serverVersion.mariaDb =
        info.serverVersion.raw.includes('MariaDB') ||
        (info.serverCapabilities & Capabilities.MYSQL) === 0;
    }

    if (info.serverCapabilities & Capabilities.PLUGIN_AUTH) {
      this.pluginName = packet.readStringNullEnded();
    } else {
      this.pluginName = '';
    }
    ConnectionInformation.parseVersionString(info);
  }
}

module.exports = InitialHandshake;
