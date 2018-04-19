const Command = require("../../command");
const Utils = require("../../../misc/utils");

/**
 * Use PAM authentication
 */
class PamPasswordAuth extends Command {
  constructor(packSeq, pluginData, callback) {
    super();
    this.pluginData = pluginData;
    this.sequenceNo = packSeq;
    this.onResult = callback;
  }

  start(out, opts, info) {
    let promptData = this.pluginData.toString(opts.collation.encoding, 1);
    this.exchange(promptData, out, opts, info);
    return this.response;
  }

  exchange(promptData, out, opts, info) {
    //conversation is :
    // - first byte is information tell if question is a password or clear text.
    // - other bytes are the question to user

    if ("Password: ".equals(promptData) && this.password != null && !"".equals(this.password)) {
      //ask for password
      this.out.startPacket(this);
      this.out.writeString(this.password);
    } else {
      // 2 means "read the input with the echo enabled"
      // 4 means "password-like input, echo disabled" - not implemented

      //ask user to answer
      const password = prompt(promptData, "");

      if (!(password)) {
        const err = Utils.createError(
          "Error during PAM authentication : dialog input cancelled",
          true,
          info
        );
        return this.throwError(err);
      }
      this.out.startPacket(this);
      this.out.writeString(password);
    }

    this.out.writeInt8(0);
    this.out.flushBuffer(true);
  }

  response(packet, out, opts, info) {
    this.sequenceNo++;

    if (packet.peek() === 0x00) {
      this.callback(opts);
      return;
    }

    let promptData = packet.readBuffer();
    this.exchange(promptData, out, opts, info)();
    return this.response;
  }
}

module.exports = PamPasswordAuth;
