//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

const PluginAuth = require('./plugin-auth');
const crypto = require('crypto');
const Errors = require('../../../misc/errors');

const pkcs8Ed25519header = Buffer.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20
]);

/**
 * Standard authentication plugin
 */
class ParsecAuth extends PluginAuth {
  #hash;
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

    const rawPublicKey = this.getEd25519PublicKeyFromPrivateKey(derivedKey);

    this.#hash = Buffer.concat([Buffer.from([0x50, this.iterations]), this.salt, rawPublicKey]);

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

  getEd25519PublicKeyFromPrivateKey(privateKeyBuffer) {
    // Create a KeyObject from the raw private key
    const privateKey = crypto.createPrivateKey({
      key: Buffer.concat([pkcs8Ed25519header, privateKeyBuffer]),
      format: 'der',
      type: 'pkcs8',
      name: 'ed25519'
    });

    // Get the corresponding public key
    const publicKey = crypto.createPublicKey(privateKey);

    // Export the public key in raw format
    return publicKey
      .export({
        type: 'spki',
        format: 'der'
      })
      .subarray(-32); // The last 32 bytes contain the raw key
  }

  permitHash() {
    return true;
  }

  hash(conf) {
    return this.#hash;
  }
}

const toPkcs8der = (rawB64) => {
  // prefix for a private Ed25519
  const prefixPrivateEd25519 = Buffer.from('302e020100300506032b657004220420', 'hex');
  const der = Buffer.concat([prefixPrivateEd25519, rawB64]);
  return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
};

module.exports = ParsecAuth;
