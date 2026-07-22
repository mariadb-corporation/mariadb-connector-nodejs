//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import { assert, describe, test } from 'vitest';

import Handshake from '../../../lib/cmd/handshake/auth/handshake.js';

// computeTlsFingerprint is the last step of the self-signed TLS fingerprint handshake. Whether the
// mode is entered at all (remote MariaDB >= 11.4.1, password, no CA) is decided upstream in
// connection.js#createSecureContext and threaded in via info.useFingerprintValidation; here we check
// that computeTlsFingerprint honours that flag and only fires for a self-signed certificate.

// "gate open" inputs; `over` flips individual conditions.
const openInfo = (over = {}) => ({ useFingerprintValidation: true, selfSignedCertificate: true, ...over });
const cert = (fingerprint256) => ({ fingerprint256 });

describe.concurrent('Handshake.computeTlsFingerprint (fingerprint gating)', () => {
  test('gate open + real cert -> colon-stripped, lower-cased fingerprint', () => {
    assert.equal(Handshake.computeTlsFingerprint(openInfo(), cert('AB:CD:EF:01')), 'abcdef01');
  });

  test('null cert -> null', () => {
    assert.equal(Handshake.computeTlsFingerprint(openInfo(), null), null);
  });

  test('fingerprint mode not entered (useFingerprintValidation false) -> null', () => {
    assert.equal(Handshake.computeTlsFingerprint(openInfo({ useFingerprintValidation: false }), cert('AB:CD')), null);
  });

  test('CA-verified cert (not self-signed) -> null', () => {
    assert.equal(Handshake.computeTlsFingerprint(openInfo({ selfSignedCertificate: false }), cert('AB:CD')), null);
  });
});
