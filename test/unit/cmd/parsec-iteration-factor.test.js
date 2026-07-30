//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB Corporation Ab

'use strict';

import { assert, describe, test } from 'vitest';
import crypto from 'node:crypto';

import ParsecAuth from '../../../lib/cmd/handshake/auth/parsec-auth.js';
import * as Errors from '../../../lib/misc/errors.js';

// The PBKDF2 iteration factor is server-controlled (parsec ext-salt) and is an exponent: effective
// work is `1024 << factor` rounds of PBKDF2-HMAC-SHA512. Without a bound, a malicious or MitM server
// can make the driver burn minutes of CPU on a single handshake (CONJS-362).

const newAuth = (reject) => new ParsecAuth(0, 0, Buffer.alloc(32), {}, reject, () => {});

// ext-salt: optional 0x01 prefix, 'P' (PBKDF2), iteration factor, then the salt
const extSalt = (iterationFactor, salt = Buffer.alloc(18, 8)) =>
  Buffer.concat([Buffer.from([0x01, 0x50, iterationFactor]), salt]);

const parse = (buf, connectTimeout) => {
  let err = null;
  const auth = newAuth(() => {});
  // Command#throwError defers the reject to process.nextTick but emits 'end' synchronously
  auth.once('end', (e) => (err = e));
  const ok = auth.parseExtSalt(buf, { connectTimeout }, {});
  return { ok, err: () => err, auth };
};

describe.concurrent('ParsecAuth.maxIterationFactor (CONJS-362)', () => {
  test('hard ceiling of 8, whatever the time budget', () => {
    assert.equal(ParsecAuth.maxIterationFactor(1000), 8); // default connectTimeout
    assert.equal(ParsecAuth.maxIterationFactor(10000), 8);
    assert.equal(ParsecAuth.maxIterationFactor(Number.MAX_SAFE_INTEGER), 8);
  });

  test('tightened for a small time budget', () => {
    assert.equal(ParsecAuth.maxIterationFactor(100), 6);
    assert.equal(ParsecAuth.maxIterationFactor(50), 5);
    assert.equal(ParsecAuth.maxIterationFactor(1), 0);
  });

  test('no timeout configured falls back on a 10s budget', () => {
    assert.equal(ParsecAuth.maxIterationFactor(0), 8);
    assert.equal(ParsecAuth.maxIterationFactor(undefined), 8);
    assert.equal(ParsecAuth.maxIterationFactor(NaN), 8);
  });

  test('never negative', () => {
    assert.equal(ParsecAuth.maxIterationFactor(0.001), 0);
    assert.equal(ParsecAuth.maxIterationFactor(-5000), 8); // negative = no timeout
  });
});

describe.concurrent('ParsecAuth.parseExtSalt', () => {
  test('accepts a factor within the cap', () => {
    const res = parse(extSalt(8), 1000);
    assert.isTrue(res.ok);
    assert.equal(res.err(), null);
    assert.equal(res.auth.iterations, 8);
    assert.deepEqual(res.auth.salt, Buffer.alloc(18, 8));
  });

  test('rejects a factor above the cap (previous limit was 20)', () => {
    for (const factor of [9, 16, 20, 255]) {
      const res = parse(extSalt(factor), 1000);
      assert.isFalse(res.ok, `factor ${factor} must be refused`);
      const err = res.err();
      assert.isNotNull(err, `factor ${factor} must be refused`);
      assert.isTrue(err.message.includes(`iteration factor ${factor} exceeds the maximum permitted value 8`));
      assert.equal(err.errno, Errors.client.ER_AUTHENTICATION_BAD_PACKET);
      assert.isTrue(err.fatal);
    }
  });

  test('cap follows the connection time budget', () => {
    assert.isTrue(parse(extSalt(6), 100).ok);
    assert.isFalse(parse(extSalt(7), 100).ok);
  });

  test('rejects a wrong KDF algorithm or truncated ext-salt', () => {
    for (const buf of [
      Buffer.from([0x01, 0x51, 0x02, 0x08]), // 'Q' instead of 'P'
      Buffer.from([0x01, 0x50]), // no iteration factor
      Buffer.from([0x01]),
      Buffer.alloc(0)
    ]) {
      const res = parse(buf, 1000);
      assert.isFalse(res.ok);
      assert.equal(res.err().text, 'Wrong parsec authentication format');
    }
  });

  test('ext-salt without the 0x01 prefix', () => {
    const res = parse(Buffer.concat([Buffer.from([0x50, 0x04]), Buffer.alloc(4, 7)]), 1000);
    assert.isTrue(res.ok);
    assert.equal(res.auth.iterations, 4);
    assert.deepEqual(res.auth.salt, Buffer.alloc(4, 7));
  });
});

describe.concurrent('ParsecAuth key derivation', () => {
  test('does not block the event loop', async () => {
    let scramble = null;
    const out = {
      startPacket: () => {},
      writeBuffer: (buf) => (scramble = scramble ? scramble : buf),
      flushPacket: () => {}
    };
    let failure = null;
    const auth = newAuth((err) => (failure = err));
    assert.isTrue(auth.parseExtSalt(extSalt(8), { connectTimeout: 1000 }, {}));

    let sent = false;
    const sendEnd = new Promise((resolve) =>
      auth.once('send_end', () => {
        sent = true;
        resolve();
      })
    );

    auth.sendScramble(out, { password: 'MySup8%rPassw@ord' }, {});
    assert.isFalse(sent, 'derivation must not run inline (pbkdf2Sync would have sent the packet already)');

    // the derivation runs on the libuv threadpool: timers keep firing while it progresses, which is
    // what lets connectTimeout interrupt a hostile iteration factor
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.isFalse(sent, 'timers must fire while the key is being derived');

    await sendEnd;
    assert.isNull(failure);
    assert.equal(scramble.length, 32);
    // hash() is the parsec fingerprint material: 'P', factor, salt, then the ed25519 public key
    const hash = auth.hash({});
    assert.equal(hash.length, 2 + 18 + 32);
    assert.equal(hash[0], 0x50);
    assert.equal(hash[1], 8);
    const expectedKey = crypto.pbkdf2Sync('MySup8%rPassw@ord', Buffer.alloc(18, 8), 1024 << 8, 32, 'sha512');
    assert.deepEqual(hash.subarray(2, 20), Buffer.alloc(18, 8));
    assert.deepEqual(
      hash.subarray(20),
      crypto
        .createPublicKey(
          crypto.createPrivateKey({
            key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), expectedKey]),
            format: 'der',
            type: 'pkcs8'
          })
        )
        .export({ type: 'spki', format: 'der' })
        .subarray(-32)
    );
  });
});
