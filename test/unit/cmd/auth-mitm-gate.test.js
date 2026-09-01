//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import { assert, describe, test } from 'vitest';

import Authentication from '../../../lib/cmd/handshake/authentication.js';
import ChangeUser from '../../../lib/cmd/change-user.js';
import CachingSha2PasswordAuth from '../../../lib/cmd/handshake/auth/caching-sha2-password-auth.js';
import Connection from '../../../lib/connection.js';
import ConnOptions from '../../../lib/config/connection-options.js';
import * as Capabilities from '../../../lib/const/capabilities.js';
import * as Errors from '../../../lib/misc/errors.js';
import Collations from '../../../lib/const/collations.js';

// Self-signed fingerprint mode (MariaDB >= 11.4.1, password, no pinned CA): TLS is told to accept
// the certificate, which is then authenticated by the fingerprint hash of the ending OK packet.
// Two properties are checked here, the second resting on the first:
//   - a self-signed connection cannot complete without that hash, so the peer is authenticated;
//   - the initial handshake refuses to hand a password to a plugin a man in the middle could use,
//     while COM_CHANGE_USER does not need to, the session being authenticated by then.

// "gate open" state: peer force-trusted on a fingerprint-capable server
const openInfo = (over = {}) => ({
  useFingerprintValidation: true,
  requireValidCert: true, // implied by useFingerprintValidation, see connection.js#createSecureContext
  selfSignedCertificate: true,
  clientCapabilities: Capabilities.PLUGIN_AUTH,
  status: 0,
  threadId: 1,
  isMariaDB: () => true,
  ...over
});

const connOpts = (over = {}) => ({
  host: 'localhost',
  password: 'SECRET_P@ssw0rd',
  ssl: true, // TLS is up, which is why requireSecure() alone does not protect the password
  restrictedAuth: null,
  collation: Collations.fromIndex(224),
  logger: {},
  ...over
});

const newAuthentication = (opts, reject) =>
  new Authentication(
    { opts },
    opts.host,
    () => {},
    reject,
    () => {},
    () => {}
  );

const newChangeUser = (cmdOpts, opts, reject) =>
  new ChangeUser(
    { opts: cmdOpts },
    opts,
    () => {},
    reject,
    () => {}
  );

// AuthSwitchRequest packet, reduced to what dispatchAuthSwitchRequest reads
const authSwitchPacket = (pluginName) => {
  let read = false;
  return {
    skip: () => {},
    remaining: () => (read ? 0 : 1),
    readStringNullEnded: () => pluginName,
    readBufferRemaining: () => {
      read = true;
      return Buffer.alloc(0);
    }
  };
};

// ending OK packet, with or without the certificate fingerprint hash the server appends
const okPacket = (validationHash) => ({
  peek: () => 0x00,
  skip: () => {},
  skipLengthCodedNumber: () => {},
  readUInt16: () => 0,
  remaining: () => (validationHash ? validationHash.length : 0),
  readBufferLengthEncoded: () => validationHash
});

// output stream recording everything a plugin would put on the wire
const recordingOut = () => {
  const written = [];
  return {
    written,
    startPacket: () => {},
    flushPacket: () => {},
    flush: () => {},
    writeInt8: () => {},
    writeBuffer: (buf) => written.push(buf.toString('latin1')),
    writeString: (str) => written.push(str)
  };
};

// state of a session whose initial authentication succeeded: the fingerprint mode is over
const postAuthInfo = (over = {}) => openInfo({ useFingerprintValidation: false, ...over });

const newCachingSha2 = (resolver, reject) =>
  new CachingSha2PasswordAuth(0, 0, Buffer.alloc(21), { opts: connOpts() }, reject, resolver);

const tick = () => new Promise(process.nextTick); // commands reject/resolve on next tick

describe.concurrent('self-signed certificate is authenticated by the ending OK packet', () => {
  test('no fingerprint hash -> connection refused', async () => {
    let error = null;
    const cmd = newAuthentication(connOpts(), (err) => (error = err));

    cmd.handshakeResult(okPacket(null), recordingOut(), connOpts(), openInfo());
    await tick();

    assert.isNotNull(error, 'a self-signed peer must not be accepted without a fingerprint hash');
    assert.equal(error.errno, Errors.client.ER_SELF_SIGNED);
  });

  test('empty fingerprint hash -> connection refused', async () => {
    let error = null;
    const cmd = newAuthentication(connOpts(), (err) => (error = err));

    cmd.handshakeResult(okPacket(Buffer.alloc(0)), recordingOut(), connOpts(), openInfo());
    await tick();

    assert.isNotNull(error);
    assert.equal(error.errno, Errors.client.ER_SELF_SIGNED);
  });

  test('wrong fingerprint hash -> connection refused', async () => {
    let error = null;
    const cmd = newAuthentication(connOpts(), (err) => (error = err));

    // 0x01 = SHA256, followed by a hash that cannot match the expected one
    const hash = Buffer.concat([Buffer.from([0x01]), Buffer.from('00'.repeat(32), 'ascii')]);
    cmd.handshakeResult(
      okPacket(hash),
      recordingOut(),
      connOpts(),
      openInfo({ tlsFingerprint: 'ab'.repeat(32), seed: Buffer.alloc(20) })
    );
    await tick();

    assert.isNotNull(error);
    assert.equal(error.errno, Errors.client.ER_SELF_SIGNED);
  });
});

describe.concurrent('fingerprint mode ends with the initial authentication', () => {
  test('a successful authentication clears useFingerprintValidation', () => {
    const conn = new Connection(new ConnOptions({ pipelining: false }));
    conn.info.useFingerprintValidation = true;
    conn.streamIn = {};
    conn.connectResolveFct = () => {};
    conn.waitingAuthenticationQueue = { toArray: () => [] };
    // the session setup that follows is not what is under test
    for (const step of [
      'executeSessionVariableQuery',
      'handleCharset',
      'handleTimezone',
      'checkServerVersion',
      'executeInitQuery',
      'executeSessionTimeout'
    ]) {
      conn[step] = () => Promise.resolve();
    }

    conn.authSucceedHandler();

    assert.isFalse(conn.info.useFingerprintValidation, 'the mode must not outlive the handshake');
  });

  test('COM_CHANGE_USER does not expect a fingerprint hash of its own', async () => {
    const opts = connOpts();
    let error = null;
    let resolved = false;
    const cmd = new ChangeUser(
      { opts: { user: 'admin', password: 'CHANGEUSER_SECRET' } },
      opts,
      () => (resolved = true),
      (err) => (error = err),
      () => {}
    );

    // requireValidCert is still set, but the server does not resend a hash on COM_CHANGE_USER
    cmd.handshakeResult(okPacket(null), recordingOut(), opts, postAuthInfo());
    await tick();

    assert.isNull(error, 'certificate validation must be skipped on COM_CHANGE_USER');
    assert.isTrue(resolved);
  });

  test('caching_sha2_password full authentication is refused during the handshake', async () => {
    let error = null;
    const plugin = newCachingSha2(
      () => {},
      (err) => (error = err)
    );
    const out = recordingOut();

    plugin.state = 'FAST_AUTH_RESULT';
    plugin.exchange(Buffer.from([0x01, 0x04]), out, connOpts(), openInfo());
    await tick();

    assert.isNotNull(error, 'peer not authenticated yet, the password must not be sent in clear');
    assert.equal(error.errno, Errors.client.ER_SELF_SIGNED_SHA256);
    assert.deepEqual(out.written, []);
  });

  test('caching_sha2_password full authentication works on COM_CHANGE_USER', async () => {
    let error = null;
    const plugin = newCachingSha2(
      () => {},
      (err) => (error = err)
    );
    const out = recordingOut();

    plugin.state = 'FAST_AUTH_RESULT';
    plugin.exchange(Buffer.from([0x01, 0x04]), out, connOpts(), postAuthInfo());
    await tick();

    assert.isNull(error, 'the session is authenticated, full authentication must proceed');
    assert.deepEqual(out.written, ['SECRET_P@ssw0rd']);
  });
});

describe.concurrent('cleartext plugins over an insecure channel', () => {
  // requireSecure() is independent of any certificate decision, so it also holds for COM_CHANGE_USER
  const plainInfo = () => openInfo({ useFingerprintValidation: false, selfSignedCertificate: false });

  for (const pluginName of ['mysql_clear_password', 'dialog']) {
    test(`${pluginName} is refused on COM_CHANGE_USER without TLS`, async () => {
      const opts = connOpts({ ssl: undefined });
      let error = null;
      const cmd = newChangeUser({ user: 'admin', password: 'CHANGEUSER_SECRET' }, opts, (err) => (error = err));
      const out = recordingOut();

      cmd.dispatchAuthSwitchRequest(authSwitchPacket(pluginName), out, opts, plainInfo());
      await tick();

      assert.isNotNull(error, `${pluginName} must not run over a plain TCP connection`);
      assert.equal(error.errno, Errors.client.ER_CLEAR_PASSWORD_WITHOUT_SSL);
      assert.deepEqual(out.written, [], 'no credential must be written for a refused plugin');
    });
  }

  test('mysql_clear_password is accepted on COM_CHANGE_USER over TLS', async () => {
    const opts = connOpts(); // ssl: true
    let error = null;
    const cmd = newChangeUser({ user: 'admin', password: 'CHANGEUSER_SECRET' }, opts, (err) => (error = err));

    cmd.dispatchAuthSwitchRequest(authSwitchPacket('mysql_clear_password'), recordingOut(), opts, plainInfo());
    await tick();

    assert.isNull(error);
  });
});

describe.concurrent('AuthSwitchRequest(mysql_clear_password) for a force-trusted peer', () => {
  test('initial handshake refuses it: the peer is not authenticated yet', async () => {
    const opts = connOpts();
    let error = null;
    const cmd = newAuthentication(opts, (err) => (error = err));
    const out = recordingOut();

    cmd.dispatchAuthSwitchRequest(authSwitchPacket('mysql_clear_password'), out, opts, openInfo());
    await tick();

    assert.isNotNull(error, 'password must not be sent in clear to an unauthenticated peer');
    assert.equal(error.errno, Errors.client.ER_SELF_SIGNED_BAD_PLUGIN);
    assert.deepEqual(out.written, [], 'no credential must be written for a refused plugin');
  });

  test('COM_CHANGE_USER accepts it: the session was authenticated at connection time', async () => {
    const opts = connOpts();
    let error = null;
    const cmd = newChangeUser({ user: 'admin', password: 'CHANGEUSER_SECRET' }, opts, (err) => (error = err));

    // certificate validation is skipped, and with it the plugin guard: reaching COM_CHANGE_USER in
    // this state means the fingerprint hash above was validated, so the peer is the real server.
    assert.isFalse(cmd.validateServerCert());

    cmd.dispatchAuthSwitchRequest(authSwitchPacket('mysql_clear_password'), recordingOut(), opts, openInfo());
    await tick();

    assert.isNull(error, 'mysql_clear_password over an authenticated session must not be refused');
  });

  test('a MitM-proof plugin is accepted on either path', async () => {
    const opts = connOpts();
    const info = openInfo({ seed: Buffer.alloc(32) });
    let initialError = null;
    let changeUserError = null;

    newAuthentication(opts, (err) => (initialError = err)).dispatchAuthSwitchRequest(
      authSwitchPacket('client_ed25519'),
      recordingOut(),
      opts,
      info
    );
    newChangeUser(
      { user: 'admin', password: 'CHANGEUSER_SECRET' },
      opts,
      (err) => (changeUserError = err)
    ).dispatchAuthSwitchRequest(authSwitchPacket('client_ed25519'), recordingOut(), opts, info);
    await tick();

    assert.isNull(initialError, 'client_ed25519 is MitM-proof and must not be refused');
    assert.isNull(changeUserError);
  });
});
