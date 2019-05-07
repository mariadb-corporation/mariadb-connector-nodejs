'use strict';

const Utils = require('../../../lib/misc/utils');
const { assert } = require('chai');
const ConnOptions = require('../../../lib/config/connection-options');

describe('utils', () => {
  const head = Buffer.from([0xaa, 0xbb, 0xcc, 0x33]);
  const buf = Buffer.from([0xf0, 0x9f, 0xa4, 0x98, 0xf0, 0x9f, 0x92, 0xaa]); // 🤘💪
  const longbuf = Buffer.from([
    0x00,
    0x01,
    0x02,
    0x03,
    0x04,
    0x05,
    0x06,
    0x07,
    0x08,
    0x09,
    0x0a,
    0x0b,
    0x0c,
    0x0d,
    0x0e,
    0x0f,
    0x10
  ]);

  it('log no buffer', () => {
    let opt = new ConnOptions();
    assert.equal('', Utils.log(opt, null, 0, 0));
  });

  it('log no length', () => {
    let opt = new ConnOptions();
    assert.equal('', Utils.log(opt, buf, 0, 0, buf));
  });

  it('log entry without header', () => {
    let opt = new ConnOptions();
    assert.equal(
      'F0 9F A4 98 F0 9F 92 AA                              ........\n',
      Utils.log(opt, buf, 0, buf.length)
    );
  });

  it('log entry with header', () => {
    let opt = new ConnOptions();
    assert.equal(
      'AA BB CC 33 F0 9F A4 98  F0 9F 92 AA                 ...3........\n',
      Utils.log(opt, buf, 0, buf.length, head)
    );
  });

  it('log entry multi-line', () => {
    let opt = new ConnOptions();
    assert.equal(
      '00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F     ................\n' +
        '10                                                   .\n',
      Utils.log(opt, longbuf, 0, longbuf.length)
    );
  });

  it('log entry multi-line with header', () => {
    let opt = new ConnOptions();
    assert.equal(
      'AA BB CC 33 00 01 02 03  04 05 06 07 08 09 0A 0B     ...3............\n' +
        '0C 0D 0E 0F 10                                       .....\n',
      Utils.log(opt, longbuf, 0, longbuf.length, head)
    );
  });

  it('log limited entry', () => {
    let opt = new ConnOptions();
    assert.equal(
      'AA BB CC 33 00 01 02 03  04 05 06 07 08 09 0A 0B     ...3............\n' +
        '0C 0D 0E 0F                                          ....\n',
      Utils.log(opt, longbuf, 0, longbuf.length - 1, head)
    );
  });

  it('log offset entry', () => {
    let opt = new ConnOptions();
    assert.equal(
      'AA BB CC 33 01 02 03 04  05 06 07 08 09 0A 0B 0C     ...3............\n' +
        '0D 0E 0F 10                                          ....\n',
      Utils.log(opt, longbuf, 1, longbuf.length, head)
    );
  });

  it('log option limited', () => {
    let opt = new ConnOptions();
    opt.debugLen = 16;
    assert.equal(
      'AA BB CC 33 01 02 03 04  05 06 07 08 09 0A 0B 0C     ...3............ ...\n',
      Utils.log(opt, longbuf, 1, longbuf.length, head)
    );
  });

  it('log option limited multi-line', () => {
    let opt = new ConnOptions();
    opt.debugLen = 18;
    assert.equal(
      'AA BB CC 33 01 02 03 04  05 06 07 08 09 0A 0B 0C     ...3............\n' +
        '0D 0E                                                .. ...\n',
      Utils.log(opt, longbuf, 1, longbuf.length, head)
    );
  });
});
