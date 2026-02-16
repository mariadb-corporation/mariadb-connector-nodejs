//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import Collations from '../../../lib/const/collations.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';

describe.concurrent('collations', () => {
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

  test('fromName utf8mb4 default value', () => {
    const collation = Collations.fromName('UCA1400_AI_CI');
    assert.isDefined(collation);
    assert.equal(collation.name, 'UCA1400_AI_CI');
    assert.equal(collation.maxLength, 4);
  });

  test('fromCharsetAndName utf8mb4 with UCA1400_AI_CI', () => {
    const collation = Collations.fromCharsetAndName('utf8mb4', 'UCA1400_AI_CI');
    assert.isDefined(collation);
    assert.equal(collation.name, 'UCA1400_AI_CI');
    assert.equal(collation.maxLength, 4);
  });

  test('fromCharsetAndName utf8mb3 with UCA1400_AI_CI', () => {
    const collation = Collations.fromCharsetAndName('utf8mb3', 'UCA1400_AI_CI');
    assert.isDefined(collation);
    assert.equal(collation.name, 'UCA1400_AI_CI');
    assert.equal(collation.maxLength, 3);
  });

  test('fromCharsetAndName utf8 defaults to utf8mb4', () => {
    const collation = Collations.fromCharsetAndName('utf8', 'UCA1400_AI_CI');
    assert.isDefined(collation);
    assert.equal(collation.name, 'UCA1400_AI_CI');
    assert.equal(collation.maxLength, 4);
  });

  test('fromCharsetAndName non-utf8 charset', () => {
    const collation = Collations.fromCharsetAndName('latin1', 'LATIN1_SWEDISH_CI');
    assert.isDefined(collation);
    assert.equal(collation.name, 'LATIN1_SWEDISH_CI');
    assert.equal(collation.charset, 'latin1');
  });

  test('fromCharsetAndName unknown collation', () => {
    assert.isUndefined(Collations.fromCharsetAndName('utf8mb4', 'UNKNOWN_COLLATION'));
  });

  test('fromCharsetAndName both charset and collation unknown', () => {
    assert.isUndefined(Collations.fromCharsetAndName('unknown', 'UNKNOWN_COLLATION'));
  });

  test('fromCharsetAndName UTF8_ compatibility fallback to UTF8MB4_', () => {
    const collation = Collations.fromCharsetAndName('utf8mb4', 'UTF8_GENERAL_CI');
    assert.isDefined(collation);
    assert.equal(collation.name, 'UTF8MB4_GENERAL_CI');
    assert.equal(collation.maxLength, 4);
  });

  test('fromCharsetAndName ucs2 with UCA1400_AI_CI', () => {
    const collation = Collations.fromCharsetAndName('ucs2', 'UCA1400_AI_CI');
    assert.isDefined(collation);
    assert.equal(collation.name, 'UCA1400_AI_CI');
    assert.equal(collation.charset, 'ucs2');
  });

  test('fromCharsetAndName utf16 with UCA1400_AI_CI', () => {
    const collation = Collations.fromCharsetAndName('utf16', 'UCA1400_AI_CI');
    assert.isDefined(collation);
    assert.equal(collation.name, 'UCA1400_AI_CI');
    assert.equal(collation.charset, 'utf16');
  });

  test('fromCharsetAndName utf8mb4 with UTF8MB4_UNICODE_CI', () => {
    const collation = Collations.fromCharsetAndName('utf8mb4', 'UTF8MB4_UNICODE_CI');
    assert.isDefined(collation);
    assert.equal(collation.name, 'UTF8MB4_UNICODE_CI');
    assert.equal(collation.maxLength, 4);
  });

  test('fromCharsetAndName utf8mb3 with UTF8MB3_GENERAL_CI', () => {
    const collation = Collations.fromCharsetAndName('utf8mb3', 'UTF8MB3_GENERAL_CI');
    assert.isDefined(collation);
    assert.equal(collation.name, 'UTF8MB3_GENERAL_CI');
    assert.equal(collation.maxLength, 3);
  });
});
