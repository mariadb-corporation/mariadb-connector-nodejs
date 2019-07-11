const PluginAuth = require('./plugin-auth');

/**
 * Use PAM authentication
 */
class PamPasswordAuth extends PluginAuth {
  constructor(packSeq, compressPackSeq, pluginData, resolve, reject, multiAuthResolver) {
    super(resolve, reject, multiAuthResolver);
    this.pluginData = pluginData;
    this.sequenceNo = packSeq;
  }

  start(out, opts, info) {
    this.exchange(this.pluginData, out, opts, info);
    this.onPacketReceive = this.response;
  }

  exchange(buffer, out, opts, info) {
    //conversation is :
    // - first byte is information tell if question is a password (4) or clear text (2).
    // - other bytes are the question to user

    out.startPacket(this);
    if (opts.password) out.writeString(opts.password);
    out.writeInt8(0);
    out.flushBuffer(true);
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
        return this.successSend(packet, out, opts, info);

      default:
        let promptData = packet.readBuffer();
        this.exchange(promptData, out, opts, info)();
        this.onPacketReceive = this.response;
    }
  }
}

module.exports = PamPasswordAuth;
