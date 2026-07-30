//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB Corporation Ab

'use strict';

import { assert, describe, test } from 'vitest';

import Parser from '../../../lib/cmd/parser.js';
import Prepare from '../../../lib/cmd/prepare.js';
import * as Errors from '../../../lib/misc/errors.js';
import ConnectionOptions from '../../../lib/config/connection-options.js';
import ConnectionInformation from '../../../lib/misc/connection-information.js';
import Packet from '../../../lib/io/packet.js';

// connection information with the fatal-error hook Connection wires in, recording the tear-downs it
// would trigger: refusing metadata must close the connection, the stream cannot be resynchronized
const newInfo = () => {
  const closed = [];
  const info = new ConnectionInformation({}, null, (err) => closed.push(err));
  info.closed = closed;
  return info;
};

// The result-set column count is a length-encoded integer, read before any metadata is allocated for
// it. A malicious or MitM server can announce an enormous count to exhaust client memory, so it is
// bounded by the maxAllowedColumns option (CONJS-366).

const newParser = (connOpts) => {
  const parser = new Parser(
    () => {},
    () => {},
    new ConnectionOptions(connOpts),
    { sql: 'SELECT * FROM t', opts: {} }
  );
  let rejected = null;
  parser.reject = (err) => (rejected = err);
  parser.rejected = () => rejected;
  return parser;
};

// column count packet: a length-encoded integer, using the 8-byte form when it doesn't fit a byte
// (the form a hostile server would use to announce a huge count)
const countPacket = (columnCount) => {
  let buf;
  if (columnCount >= 0 && columnCount < 0xfb) {
    buf = Buffer.from([columnCount, 0x00]);
  } else {
    buf = Buffer.alloc(10);
    buf[0] = 0xfe;
    buf.writeBigInt64LE(BigInt(columnCount), 1);
  }
  return new Packet().update(buf, 0, buf.length);
};

describe.concurrent('result-set column count bound (CONJS-366)', () => {
  test('accepts a normal column count', () => {
    const parser = newParser({});
    const info = newInfo();
    parser.readResultSet(countPacket(3), info);
    assert.equal(parser._columnCount, 3);
    assert.deepEqual(parser._columns, []);
    assert.equal(parser.onPacketReceive, parser.readColumn);
    assert.isNull(parser.rejected());
    assert.deepEqual(info.closed, []);
  });

  test('accepts the default limit', () => {
    const parser = newParser({});
    const info = newInfo();
    parser.readResultSet(countPacket(65535), info);
    assert.equal(parser._columnCount, 65535);
    assert.isNull(parser.rejected());
    assert.deepEqual(info.closed, []);
  });

  test('refuses a count above the default limit, before allocating metadata', async () => {
    const parser = newParser({});
    const info = newInfo();
    parser.readResultSet(countPacket(2 ** 40), info);

    assert.isUndefined(parser._columns, 'no metadata array must be allocated');
    assert.isNull(parser.onPacketReceive, 'no further column packet must be read');
    await new Promise((resolve) => process.nextTick(resolve));
    const err = parser.rejected();
    assert.isNotNull(err);
    assert.equal(err.errno, Errors.client.ER_MAX_ALLOWED_COLUMNS);
    assert.equal(err.code, 'ER_MAX_ALLOWED_COLUMNS');
    assert.equal(err.sqlState, '08S01');
    assert.isTrue(err.fatal);
    assert.isTrue(err.text.includes('exceeding maxAllowedColumns (65535)'));
    assert.deepEqual(info.closed, [err], 'connection must be closed, the stream cannot be resynchronized');
  });

  test('honours a lowered maxAllowedColumns', async () => {
    const parser = newParser({ maxAllowedColumns: 10 });
    parser.readResultSet(countPacket(11), newInfo());
    await new Promise((resolve) => process.nextTick(resolve));
    assert.equal(parser.rejected().errno, Errors.client.ER_MAX_ALLOWED_COLUMNS);

    const ok = newParser({ maxAllowedColumns: 10 });
    ok.readResultSet(countPacket(10), newInfo());
    assert.equal(ok._columnCount, 10);
    assert.isNull(ok.rejected());
  });

  test('refuses a count read as negative from the 8-byte encoding', async () => {
    const parser = newParser({});
    parser.readResultSet(countPacket(-1), newInfo());
    await new Promise((resolve) => process.nextTick(resolve));
    const err = parser.rejected();
    assert.equal(err.errno, Errors.client.ER_MAX_ALLOWED_COLUMNS);
    assert.isTrue(err.text.includes('invalid column count (-1)'));
    assert.isNull(parser.onPacketReceive);
  });
});

describe.concurrent('prepare column count bound (CONJS-366)', () => {
  // COM_STMT_PREPARE_OK counts are 16-bit, so the wire format already caps them at the default limit;
  // a lowered maxAllowedColumns must still be honoured.
  const prepareOk = (columnNo, parameterCount) => ({
    peek: () => 0x00,
    skip: () => {},
    readInt32: () => 1,
    readUInt16: (() => {
      let call = 0;
      return () => (call++ === 0 ? columnNo : parameterCount);
    })()
  });

  const newPrepare = (connOpts) => {
    const prepare = new Prepare(
      () => {},
      () => {},
      new ConnectionOptions(connOpts),
      { sql: 'SELECT * FROM t', opts: {} },
      { prepareCache: null }
    );
    let rejected = null;
    prepare.reject = (err) => (rejected = err);
    prepare.rejected = () => rejected;
    return prepare;
  };

  test('accepts a normal column count', () => {
    const prepare = newPrepare({});
    prepare.readPrepareResultPacket(prepareOk(3, 0), null, {}, newInfo());
    assert.equal(prepare.onPacketReceive, prepare.readPrepareColumnsPacket);
    assert.isNull(prepare.rejected());
  });

  test('refuses a column count above a lowered maxAllowedColumns', async () => {
    const prepare = newPrepare({ maxAllowedColumns: 2 });
    const info = newInfo();
    prepare.readPrepareResultPacket(prepareOk(3, 0), null, {}, info);
    await new Promise((resolve) => process.nextTick(resolve));
    assert.equal(prepare.rejected().errno, Errors.client.ER_MAX_ALLOWED_COLUMNS);
    assert.isNull(prepare.onPacketReceive);
    assert.lengthOf(info.closed, 1);
  });
});

describe.concurrent('maxAllowedColumns option', () => {
  test('default value', () => {
    assert.equal(new ConnectionOptions({}).maxAllowedColumns, 65535);
  });

  test('numeric string value (connection string)', () => {
    assert.equal(
      new ConnectionOptions('mariadb://root@localhost:3306/db?maxAllowedColumns=1000').maxAllowedColumns,
      1000
    );
  });

  test('refuses a non-integer or out of range value', () => {
    for (const value of ['ten', 0, -1, 1.5]) {
      assert.throws(
        () => new ConnectionOptions({ maxAllowedColumns: value }),
        RangeError,
        `maxAllowedColumns must be an integer greater than 0. was '${value}'`
      );
    }
  });
});
