'use strict';

const Capabilities = require('../../const/capabilities');

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
    InitialHandshake.parseVersionString(info);
  }

  static parseVersionString(info) {
    let car;
    let offset = 0;
    let type = 0;
    let val = 0;

    for (; offset < info.serverVersion.raw.length; offset++) {
      car = info.serverVersion.raw.charCodeAt(offset);
      if (car < 48 || car > 57) {
        switch (type) {
          case 0:
            info.serverVersion.major = val;
            break;
          case 1:
            info.serverVersion.minor = val;
            break;
          case 2:
            info.serverVersion.patch = val;
            return;
        }
        type++;
        val = 0;
      } else {
        val = val * 10 + car - 48;
      }
    }
    //serverVersion finished by number like "5.5.57", assign patchVersion
    if (type === 2) info.serverVersion.patch = val;
  }
}

module.exports = InitialHandshake;
