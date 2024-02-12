//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

const base = require('../../base');
const { assert } = require('chai');

describe('bit type', () => {
  it('bit type verification', async () => {
    await shareConn.query('DROP TABLE IF EXISTS test_bit');
    await shareConn.query('CREATE TABLE test_bit ( val1 bit(1), val2 bit(8))');
    await shareConn.beginTransaction();
    await shareConn.query('INSERT INTO test_bit VALUES (?, ?), (?, ?), (?, ?)', [
      Buffer.from([0x00]),
      Buffer.from([0x00]),
      Buffer.from([0x01]),
      Buffer.from([0x01]),
      null,
      null
    ]);
    await shareConn.query('FLUSH TABLES');
    const expected = [
      { val1: false, val2: Buffer.from([0x00]) },
      { val1: true, val2: Buffer.from([0x01]) },
      { val1: null, val2: null }
    ];
    const expectedBuffer = [
      { val1: Buffer.from([0x00]), val2: Buffer.from([0x00]) },
      { val1: Buffer.from([0x01]), val2: Buffer.from([0x01]) },
      { val1: null, val2: null }
    ];

    let rows = await shareConn.query('SELECT * FROM test_bit');
    assert.deepEqual(rows, expected);
    rows = await shareConn.query({ sql: 'SELECT * FROM test_bit', bitOneIsBoolean: true });
    assert.deepEqual(rows, expected);

    rows = await shareConn.execute('SELECT * FROM test_bit');
    assert.deepEqual(rows, expected);
    rows = await shareConn.execute({ sql: 'SELECT * FROM test_bit', bitOneIsBoolean: true });
    assert.deepEqual(rows, expected);

    rows = await shareConn.query({ sql: 'SELECT * FROM test_bit', bitOneIsBoolean: false });
    assert.deepEqual(rows, expectedBuffer);
    rows = await shareConn.execute({ sql: 'SELECT * FROM test_bit', bitOneIsBoolean: false });
    assert.deepEqual(rows, expectedBuffer);
    shareConn.commit();
  });
});
