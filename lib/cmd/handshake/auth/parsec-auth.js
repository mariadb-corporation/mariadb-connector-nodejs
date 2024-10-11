//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

const PluginAuth = require('./plugin-auth');
const crypto = require('crypto');
const Errors = require('../../../misc/errors');

/**
 * Standard authentication plugin
 */
class ParsecAuth extends PluginAuth {
  constructor(packSeq, compressPackSeq, pluginData, cmdParam, reject, multiAuthResolver) {
    super(cmdParam, multiAuthResolver, reject);
    this.multiAuthResolver = multiAuthResolver;
    this.pluginData = pluginData;
    this.sequenceNo = packSeq;
    this.compressSequenceNo = compressPackSeq;
  }

  start(out, opts, info) {
    if (!info.extSalt) {
      out.startPacket(this);
      out.writeEmptyPacket(true); // indicate need salt
      this.onPacketReceive = this.requestForSalt;
    } else {
      this.parseExtSalt(Buffer.from(info.extSalt, 'hex'), info);
      this.sendScramble(out, opts, info);
    }
  }

  requestForSalt(packet, out, opts, info) {
    this.parseExtSalt(packet.readBufferRemaining(), info);
    this.sendScramble(out, opts, info);
  }

  parseExtSalt(extSalt, info) {
    if (extSalt.length < 2 || extSalt[0] !== 0x50 || extSalt[1] > 3) {
      // expected 'P' for KDF algorithm (PBKDF2) and maximum iteration of 8192
      return this.throwError(
        Errors.createFatalError('Wrong parsec authentication format', Errors.ER_AUTHENTICATION_BAD_PACKET, info),
        info
      );
    }
    this.iterations = extSalt[1];
    this.salt = extSalt.slice(2);

    // disable for now until https://jira.mariadb.org/browse/MDEV-34846
    // info.extSalt = extSalt.toString('hex');
  }

  sendScramble(out, opts, info) {
    const derivedKey = crypto.pbkdf2Sync(opts.password || '', this.salt, 1024 << this.iterations, 32, 'sha512');
    const privateKey = toPkcs8der(derivedKey);

    const client_scramble = crypto.randomBytes(32);
    const message = Buffer.concat([this.pluginData, client_scramble]);
    const signature = crypto.sign(null, message, privateKey);

    out.startPacket(this);
    out.writeBuffer(client_scramble, 0, 32);
    out.writeBuffer(signature, 0, 64);
    out.flushPacket();
    this.emit('send_end');
    this.onPacketReceive = this.multiAuthResolver;
  }
}

const toPkcs8der = (rawB64) => {
  // prefix for a private Ed25519
  const prefixPrivateEd25519 = Buffer.from('302e020100300506032b657004220420', 'hex');
  const der = Buffer.concat([prefixPrivateEd25519, rawB64]);
  return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
};

module.exports = ParsecAuth;
