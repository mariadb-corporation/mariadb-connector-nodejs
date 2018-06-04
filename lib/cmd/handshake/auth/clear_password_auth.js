const Command = require("../../command");

/**
 * Send password in clear.
 * (used only when SSL is active)
 */
class ClearPasswordAuth extends Command {
  constructor(packSeq, pluginData, authResolve, authReject) {
    super();
    this.pluginData = pluginData;
    this.sequenceNo = packSeq;
    this.authResolve = authResolve;
    this.authReject = authReject;
  }

  start(out, opts, info) {
    out.startPacket(this);
    if (opts.password) out.writeString(opts.password);
    out.writeInt8(0);
    out.flushBuffer(true);
    return this.response;
  }

  response(packet, out, opts, info) {
    this.onPacketReceive = null;
    if (packet && packet.peek() === 0xff) {
      let err = packet.readError(info);
      this.authReject(err);
    }
    this.authResolve();
  }
}

module.exports = ClearPasswordAuth;
