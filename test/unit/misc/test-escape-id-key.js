//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB Corporation Ab

'use strict';

const { assert } = require('chai');
const TextEncoder = require('../../../lib/cmd/encoder/text-encoder');
const Utils = require('../../../lib/misc/utils');
const ConnOptions = require('../../../lib/config/connection-options');
const ConnectionInformation = require('../../../lib/misc/connection-information');

// With permitSetMultiParamEntries, object keys become column names. A key holding
// a backtick would otherwise close the identifier and let the rest of the key be
// parsed as SQL, letting a caller write columns the application never named
// (CONJS-369).
const MALICIOUS_KEY = "secret` = 'PWNED', `name";

describe('identifier escaping of object keys', () => {
  it('escapeId doubles backticks', () => {
    assert.equal(TextEncoder.escapeId('a`b'), '`a``b`');
    assert.equal(TextEncoder.escapeId('plain'), '`plain`');
    // reserved words must stay quoted even without special characters
    assert.equal(TextEncoder.escapeId('order'), '`order`');
    assert.equal(TextEncoder.escapeId(MALICIOUS_KEY), "`secret`` = 'PWNED', ``name`");
  });

  it('escapeId matches the public escapeId for the same input', () => {
    const opts = new ConnOptions({});
    const info = new ConnectionInformation(opts);
    for (const key of ['a`b', 'plain', MALICIOUS_KEY, '``']) {
      assert.equal(TextEncoder.escapeId(key), Utils.escapeId(opts, info, key));
    }
  });

  it('escape() with permitSetMultiParamEntries escapes the key', () => {
    const opts = new ConnOptions({ permitSetMultiParamEntries: true });
    const info = new ConnectionInformation(opts);
    const escaped = Utils.escape(opts, info, { [MALICIOUS_KEY]: 'ignored' });

    // the whole key must remain inside a single identifier
    assert.equal(escaped, "`secret`` = 'PWNED', ``name`='ignored'");
  });

  it('escape() leaves ordinary keys usable', () => {
    const opts = new ConnOptions({ permitSetMultiParamEntries: true });
    const info = new ConnectionInformation(opts);
    assert.equal(Utils.escape(opts, info, { name: 'bob', id: 3 }), "`name`='bob',`id`=3");
  });
});
