"use strict";

const Command = require("../../command");
const Crypto = require("crypto");

/**
 * Standard authentication plugin
 */
class NativePasswordAuth extends Command {
  constructor(packSeq, pluginData, authResolve, authReject) {
    super();
    this.pluginData = pluginData;
    this.sequenceNo = packSeq;
    this.authResolve = authResolve;
    this.authReject = authReject;
  }

  start(out, opts, info) {
    let authToken = NativePasswordAuth.encryptPassword(opts.password, this.pluginData);
    out.writeBuffer(authToken, 0, authToken.length);
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

  static encryptPassword(password, seed) {
    if (!password) return Buffer.alloc(0);

    let hash = Crypto.createHash("sha1");
    let stage1 = hash.update(password, "utf8").digest();
    hash = Crypto.createHash("sha1");

    let stage2 = hash.update(stage1).digest();
    hash = Crypto.createHash("sha1");

    hash.update(seed);
    hash.update(stage2);

    let digest = hash.digest();
    let returnBytes = Buffer.allocUnsafe(digest.length);
    for (let i = 0; i < digest.length; i++) {
      returnBytes[i] = stage1[i] ^ digest[i];
    }
    return returnBytes;
  }
}

module.exports = NativePasswordAuth;
