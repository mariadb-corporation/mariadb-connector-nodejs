//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB Corporation Ab

'use strict';

import { assert, describe, test } from 'vitest';
import crypto from 'node:crypto';

import Ed25519PasswordAuth from '../../../lib/cmd/handshake/auth/ed25519-password-auth.js';

// hash() provides the material for self-signed certificate fingerprint validation, a path the
// regular ed25519 handshake never takes. It used to be a partial copy of encryptPassword() that
// still referenced that method's `seed` parameter, throwing `ReferenceError: seed is not defined`
// and killing the process on any such connection (CONJS-356).

const PASSWORD = 'MySup8%rPassw@ord';

// what the server stores in mysql.user.authentication_string for
// `IDENTIFIED VIA ed25519 USING PASSWORD('MySup8%rPassw@ord')`: base64 of the raw public key
const SERVER_STORED_KEY = '6aW9C7ENlasUfymtfMvMZZtnkCVlcb1ssxOLJ0kj/AA';

const newAuth = () =>
  new Ed25519PasswordAuth(
    0,
    0,
    Buffer.alloc(32),
    {},
    () => {},
    () => {}
  );

// wrap a raw 32-byte Ed25519 public key so node's crypto can verify signatures against it
const toSpkiPublicKey = (raw) =>
  crypto.createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]),
    format: 'der',
    type: 'spki'
  });

describe.concurrent('Ed25519PasswordAuth#hash (CONJS-356)', () => {
  test('returns the ed25519 public key the server stores for that password', () => {
    const hash = newAuth().hash({ password: PASSWORD });
    assert.equal(hash.length, 32);
    assert.equal(hash.toString('base64').replace(/=+$/, ''), SERVER_STORED_KEY);
  });

  test('does not depend on the seed and is stable across calls', () => {
    // the bug was a reference to encryptPassword's `seed`: the key must derive from the password
    // alone, whatever plugin data the server sent
    const first = newAuth();
    first.pluginData = Buffer.alloc(32, 1);
    const second = newAuth();
    second.pluginData = crypto.randomBytes(32);

    const hash = first.hash({ password: PASSWORD });
    assert.deepEqual(second.hash({ password: PASSWORD }), hash);
    assert.deepEqual(first.hash({ password: PASSWORD }), hash);
  });

  test('differs per password', () => {
    const auth = newAuth();
    assert.notDeepEqual(auth.hash({ password: PASSWORD }), auth.hash({ password: PASSWORD + 'x' }));
  });

  test('is the public key that verifies an encryptPassword() signature', () => {
    // hash() and encryptPassword() derive the same scalar: the signature the driver sends during
    // the handshake must verify against the key hash() reports
    const seed = crypto.randomBytes(32);
    const signature = Ed25519PasswordAuth.encryptPassword(PASSWORD, seed);
    assert.equal(signature.length, 64);

    const publicKey = toSpkiPublicKey(newAuth().hash({ password: PASSWORD }));
    assert.isTrue(crypto.verify(null, seed, publicKey, signature));
    assert.isFalse(crypto.verify(null, crypto.randomBytes(32), publicKey, signature));
  });

  test('feeds the fingerprint digest the server expects', () => {
    // Authentication#validateFingerPrint computes sha256(pwdHash + seed + tlsFingerprint)
    const seed = crypto.randomBytes(32);
    const fingerprint = crypto.randomBytes(32).toString('hex');
    const digest = crypto
      .createHash('sha256')
      .update(newAuth().hash({ password: PASSWORD }))
      .update(seed)
      .update(Buffer.from(fingerprint, 'hex'))
      .digest();
    assert.equal(digest.length, 32);
    assert.deepEqual(
      digest,
      crypto
        .createHash('sha256')
        .update(Buffer.from(SERVER_STORED_KEY, 'base64'))
        .update(seed)
        .update(Buffer.from(fingerprint, 'hex'))
        .digest()
    );
  });

  test('ed25519 is MitM proof, so the hash may be disclosed', () => {
    assert.isTrue(newAuth().isMitmProof());
  });
});
