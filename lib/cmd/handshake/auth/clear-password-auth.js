const PluginAuth = require('./plugin-auth');

/**
 * Send password in clear.
 * (used only when SSL is active)
 */
class ClearPasswordAuth extends PluginAuth {
  constructor(packSeq, compressPackSeq, pluginData, cmdParam, resolve, reject, multiAuthResolver) {
    super(cmdParam, resolve, reject, multiAuthResolver);
    this.sequenceNo = packSeq;
  }

  start(out, opts, info) {
    out.startPacket(this);
    const pwd = opts.password;
    if (pwd) {
      if (Array.isArray(pwd)) {
        out.writeString(pwd[0]);
      } else {
        out.writeString(pwd);
      }
    }
    out.writeInt8(0);
    out.flushPacket();
    this.emit('send_end');
    this.onPacketReceive = this.successSend;
  }
}

module.exports = ClearPasswordAuth;
