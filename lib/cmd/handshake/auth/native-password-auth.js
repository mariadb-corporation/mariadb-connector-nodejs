'use strict';

const PluginAuth = require('./plugin-auth');
const Crypto = require('crypto');

/**
 * Standard authentication plugin
 */
class NativePasswordAuth extends PluginAuth {
  constructor(packSeq, compressPackSeq, pluginData, resolve, reject, multiAuthResolver) {
    super(resolve, reject, multiAuthResolver);
    this.pluginData = pluginData;
    this.sequenceNo = packSeq;
    this.compressSequenceNo = compressPackSeq;
  }

  start(out, opts, info) {
    //seed is ended with a null byte value.
    const data = this.pluginData.slice(0, 20);
    let authToken = NativePasswordAuth.encryptPassword(opts.password, data);

    out.startPacket(this);
    out.writeBuffer(authToken, 0, authToken.length);
    out.flushBuffer(true);
    this.emit('send_end');
    this.onPacketReceive = this.successSend;
  }

  static encryptPassword(password, seed) {
    if (!password) return Buffer.alloc(0);

    let hash = Crypto.createHash('sha1');
    let stage1 = hash.update(password, 'utf8').digest();
    hash = Crypto.createHash('sha1');

    let stage2 = hash.update(stage1).digest();
    hash = Crypto.createHash('sha1');

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
