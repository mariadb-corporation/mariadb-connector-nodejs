//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import PluginAuth from './plugin-auth.js';
import Crypto from 'node:crypto';

/**
 * Standard authentication plugin
 */
class NativePasswordAuth extends PluginAuth {
  constructor(packSeq, compressPackSeq, pluginData, cmdParam, reject, multiAuthResolver) {
    super(cmdParam, multiAuthResolver, reject);
    this.pluginData = pluginData;
    this.sequenceNo = packSeq;
    this.compressSequenceNo = compressPackSeq;
  }

  start(out, opts, info) {
    //seed is ended with a null byte value.
    const data = this.pluginData.slice(0, 20);
    let authToken = NativePasswordAuth.encryptSha1Password(opts.password, data);

    out.startPacket(this);
    if (authToken.length > 0) {
      out.writeBuffer(authToken, 0, authToken.length);
      out.flushPacket();
    } else {
      out.writeEmptyPacket(true);
    }
    this.emit('send_end');
  }

  static encryptSha1Password(password, seed) {
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

  permitHash() {
    return true;
  }

  hash(conf) {
    let hash = Crypto.createHash('sha1');
    let stage1 = hash.update(conf.password, 'utf8').digest();
    hash = Crypto.createHash('sha1');
    return hash.update(stage1).digest();
  }
}

export default NativePasswordAuth;
