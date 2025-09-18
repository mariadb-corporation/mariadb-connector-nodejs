//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import { createConnection } from '../../base.js';
import Conf from '../../conf.js';
describe.concurrent('time', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });
  test('time data', async ({ skip }) => {
    // skipping test for mysql since TIME doesn't have microseconds
    if (!shareConn.info.isMariaDB()) {
      skip();
      return;
    }

    await shareConn.query('DROP TABLE IF EXISTS time_data');
    await shareConn.query('CREATE TABLE time_data(t1 time(6), t2 time(6))');
    await shareConn.beginTransaction();
    await shareConn.query('INSERT INTO time_data VALUES (?, ?)', ['-838:59:58', '-838:59:59.999999']);
    await shareConn.query('INSERT INTO time_data VALUES (?, ?)', ['-1:00:00', '25:00:00']);
    let results = await shareConn.query('SELECT * FROM time_data');
    assert.equal(results[0].t1, '-838:59:58.000000');

    assert.equal(results[0].t2, '-838:59:59.999999');
    assert.equal(results[1].t1, '-01:00:00.000000');
    assert.equal(results[1].t2, '25:00:00.000000');
    results = await shareConn.execute('SELECT * FROM time_data');
    assert.equal(results[0].t1, '-838:59:58');
    assert.equal(results[0].t2, '-838:59:59.999999');
    assert.equal(results[1].t1, '-01:00:00');
    assert.equal(results[1].t2, '25:00:00');
    await shareConn.commit();
  });

  test('prepare time data', async ({ skip }) => {
    // skipping test for mysql since TIME doesn't have microseconds
    if (!shareConn.info.isMariaDB()) {
      skip();
      return;
    }

    await shareConn.query('DROP TABLE IF EXISTS time_data2');
    await shareConn.query('CREATE TABLE time_data2(t1 time(6), t2 time(6))');
    await shareConn.beginTransaction();
    await shareConn.execute('INSERT INTO time_data2 VALUES (?, ?)', ['-838:59:58', '-838:59:59.999999']);
    await shareConn.execute('INSERT INTO time_data2 VALUES (?, ?)', ['00:00:00', '-838:59:59.999999']);
    await shareConn.execute('INSERT INTO time_data2 VALUES (?, ?)', ['-1:00:00', '25:00:00']);
    let results = await shareConn.execute('SELECT * FROM time_data2');
    assert.equal(results[0].t1, '-838:59:58');
    assert.equal(results[0].t2, '-838:59:59.999999');
    assert.equal(results[1].t1, '00:00:00');
    assert.equal(results[1].t2, '-838:59:59.999999');
    assert.equal(results[2].t1, '-01:00:00');
    assert.equal(results[2].t2, '25:00:00');
    await shareConn.commit();
  });
});
