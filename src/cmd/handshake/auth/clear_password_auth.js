const Command = require("../../command");

/**
 * Send password in clear.
 * (used only when SSL is active)
 */
class ClearPasswordAuth extends Command {
  constructor(packSeq, pluginData, onResult) {
    super();
    this.pluginData = pluginData;
    this.sequenceNo = packSeq - 1;
    this.onResult = onResult;
  }

  start(out, opts, info) {
    out.startPacket(this);
    if (opts.password) out.writeString(opts.password);
    out.writeInt8(0);
    out.flushBuffer(true);
    return this.response;
  }

  response(packet, out, opts, info) {
    if (packet && packet.peek() === 0xff) {
      let err = packet.readError(info);
      return this.throwError(err);
    }
    this.onResult(opts);
  }
}

module.exports = ClearPasswordAuth;
