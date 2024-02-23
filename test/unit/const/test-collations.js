//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

const Collations = require('../../../lib/const/collations');
const { assert } = require('chai');

describe('collations', () => {
  it('fromCharset wrong charset', () => {
    assert.strictEqual(Collations.fromCharset('unknown'), undefined);
  });

  it('fromCharset good charset', () => {
    assert.equal(Collations.fromCharset('utf8mb4').name, 'UTF8MB4_GENERAL_CI');
  });

  it('fromName wrong value', () => {
    assert.equal(Collations.fromName('unknown'), undefined);
  });

  it('fromName good value', () => {
    assert.equal(Collations.fromName('UTF8MB4_GENERAL_CI').name, 'UTF8MB4_GENERAL_CI');
  });

  it('fromIndex wrong index', () => {
    assert.isTrue(Collations.fromIndex(999999) === undefined);
  });

  it('fromIndex good index', () => {
    assert.equal(Collations.fromIndex(33).name, 'UTF8MB3_GENERAL_CI');
  });
});
