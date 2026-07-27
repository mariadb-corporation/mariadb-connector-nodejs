//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB Corporation Ab

'use strict';

import { assert, describe, test } from 'vitest';
import TextEncoder from '../../../lib/cmd/encoder/text-encoder.js';
import * as Utils from '../../../lib/misc/utils.js';
import ConnOptions from '../../../lib/config/connection-options.js';
import ConnectionInformation from '../../../lib/misc/connection-information.js';

// With permitSetMultiParamEntries, object keys become column names. A key holding
// a backtick would otherwise close the identifier and let the rest of the key be
// parsed as SQL, letting a caller write columns the application never named
// (CONJS-369).
const MALICIOUS_KEY = "secret` = 'PWNED', `name";

describe('identifier escaping of object keys', () => {
  test('escapeId doubles backticks', () => {
    assert.equal(TextEncoder.escapeId('a`b'), '`a``b`');
    assert.equal(TextEncoder.escapeId('plain'), '`plain`');
    // reserved words must stay quoted even without special characters
    assert.equal(TextEncoder.escapeId('order'), '`order`');
    assert.equal(TextEncoder.escapeId(MALICIOUS_KEY), "`secret`` = 'PWNED', ``name`");
  });

  test('escapeId matches the public escapeId for the same input', () => {
    const opts = new ConnOptions({});
    const info = new ConnectionInformation(opts);
    for (const key of ['a`b', 'plain', MALICIOUS_KEY, '``']) {
      assert.equal(TextEncoder.escapeId(key), Utils.escapeId(opts, info, key));
    }
  });

  test('escape() with permitSetMultiParamEntries escapes the key', () => {
    const opts = new ConnOptions({ permitSetMultiParamEntries: true });
    const info = new ConnectionInformation(opts);
    const escaped = Utils.escape(opts, info, { [MALICIOUS_KEY]: 'ignored' });

    // the whole key must remain inside a single identifier
    assert.equal(escaped, "`secret`` = 'PWNED', ``name`='ignored'");
    // no bare backtick may terminate the identifier early
    assert.notInclude(escaped.slice(1, escaped.indexOf('=') - 1), '`=');
  });

  test('escape() leaves ordinary keys usable', () => {
    const opts = new ConnOptions({ permitSetMultiParamEntries: true });
    const info = new ConnectionInformation(opts);
    assert.equal(Utils.escape(opts, info, { name: 'bob', id: 3 }), "`name`='bob',`id`=3");
  });
});
