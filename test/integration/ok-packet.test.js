//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import { createConnection } from '../base.js';
import Conf from '../conf.js';

describe('ok packet', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });

  test('insertId', async () => {
    await shareConn.query('DROP TABLE IF EXISTS autoInc');
    await shareConn.query('CREATE TABLE autoInc (id BIGINT not null primary key auto_increment)');
    let rows = await shareConn.query('INSERT INTO autoInc values ()');
    assert.equal(rows.insertId, 1);
    rows = await shareConn.query('INSERT INTO autoInc values ()');
    assert.equal(rows.insertId, 2);
    rows = await shareConn.query('INSERT INTO autoInc values (245)');
    assert.equal(rows.insertId, 245);
    rows = await shareConn.query('INSERT INTO autoInc values (32767)');
    assert.equal(rows.insertId, 32767);
    rows = await shareConn.query('INSERT INTO autoInc values (65535)');
    assert.equal(rows.insertId, 65535);
    rows = await shareConn.query('INSERT INTO autoInc values ()');
    assert.equal(rows.insertId, 65536);
    rows = await shareConn.query('INSERT INTO autoInc values (16777215)');
    assert.equal(rows.insertId, 16777215);
    rows = await shareConn.query('INSERT INTO autoInc values ()');
    assert.equal(rows.insertId, 16777216);
    rows = await shareConn.query('INSERT INTO autoInc values (4294967295)');
    assert.equal(rows.insertId, 4294967295);
    rows = await shareConn.query('INSERT INTO autoInc values ()');
    assert.equal(rows.insertId, 4294967296);
    rows = await shareConn.query('INSERT INTO autoInc values (9007199254740992)');
    assert.equal(rows.insertId.toString(10), '9007199254740992');
  }, 5000);

  test('negative insertId', async () => {
    await shareConn.query('DROP TABLE IF EXISTS negAutoInc');
    await shareConn.query('CREATE TABLE negAutoInc (id BIGINT not null primary key auto_increment)');
    let rows = await shareConn.query('INSERT INTO negAutoInc values (-9007199254740990)');
    assert.equal(rows.insertId, -9007199254740990);
    rows = await shareConn.query('INSERT INTO negAutoInc values (-9007199254740989)');
    assert.equal(rows.insertId, -9007199254740989);
    rows = await shareConn.query('INSERT INTO negAutoInc values (-2147483648)');
    assert.equal(rows.insertId, -2147483648);
    rows = await shareConn.query('INSERT INTO negAutoInc values (-2147483647)');
    assert.equal(rows.insertId, -2147483647);
    rows = await shareConn.query('INSERT INTO negAutoInc values (-8388608)');
    assert.equal(rows.insertId, -8388608);
    rows = await shareConn.query('INSERT INTO negAutoInc values (-8388607)');
    assert.equal(rows.insertId, -8388607);
    rows = await shareConn.query('INSERT INTO negAutoInc values (-32768)');
    assert.equal(rows.insertId, -32768);
    rows = await shareConn.query('INSERT INTO negAutoInc values (-245)');
    assert.equal(rows.insertId, -245);
    rows = await shareConn.query('INSERT INTO negAutoInc values (-9007199254740992)');
    assert.equal(rows.insertId.toString(10), '-9007199254740992');
  });

  test('basic insert result', async () => {
    await shareConn.query('DROP TABLE IF EXISTS insertResultSet1');
    await shareConn.query(
      'CREATE TABLE insertResultSet1(' +
        'id int(11) unsigned NOT NULL AUTO_INCREMENT,' +
        'val varchar(256),' +
        'PRIMARY KEY (id))'
    );
    const rows = await shareConn.query('INSERT INTO insertResultSet1(val) values (?)', ['t']);
    assert.ok(!Array.isArray(rows));
    assert.strictEqual(typeof rows, 'object');
    assert.strictEqual(rows.insertId, 1n);
    assert.strictEqual(rows.affectedRows, 1);
    assert.strictEqual(rows.warningStatus, 0);
  });

  test('multiple insert result', async () => {
    const conn = await createConnection({ multipleStatements: true });
    await conn.query('DROP TABLE IF EXISTS multiple_insert_result');
    await conn.query(
      'CREATE TABLE multiple_insert_result(' +
        'id int(11) unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,' +
        'val varchar(256))'
    );
    const rows = await conn.query(
      'INSERT INTO multiple_insert_result(val) values (?); ' +
        "INSERT INTO multiple_insert_result(id,val) values (9, 't2'); " +
        'INSERT INTO multiple_insert_result(val) values (?)',
      ['t1', 't3']
    );
    assert.ok(Array.isArray(rows));
    assert.strictEqual(rows.length, 3);
    assert.strictEqual(rows[0].insertId, 1n);
    assert.strictEqual(rows[0].affectedRows, 1);
    assert.strictEqual(rows[0].warningStatus, 0);
    assert.strictEqual(rows[1].insertId, 9n);
    assert.strictEqual(rows[1].affectedRows, 1);
    assert.strictEqual(rows[1].warningStatus, 0);
    assert.strictEqual(rows[2].insertId, 10n);
    assert.strictEqual(rows[2].affectedRows, 1);
    assert.strictEqual(rows[2].warningStatus, 0);
    await conn.end();
  });

  test('update result text', async () => {
    await shareConn.query('DROP TABLE IF EXISTS updateResultSet1');
    await shareConn.query('CREATE TABLE updateResultSet1(id int(11))');
    await shareConn.query('INSERT INTO updateResultSet1 values (1), (1), (2), (3)');
    let res = await shareConn.query('UPDATE updateResultSet1 set id = 1');
    assert.ok(!Array.isArray(res));
    assert.strictEqual(typeof res, 'object');
    assert.strictEqual(res.insertId, 0n);
    assert.strictEqual(res.affectedRows, 4);
    assert.strictEqual(res.warningStatus, 0);
    res = await shareConn.query('UPDATE updateResultSet1 set id = 1');
    assert.ok(!Array.isArray(res));
    assert.strictEqual(typeof res, 'object');
    assert.strictEqual(res.insertId, 0n);
    assert.strictEqual(res.affectedRows, 4);
    assert.strictEqual(res.warningStatus, 0);
  });

  test('update result text changedRows', async () => {
    const conn = await createConnection({ foundRows: false });
    await conn.query('DROP TABLE IF EXISTS updateResultSet1');
    await conn.query('CREATE TABLE updateResultSet1(id int(11))');
    await conn.query('INSERT INTO updateResultSet1 values (1), (1), (2), (3)');
    let res = await conn.query('UPDATE updateResultSet1 set id = 1');
    assert.ok(!Array.isArray(res));
    assert.strictEqual(typeof res, 'object');
    assert.strictEqual(res.insertId, 0n);
    assert.strictEqual(res.affectedRows, 2);
    assert.strictEqual(res.warningStatus, 0);
    res = await conn.query('UPDATE updateResultSet1 set id = 1');
    assert.ok(!Array.isArray(res));
    assert.strictEqual(typeof res, 'object');
    assert.strictEqual(res.insertId, 0n);
    assert.strictEqual(res.affectedRows, 0);
    assert.strictEqual(res.warningStatus, 0);
    await conn.end();
  });
});
