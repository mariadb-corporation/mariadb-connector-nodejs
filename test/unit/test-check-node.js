'use strict';

const { assert } = require('chai');
const CheckNode = require('../../check-node');

describe('test Check-node version', () => {
  it('hasMinVersion check', () => {
    assert.isTrue(CheckNode.hasMinVersion('12.1.0', '11'));
    assert.isTrue(CheckNode.hasMinVersion('12.1.0', '11.1'));

    assert.isTrue(CheckNode.hasMinVersion('12.0.0', '12'));
    assert.isTrue(CheckNode.hasMinVersion('12.1.0', '12'));
    assert.isTrue(CheckNode.hasMinVersion('12.1.0', '12.0'));
    assert.isTrue(CheckNode.hasMinVersion('12.1.0', '12.1'));
    assert.isFalse(CheckNode.hasMinVersion('12.1.0', '12.2'));

    assert.isFalse(CheckNode.hasMinVersion('12.1.0', '13'));
    assert.isFalse(CheckNode.hasMinVersion('12.1.0', '13.1'));
  });
});
