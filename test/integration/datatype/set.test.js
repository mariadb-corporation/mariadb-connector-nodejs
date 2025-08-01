//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import { createConnection } from '../../base.js';
import Conf from '../../conf.js';
describe('set', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });
  test('set array', async function () {
    await shareConn.query('DROP TABLE IF EXISTS set_array');
    await shareConn.query("CREATE TABLE set_array(tt SET('v1','v2', 'v3'))");
    await shareConn.beginTransaction();
    await shareConn.query(
      'INSERT INTO set_array values ' +
        "('v1'), " +
        "('v2'), " +
        "('v1,v2'), " +
        "('v3'), " +
        "('v3,v2'), " +
        "('')," +
        '(null)'
    );

    const expected = [
      { tt: ['v1'] },
      { tt: ['v2'] },
      { tt: ['v1', 'v2'] },
      { tt: ['v3'] },
      { tt: ['v2', 'v3'] },
      { tt: [] },
      { tt: null }
    ];
    let rows = await shareConn.query('SELECT * from set_array');
    assert.deepEqual(rows, expected);
    rows = await shareConn.execute('SELECT * from set_array');
    assert.deepEqual(rows, expected);
    await shareConn.commit();
  });
});
