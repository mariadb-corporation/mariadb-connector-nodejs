//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB plc

'use strict';

import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import { createConnection } from '../base.js';

// the meta property of a result must be configurable: Sequelize deletes it from raw results (#234)
describe('result meta property', () => {
  let conn;
  beforeAll(async () => {
    conn = await createConnection();
    await conn.query('DROP TABLE IF EXISTS resultMeta');
    await conn.query('CREATE TABLE resultMeta (id INT)');
  });
  afterAll(async () => {
    await conn.query('DROP TABLE IF EXISTS resultMeta');
    await conn.end();
  });

  test('meta is not enumerable, and can be deleted, on query results', async () => {
    const rows = await conn.query('SELECT 1 AS v');
    assert.isArray(rows.meta);
    assert.deepEqual(Object.keys(rows), ['0']);
    assert.doesNotThrow(() => {
      delete rows.meta;
    });
    assert.isUndefined(rows.meta);
  });

  test('meta can be deleted on execute results', async () => {
    const rows = await conn.execute('SELECT 1 AS v');
    assert.isArray(rows.meta);
    delete rows.meta;
    assert.isUndefined(rows.meta);
  });

  test('meta can be deleted on batch results', async () => {
    for (const fullResult of [true, false]) {
      const res = await conn.batch({ sql: 'INSERT INTO resultMeta VALUES (?)', fullResult }, [[1], [2]]);
      delete res.meta;
      assert.isUndefined(res.meta);
    }
  });
});
