//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import PluginAuth from './plugin-auth.js';
import crypto from 'node:crypto';
import * as Errors from '../../../misc/errors.js';

const pkcs8Ed25519header = Buffer.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20
]);

// The PBKDF2 iteration factor comes from the server's ext-salt and is an exponent: effective work is
// `1024 << factor` rounds of PBKDF2-HMAC-SHA512. A malicious or MitM server sending a large factor
// would otherwise pin a libuv thread (and, with the synchronous API, the whole event loop) for
// minutes. Hard ceiling, unlike the Java/C connectors that let the bound scale with connectTimeout:
// the blast radius here is process-wide.
const MAX_ITERATION_FACTOR = 8;

// budget used when connectTimeout is disabled (0), matching the server default connect timeout
const DEFAULT_CONNECT_TIMEOUT_BUDGET = 10000;

// Deliberately conservative PBKDF2-HMAC-SHA512 throughput (262144 rounds / 225ms), roughly half the
// rate measured on a Node 22 / i9-11900K, so slower hosts stay within their connection time budget.
const PBKDF2_ROUNDS_PER_MS = 262144 / 225;

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
      if (!this.parseExtSalt(Buffer.from(info.extSalt, 'hex'), opts, info)) return;
      this.sendScramble(out, opts, info);
    }
  }

  requestForSalt(packet, out, opts, info) {
    if (!this.parseExtSalt(packet.readBufferRemaining(), opts, info)) return;
    this.sendScramble(out, opts, info);
  }

  /**
   * Maximum PBKDF2 iteration factor accepted from the server, given the time available to establish
   * the connection. The bound is capped by {@link MAX_ITERATION_FACTOR} whatever the budget is.
   *
   * @param connectTimeout  connectTimeout option value (0 or NaN meaning no timeout configured)
   * @returns {number} maximum accepted iteration factor, in [0, MAX_ITERATION_FACTOR]
   */
  static maxIterationFactor(connectTimeout) {
    const budget = connectTimeout > 0 ? connectTimeout : DEFAULT_CONNECT_TIMEOUT_BUDGET;
    const affordable = Math.floor(Math.log2((PBKDF2_ROUNDS_PER_MS * budget) / 1024));
    return Math.min(MAX_ITERATION_FACTOR, Math.max(0, affordable));
  }

  /**
   * Parse the server ext-salt: KDF algorithm, iteration factor and salt.
   *
   * @param extSalt server ext-salt
   * @param opts    connection options
   * @param info    connection information
   * @returns {boolean} true when ext-salt is valid, false when the command has been rejected
   */
  parseExtSalt(extSalt, opts, info) {
    let pos = 0;
    if (extSalt[pos] == 0x01) pos += 1;

    if (extSalt.length < pos + 2 || extSalt[pos] !== 0x50) {
      // expected 'P' for KDF algorithm (PBKDF2)
      this.throwError(
        Errors.createFatalError('Wrong parsec authentication format', Errors.client.ER_AUTHENTICATION_BAD_PACKET, info),
        info
      );
      return false;
    }

    const iterationFactor = extSalt[pos + 1];
    const maxIterationFactor = ParsecAuth.maxIterationFactor(opts.connectTimeout);
    if (iterationFactor > maxIterationFactor) {
      // server asks for more key derivation work than this connection can afford
      this.throwError(
        Errors.createFatalError(
          `Parsec authentication iteration factor ${iterationFactor} exceeds the maximum permitted value ` +
            `${maxIterationFactor} (${1024 << maxIterationFactor} PBKDF2 rounds)`,
          Errors.client.ER_AUTHENTICATION_BAD_PACKET,
          info
        ),
        info
      );
      return false;
    }

    this.iterations = iterationFactor;
    this.salt = extSalt.slice(pos + 2);

    // disable for now until https://jira.mariadb.org/browse/MDEV-34846
    // info.extSalt = extSalt.toString('hex');
    return true;
  }

  sendScramble(out, opts, info) {
    // any packet received while the derivation is running can only be an error packet: let the
    // authentication resolver handle it rather than re-entering the ext-salt parsing.
    this.onPacketReceive = this.multiAuthResolver;

    // asynchronous PBKDF2: the derivation runs on the libuv threadpool. The synchronous variant would
    // block the event loop for the whole (server-driven) computation, freezing every other connection,
    // query and timer of the process - including the connectTimeout timer meant to interrupt it.
    crypto.pbkdf2(opts.password || '', this.salt, 1024 << this.iterations, 32, 'sha512', (err, derivedKey) => {
      if (err) {
        return this.throwError(
          Errors.createFatalError(
            `Error during parsec authentication key derivation: ${err.message}`,
            Errors.client.ER_AUTHENTICATION_BAD_PACKET,
            info
          ),
          info
        );
      }
      try {
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
      } catch (e) {
        // the connection might have been closed while the derivation was running
        this.throwError(
          Errors.createFatalError(
            `Error during parsec authentication: ${e.message}`,
            Errors.client.ER_AUTHENTICATION_BAD_PACKET,
            info
          ),
          info
        );
      }
    });
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

  isMitmProof() {
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

export default ParsecAuth;
