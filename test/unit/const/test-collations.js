'use strict';

const Collations = require('../../../lib/const/collations');
const { assert } = require('chai');

describe('collations', () => {
  it('fromCharset wrong charset', () => {
    assert.strictEqual(Collations.fromCharset('unknown'), undefined);
  });

  it('fromCharset good charset', () => {
    assert.equal(Collations.fromCharset('utf8').name, 'UTF8_GENERAL_CI');
  });

  it('fromName wrong value', () => {
    assert.equal(Collations.fromName('unknown'), undefined);
  });

  it('fromName good value', () => {
    assert.equal(Collations.fromName('UTF8_GENERAL_CI').name, 'UTF8_GENERAL_CI');
  });

  it('fromIndex wrong index', () => {
    assert.isTrue(Collations.fromIndex(999999) === undefined);
  });

  it('fromIndex good index', () => {
    assert.equal(Collations.fromIndex(33).name, 'UTF8_GENERAL_CI');
  });
});
