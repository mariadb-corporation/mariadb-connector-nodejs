//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

const { assert } = require('chai');
const BinaryEncoder = require('../../../lib/cmd/encoder/binary-encoder');

describe('binary encoder geometry', () => {
  // rings that are not arrays but expose a `length` used to previously reserve
  // space in the Buffer.allocUnsafe() allocation without ever being written,
  // returning uninitialized process memory to the server (CONJS-367).
  const badRings = [
    { label: 'object with length', ring: { length: 4000 } },
    { label: 'string', ring: 'A'.repeat(4000) },
    { label: 'null', ring: null },
    { label: 'undefined', ring: undefined },
    { label: 'number', ring: 42 }
  ];

  badRings.forEach(({ label, ring }) => {
    it(`Polygon with non-array ring (${label}) is rejected`, () => {
      assert.isNull(BinaryEncoder.getBufferFromGeometryValue({ type: 'Polygon', coordinates: [ring] }));
    });

    it(`MultiPolygon with non-array ring (${label}) is rejected`, () => {
      assert.isNull(BinaryEncoder.getBufferFromGeometryValue([ring], 'MultiPolygon'));
    });
  });

  it('Polygon with a valid ring followed by a bad one is rejected', () => {
    const value = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [0, 1],
          [1, 1],
          [0, 0]
        ],
        { length: 4000 }
      ]
    };
    assert.isNull(BinaryEncoder.getBufferFromGeometryValue(value));
  });

  it('GeometryCollection with a null/undefined member does not throw', () => {
    [[null], [undefined], new Array(3)].forEach((geometries) => {
      assert.doesNotThrow(() => BinaryEncoder.getBufferFromGeometryValue({ type: 'GeometryCollection', geometries }));
    });
  });

  it('valid Polygon writes every reserved byte', () => {
    const value = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0]
        ]
      ]
    };
    const buf = BinaryEncoder.getBufferFromGeometryValue(value);
    // 9 byte header + 4 byte ring length + 5 points * 16 bytes
    assert.equal(buf.length, 9 + 4 + 5 * 16);
    assert.equal(buf.readInt8(0), 1); // little endian
    assert.equal(buf.readInt32LE(1), 3); // wkbPolygon
    assert.equal(buf.readInt32LE(5), 1); // ring count
    assert.equal(buf.readInt32LE(9), 5); // point count
    assert.equal(buf.readDoubleLE(13), 0);
    assert.equal(buf.readDoubleLE(buf.length - 8), 0);
  });
});
