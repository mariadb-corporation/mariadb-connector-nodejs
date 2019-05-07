'use strict';

const Utils = require('../../../lib/misc/utils');
const { assert } = require('chai');
const Packet = require('../../../lib/io/packet');

describe('packet', () => {
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

  it('skipping integer', () => {
    let packet = new Packet(Buffer.allocUnsafe(1000), 0, 1000);
    packet.buf[0] = 0;
    packet.buf[1] = 10;
    packet.buf[12] = -5;
    packet.buf[13] = 252;
    packet.buf[14] = 1;
    packet.buf[15] = 1;
    packet.buf[273] = 253;
    packet.buf[274] = 1;
    packet.buf[275] = 1;
    packet.buf[276] = 0;
    packet.skipLengthCodedNumber();
    packet.skipLengthCodedNumber();
    packet.skipLengthCodedNumber();
    packet.skipLengthCodedNumber();
    packet.skipLengthCodedNumber();

    assert.equal(packet.pos, 534);
  });
});
