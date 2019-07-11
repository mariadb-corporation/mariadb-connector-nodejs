const PluginAuth = require('./plugin-auth');

/**
 * Send password in clear.
 * (used only when SSL is active)
 */
class ClearPasswordAuth extends PluginAuth {
  constructor(packSeq, compressPackSeq, pluginData, resolve, reject, multiAuthResolver) {
    super(resolve, reject, multiAuthResolver);
    this.sequenceNo = packSeq;
  }

  start(out, opts, info) {
    out.startPacket(this);
    if (opts.password) out.writeString(opts.password);
    out.writeInt8(0);
    out.flushBuffer(true);
    this.emit('send_end');
    this.onPacketReceive = this.successSend;
  }
}

module.exports = ClearPasswordAuth;
