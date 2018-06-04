const Command = require("../../command");
const Utils = require("../../../misc/utils");

/**
 * Use PAM authentication
 */
class PamPasswordAuth extends Command {
  constructor(packSeq, pluginData, authResolve, authReject) {
    super();
    this.pluginData = pluginData;
    this.sequenceNo = packSeq;
    this.authResolve = authResolve;
    this.authReject = authReject;
  }

  start(out, opts, info) {
    this.exchange(this.pluginData, out, opts, info);
    return this.response;
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
      //* OK_Packet - authentication succeeded
      //*********************************************************************************************************
      case 0x00:
        this.authResolve();
        return null;

      //*********************************************************************************************************
      //* ERR_Packet
      //*********************************************************************************************************
      case 0xff:
        const err = packet.readError(info);
        err.fatal = true;
        this.authReject(err);
        return null;

      default:
        let promptData = packet.readBuffer();
        this.exchange(promptData, out, opts, info)();
        return this.response;
    }
  }
}

module.exports = PamPasswordAuth;
