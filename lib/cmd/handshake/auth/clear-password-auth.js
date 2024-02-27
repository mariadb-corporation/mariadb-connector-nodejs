//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

const PluginAuth = require('./plugin-auth');

/**
 * Send password in clear.
 * (used only when SSL is active)
 */
class ClearPasswordAuth extends PluginAuth {
  constructor(packSeq, compressPackSeq, pluginData, cmdParam, reject, multiAuthResolver) {
    super(cmdParam, multiAuthResolver, reject);
    this.sequenceNo = packSeq;
    this.compressSequenceNo = compressPackSeq;
    this.counter = 0;
    this.multiAuthResolver = multiAuthResolver;
  }

  start(out, opts, info) {
    out.startPacket(this);
    const pwd = opts.password;
    if (pwd) {
      if (Array.isArray(pwd)) {
        out.writeString(pwd[this.counter++]);
      } else {
        out.writeString(pwd);
      }
    }
    out.writeInt8(0);
    out.flushPacket();
    this.onPacketReceive = this.response;
  }

  response(packet, out, opts, info) {
    const marker = packet.peek();
    switch (marker) {
      //*********************************************************************************************************
      //* OK_Packet and Err_Packet ending packet
      //*********************************************************************************************************
      case 0x00:
      case 0xff:
        this.emit('send_end');
        return this.multiAuthResolver(packet, out, opts, info);

      default:
        packet.readBuffer(); // prompt
        out.startPacket(this);

        out.writeString('password');
        out.writeInt8(0);
        out.flushPacket();
    }
  }
}

module.exports = ClearPasswordAuth;
