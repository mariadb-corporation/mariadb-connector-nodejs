//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import Collations from '../../../lib/const/collations.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';

describe('collations', () => {
  test('fromCharset wrong charset', () => {
    assert.strictEqual(Collations.fromCharset('unknown'), undefined);
  });

  test('fromCharset good charset', () => {
    assert.equal(Collations.fromCharset('utf8mb4').name, 'UTF8MB4_GENERAL_CI');
  });

  test('fromName wrong value', () => {
    assert.equal(Collations.fromName('unknown'), undefined);
  });

  test('fromName good value', () => {
    assert.equal(Collations.fromName('UTF8MB4_GENERAL_CI').name, 'UTF8MB4_GENERAL_CI');
  });

  test('fromIndex wrong index', () => {
    assert.isTrue(Collations.fromIndex(999999) === undefined);
  });

  test('fromIndex good index', () => {
    assert.equal(Collations.fromIndex(33).name, 'UTF8MB3_GENERAL_CI');
  });
});
