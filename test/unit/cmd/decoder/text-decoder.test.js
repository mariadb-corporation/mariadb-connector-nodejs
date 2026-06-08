//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import { assert, describe, test } from 'vitest';

import Packet from '../../../../lib/io/packet.js';
import * as FieldType from '../../../../lib/const/field-type.js';
import * as Errors from '../../../../lib/misc/errors.js';
import { parser } from '../../../../lib/cmd/decoder/text-decoder.js';

// Build a length-encoded numeric field: a 0xfd (3-byte length) prefix followed by `len` '9' bytes.
const numericField = (len) =>
  new Packet().update(
    Buffer.concat([Buffer.from([0xfd, len & 0xff, (len >> 8) & 0xff, (len >> 16) & 0xff]), Buffer.alloc(len, 0x39)]),
    0,
    len + 4
  );

describe.concurrent('text-decoder BigInt length cap', () => {
  // BIGINT decoded as Number/BigNumber goes through the O(n^2) accumulation path; the driver must
  // refuse an over-long server-sent value rather than burning CPU parsing it.
  const decoder = parser({ columnType: FieldType.BIGINT }, { bigIntAsNumber: true });

  test('rejects a numeric value longer than the cap instead of parsing it', () => {
    const packet = numericField(5000);
    const calls = [];
    const stub = (msg, fatal, info, sqlState, errno) => {
      calls.push({ msg, fatal, sqlState, errno });
      return new Error(msg);
    };

    const result = decoder(packet, { bigIntAsNumber: true }, stub);

    assert.equal(calls.length, 1, 'should have raised exactly one error');
    assert.equal(calls[0].errno, Errors.client.ER_PARSING_PRECISION);
    assert.equal(calls[0].sqlState, '42000');
    assert.isTrue(calls[0].msg.includes('exceeds maximum'), calls[0].msg);
    assert.instanceOf(result, Error);
    // the oversized field must still be consumed so the protocol stream stays in sync
    assert.equal(packet.pos, packet.end);
  });

  test('parses a value at the cap boundary without rejecting', () => {
    const packet = numericField(1024);
    let raised = false;
    decoder(packet, { bigIntAsNumber: true }, () => {
      raised = true;
      return new Error('unexpected');
    });
    assert.isFalse(raised, 'a 1024-char value is within the cap and must not be rejected');
    assert.equal(packet.pos, packet.end);
  });

  test('parses a normal BIGINT value', () => {
    const packet = new Packet().update(Buffer.from([3, 0x31, 0x32, 0x33]), 0, 4); // "123"
    const result = decoder(packet, { bigIntAsNumber: true }, () => {
      throw new Error('should not raise');
    });
    assert.equal(result, 123);
  });
});
