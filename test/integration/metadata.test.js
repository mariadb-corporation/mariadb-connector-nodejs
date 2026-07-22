//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import Collations from '../../lib/const/collations.js';
import * as FieldType from '../../lib/const/field-type.js';
import Conf from '../conf.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import { createConnection, utf8Collation } from '../base.js';
import { Types, TypeNumbers } from '../../promise.js';

describe.concurrent('metadata', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });
  test('result metadata values', async function () {
    await shareConn.query('DROP TABLE IF EXISTS metadatatable');
    await shareConn.query(
      'CREATE TABLE metadatatable (id BIGINT not null primary key auto_increment, ' +
        't varchar(32) UNIQUE, ' +
        'd DECIMAL(10,4) UNSIGNED ZEROFILL, ' +
        'ds DECIMAL(10,4) SIGNED, ' +
        'd2 DECIMAL(10,0) UNSIGNED, ' +
        'ds2 DECIMAL(10,0) SIGNED ' +
        ") COLLATE='utf8_unicode_ci'"
    );
    await shareConn.query('FLUSH TABLES');
    const rows = await shareConn.query(
      'SELECT id as id1, t as t1, d as d1, ds as d2, d2 as d3, ds2 as d4 FROM metadatatable as tm'
    );
    validateResults(rows);

    const rows2 = await shareConn.query({
      sql: 'SELECT id as id1, t as t1, d as d1, ds as d2, d2 as d3, ds2 as d4 FROM metadatatable as tm',
      rowsAsArray: true
    });
    validateResults(rows2);
  });

  test('metadata limit', async function () {
    await shareConn.query('DROP TABLE IF EXISTS metadatatable2');
    let name = '';
    for (let i = 0; i < 64; i++) name += 'a';

    let alias = '';
    for (let i = 0; i < 255; i++) alias += 'b';

    await shareConn.query(`CREATE TABLE metadatatable2 (${name} int)`);
    await shareConn.query('FLUSH TABLES');
    const rows = await shareConn.query(`SELECT ${name} as ${alias} FROM metadatatable2`);
    assert.equal(rows.meta[0].name(), alias);
    assert.equal(rows.meta[0].orgName(), name);
  });

  test('Types / TypeNumbers exported for runtime use (CONJS-364)', async function () {
    // #355 exported the wrong shape (an index->name array), so these were undefined at runtime.
    // They must be keyed by name and equal the values the driver actually returns.
    assert.equal(Types.DECIMAL, 'DECIMAL');
    assert.equal(Types.INT, 'INT');
    assert.equal(Types.VAR_STRING, 'VAR_STRING');
    assert.equal(Types.GEOMETRY, 'GEOMETRY');
    assert.equal(TypeNumbers.INT, 3);
    assert.equal(TypeNumbers.BIGINT, 8);
    assert.equal(TypeNumbers.GEOMETRY, 255);

    await shareConn.query('DROP TABLE IF EXISTS typeConstTable');
    await shareConn.query('CREATE TABLE typeConstTable (i INT, b BIGINT, v VARCHAR(10))');
    await shareConn.query('FLUSH TABLES');
    const rows = await shareConn.query('SELECT i, b, v FROM typeConstTable');

    // field.type (string) matches the Types constant of the same name
    assert.equal(rows.meta[0].type, Types.INT);
    assert.equal(rows.meta[1].type, Types.BIGINT);
    assert.equal(rows.meta[2].type, Types.VAR_STRING);

    // field.columnType (number) matches the TypeNumbers constant
    assert.equal(rows.meta[0].columnType, TypeNumbers.INT);
    assert.equal(rows.meta[1].columnType, TypeNumbers.BIGINT);
    assert.equal(rows.meta[2].columnType, TypeNumbers.VAR_STRING);

    // the two views agree: TypeNumbers[field.type] === field.columnType
    assert.equal(TypeNumbers[rows.meta[0].type], rows.meta[0].columnType);
  });
});

const validateResults = function (rows) {
  assert.equal(rows.meta.length, 6);

  assert.equal(rows.meta[0].db(), Conf.baseConfig.database);
  assert.equal(rows.meta[0].schema(), Conf.baseConfig.database);
  assert.equal(rows.meta[0].table(), 'tm');
  assert.equal(rows.meta[0].orgTable(), 'metadatatable');
  assert.equal(rows.meta[0].name(), 'id1');
  assert.equal(rows.meta[0].orgName(), 'id');
  assert.equal(rows.meta[0].collation, Collations.fromName('BINARY'));
  assert.equal(rows.meta[0].columnLength, 20);
  assert.equal(rows.meta[0].columnType, FieldType.BIGINT);

  assert.equal(rows.meta[1].db(), Conf.baseConfig.database);
  assert.equal(rows.meta[1].schema(), Conf.baseConfig.database);
  assert.equal(rows.meta[1].table(), 'tm');
  assert.equal(rows.meta[1].orgTable(), 'metadatatable');
  assert.equal(rows.meta[1].name(), 't1');
  assert.equal(rows.meta[1].orgName(), 't');
  if (utf8Collation()) {
    assert.equal(rows.meta[1].collation.maxLength, 4);
    assert.equal(rows.meta[1].columnLength, 128);
  }
  assert.equal(rows.meta[1].columnType, FieldType.VAR_STRING);

  assert.equal(rows.meta[2].db(), Conf.baseConfig.database);
  assert.equal(rows.meta[2].schema(), Conf.baseConfig.database);
  assert.equal(rows.meta[2].table(), 'tm');
  assert.equal(rows.meta[2].orgTable(), 'metadatatable');
  assert.equal(rows.meta[2].name(), 'd1');
  assert.equal(rows.meta[2].orgName(), 'd');
  assert.equal(rows.meta[2].collation, Collations.fromName('BINARY'));
  assert.equal(rows.meta[2].columnLength, 11);
  assert.equal(rows.meta[2].columnType, FieldType.NEWDECIMAL);

  assert.equal(rows.meta[3].db(), Conf.baseConfig.database);
  assert.equal(rows.meta[3].schema(), Conf.baseConfig.database);
  assert.equal(rows.meta[3].table(), 'tm');
  assert.equal(rows.meta[3].orgTable(), 'metadatatable');
  assert.equal(rows.meta[3].name(), 'd2');
  assert.equal(rows.meta[3].orgName(), 'ds');
  assert.equal(rows.meta[3].collation, Collations.fromName('BINARY'));
  assert.equal(rows.meta[3].columnLength, 12);
  assert.equal(rows.meta[3].columnType, FieldType.NEWDECIMAL);
};
