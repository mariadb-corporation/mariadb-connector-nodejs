//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB plc

'use strict';

import { assert, describe, test } from 'vitest';

import ColumnDef from '../../../lib/cmd/column-definition.js';
import Packet from '../../../lib/io/packet.js';
import * as FieldType from '../../../lib/const/field-type.js';
import { parser as textParser } from '../../../lib/cmd/decoder/text-decoder.js';
import { parser as binaryParser } from '../../../lib/cmd/decoder/binary-decoder.js';

// A server may send a collation id this connector does not know (newer server, or a malformed/hostile
// one). That must not throw while the result-set is parsed: the exception would escape the socket
// 'data' handler and terminate the process.
const columnPacket = (collation) => {
  const lenStr = (s) => Buffer.concat([Buffer.from([s.length]), Buffer.from(s)]);
  const buf = Buffer.concat([
    lenStr('def'),
    lenStr(''),
    lenStr(''),
    lenStr(''),
    lenStr('a'),
    lenStr(''),
    Buffer.from([0x0c, collation & 0xff, collation >> 8, 0x0a, 0, 0, 0, FieldType.VAR_STRING, 0, 0, 0, 0, 0])
  ]);
  return new Packet().update(buf, 0, buf.length);
};

describe.concurrent('column definition with unknown collation', () => {
  const info = { clientCapabilities: 0n };

  test('column parsing keeps the raw id and does not throw', () => {
    const col = new ColumnDef(columnPacket(0xffff), info, true);
    assert.equal(col.collation.index, 0xffff);
  });

  test('text and binary row decoders can be built for it', () => {
    const col = new ColumnDef(columnPacket(0xffff), info, true);
    assert.doesNotThrow(() => textParser(col, {}, info));
    assert.doesNotThrow(() => binaryParser(col, {}, info));
  });

  test('known binary collation is still detected', () => {
    const col = new ColumnDef(columnPacket(63), info, true);
    assert.equal(col.collation.index, 63);
  });
});
