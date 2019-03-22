'use strict';

const Collations = require('../../../lib/const/collations');
const { assert } = require('chai');

describe('collations', () => {
  it('fromEncoding wrong encoding', () => {
    try {
      Collations.fromEncoding('unknown');
    } catch (err) {
      assert.isTrue(err.message.includes("unknown encoding : '"));
    }
  });

  it('fromEncoding good encoding', () => {
    assert.equal(Collations.fromEncoding('utf8').name, 'UTF8_GENERAL_CI');
  });

  it('fromIndex wrong index', () => {
    assert.isTrue(Collations.fromIndex(999999) === undefined);
  });

  it('fromIndex good index', () => {
    assert.equal(Collations.fromIndex(33).name, 'UTF8_GENERAL_CI');
  });
});
