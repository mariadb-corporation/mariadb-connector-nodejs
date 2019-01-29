const Command = require("../../command");

/**
 * Send password in clear.
 * (used only when SSL is active)
 */
class ClearPasswordAuth extends Command {
  constructor(packSeq, pluginData, resolve, reject) {
    super(resolve, reject);
    this.sequenceNo = packSeq;
  }

  start(out, opts, info) {
    out.startPacket(this);
    if (opts.password) out.writeString(opts.password);
    out.writeInt8(0);
    out.flushBuffer(true);
    this.emit("send_end");
    this.onPacketReceive = this.response;
  }

  response(packet, out, opts, info) {
    if (packet && packet.peek() === 0xff) {
      let err = packet.readError(info);
      return this.throwError(err, info);
    }
    this.successEnd();
  }
}

module.exports = ClearPasswordAuth;
