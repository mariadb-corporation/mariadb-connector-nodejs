const Command = require("../../command");

/**
 * Send password in clear.
 * (used only when SSL is active)
 */
class ClearPasswordAuth extends Command {
  constructor(packSeq, pluginData, callback) {
    super();
    this.pluginData = pluginData;
    this.sequenceNo = packSeq;
    this.onResult = callback;
  }

  start(out, opts, info) {
    out.startPacket(this);
    if (opts.password && opts.password.isEmpty()) {
      out.writeString(opts.password);
    }
    out.flushBuffer(true);
    return this.response;
  }

  response(packet, out, opts, info) {
    if (packet && packet.peek() === 0xff) {
      let err = packet.readError(info);
      return this.throwError(err);
    }
    this.callback(opts);
  }
}

module.exports = ClearPasswordAuth;
