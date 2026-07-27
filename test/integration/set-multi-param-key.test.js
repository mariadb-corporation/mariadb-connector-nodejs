//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB Corporation Ab

'use strict';

import { createConnection } from '../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';

// permitSetMultiParamEntries expands object keys into column names. A key holding a
// backtick used to close the identifier, letting the caller write columns the
// application never named and append arbitrary SQL (CONJS-369).
describe('permitSetMultiParamEntries key escaping', () => {
  const MALICIOUS = { "secret` = 'PWNED-BY-KEY-INJECTION', `name": 'ignored' };
  let conn;

  beforeAll(async () => {
    conn = await createConnection({ permitSetMultiParamEntries: true });
    await conn.query('DROP TABLE IF EXISTS set_key_inj');
    await conn.query('CREATE TABLE set_key_inj (id INT, name VARCHAR(50), secret VARCHAR(80))');
  });

  afterAll(async () => {
    await conn.query('DROP TABLE IF EXISTS set_key_inj');
    await conn.end();
  });

  test('a backtick in a key cannot write another column', async () => {
    await conn.query('DELETE FROM set_key_inj');
    await conn.query("INSERT INTO set_key_inj VALUES (3,'attacker','attacker-own-data')");

    try {
      await conn.query('UPDATE set_key_inj SET ? WHERE id = 3', [MALICIOUS]);
      throw new Error('must have thrown error');
    } catch (err) {
      // the whole key is now one identifier, so the column simply does not exist
      assert.equal(err.code, 'ER_BAD_FIELD_ERROR');
    }

    const row = (await conn.query('SELECT name, secret FROM set_key_inj WHERE id = 3'))[0];
    assert.equal(row.name, 'attacker', 'name must be untouched');
    assert.equal(row.secret, 'attacker-own-data', 'secret must be untouched');
  });

  test('escape() keeps the key inside a single identifier', () => {
    assert.equal(conn.escape(MALICIOUS), "`secret`` = 'PWNED-BY-KEY-INJECTION', ``name`='ignored'");
  });

  test('ordinary keys still expand to columns', async () => {
    await conn.query('DELETE FROM set_key_inj');
    await conn.query("INSERT INTO set_key_inj VALUES (1,'bob','bob-secret')");
    await conn.query('UPDATE set_key_inj SET ? WHERE id = 1', [{ name: 'alice', secret: 'new-secret' }]);

    const row = (await conn.query('SELECT name, secret FROM set_key_inj WHERE id = 1'))[0];
    assert.equal(row.name, 'alice');
    assert.equal(row.secret, 'new-secret');
  });

  test('a key needing quoting (reserved word) still works', async () => {
    await conn.query('DROP TABLE IF EXISTS set_key_reserved');
    await conn.query('CREATE TABLE set_key_reserved (id INT, `order` INT)');
    await conn.query('INSERT INTO set_key_reserved VALUES (1,0)');
    await conn.query('UPDATE set_key_reserved SET ? WHERE id = 1', [{ order: 42 }]);

    const row = (await conn.query('SELECT `order` FROM set_key_reserved WHERE id = 1'))[0];
    assert.equal(row.order, 42);
    await conn.query('DROP TABLE set_key_reserved');
  });
});
