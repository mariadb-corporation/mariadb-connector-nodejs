//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import * as base from '../base.js';
import * as Capabilities from '../../lib/const/capabilities.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import { createConnection } from '../base.js';
import Conf from '../conf.js';

describe.concurrent('TypeCast', () => {
  let serverPermitExtendedMetas;
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
    serverPermitExtendedMetas = (shareConn.info.serverCapabilities & Capabilities.MARIADB_CLIENT_EXTENDED_METADATA) > 0;
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });

  const changeCaseCast = (column, next) => {
    if (column.type === 'VAR_STRING') {
      const val = column.string();
      if (column.name().startsWith('upp')) return val.toUpperCase();
      if (column.name().startsWith('low')) return val.toLowerCase();
      return val;
    }
    return next();
  };

  test('query level typecast function', async function () {
    const rows = await shareConn.query({
      sql: "SELECT 'blaBLA' as upper, 'blaBLA' as lower, 'blaBLA' as std, '1' as r",
      typeCast: changeCaseCast
    });
    assert.deepEqual(rows, [{ upper: 'BLABLA', lower: 'blabla', std: 'blaBLA', r: '1' }]);
    const rows2 = await shareConn.query({
      sql: "SELECT 'blaBLA' as upper, 'blaBLA' as lower, 'blaBLA' as std, '1' as r",
      typeCast: changeCaseCast,
      rowsAsArray: true
    });
    assert.deepEqual(rows2, [['BLABLA', 'blabla', 'blaBLA', '1']]);
  });

  test('query level typecast function execute', async function () {
    const rows = await shareConn.execute({
      sql: "SELECT 'blaBLA' as upper, 'blaBLA' as lower, 'blaBLA' as std, '1' as r",
      typeCast: changeCaseCast
    });
    assert.deepEqual(rows, [{ upper: 'BLABLA', lower: 'blabla', std: 'blaBLA', r: '1' }]);
  });

  test('connection level typecast function', async function () {
    const conn = await base.createConnection({ typeCast: changeCaseCast });
    const rows = await conn.query("SELECT 'blaBLA' as upper, 'blaBLA' as lower, 'blaBLA' as std, '1' as r");
    assert.deepEqual(rows, [{ upper: 'BLABLA', lower: 'blabla', std: 'blaBLA', r: '1' }]);
    await conn.end();
  }, 5000);

  test('connection level typecast function execute', async function () {
    const conn = await base.createConnection({ typeCast: changeCaseCast });
    const rows = await conn.execute("SELECT 'blaBLA' as upper, 'blaBLA' as lower, 'blaBLA' as std, '1' as r");
    assert.deepEqual(rows, [{ upper: 'BLABLA', lower: 'blabla', std: 'blaBLA', r: '1' }]);
    await conn.end();
  }, 5000);

  test('compatibility automatic cast', async function () {
    const conn = await base.createConnection({ typeCast: true });
    const rows = await conn.query("SELECT '1' as r");
    assert.deepEqual(rows, [{ r: '1' }]);
    await conn.end();
  }, 5000);

  test('compatibility automatic cast execute', async function () {
    const conn = await base.createConnection({ typeCast: true });
    const rows = await conn.execute("SELECT '1' as r");
    assert.deepEqual(rows, [{ r: '1' }]);
    await conn.end();
  }, 5000);

  test('cast fields', async function () {
    const checkCaseType = (field, next) => {
      assert.equal(field.type, 'VAR_STRING');
      assert.equal(field.columnLength, shareConn.info.collation.maxLength * 6);
      return next();
    };
    const rows = await shareConn.query({
      sql: "SELECT 'blaBLA' as upper",
      typeCast: checkCaseType
    });
    assert.deepEqual(rows, [{ upper: 'blaBLA' }]);
  });

  test('cast fields execute', async function () {
    const checkCaseType = (field, next) => {
      assert.equal(field.type, 'VAR_STRING');
      assert.equal(field.columnLength, base.utf8Collation() ? 24 : 6);
      return next();
    };
    const rows = await shareConn.execute({
      sql: "SELECT 'blaBLA' as upper",
      typeCast: checkCaseType
    });
    assert.deepEqual(rows, [{ upper: 'blaBLA' }]);
  });

  test('TINY(1) to boolean cast', async function () {
    const tinyToBoolean = (column, next) => {
      if (column.type === 'TINY' && column.columnLength === 1) {
        const val = column.tiny();
        return val === null ? null : val === 1;
      }
      if (column.type === 'SHORT') {
        const val = column.short();
        return val === null ? null : val + 1;
      }
      if (column.type === 'INT') {
        const val = column.int();
        return val === null ? null : val + 1;
      }
      return next();
    };
    const conn = await base.createConnection({ typeCast: tinyToBoolean });
    await conn.query('DROP TABLE IF EXISTS tinyToBool');
    await conn.query('CREATE TABLE tinyToBool(b1 TINYINT(1), b2 TINYINT(2), b3 SMALLINT, b4 INT)');
    await conn.beginTransaction();
    await conn.query('INSERT INTO tinyToBool VALUES (0,0,0,0), (1,1,1,1), (2,2,2,2), (null,null,null,null)');
    let rows = await conn.query('SELECT * from tinyToBool');
    assert.deepEqual(rows, [
      { b1: false, b2: 0, b3: 1, b4: 1 },
      { b1: true, b2: 1, b3: 2, b4: 2 },
      { b1: false, b2: 2, b3: 3, b4: 3 },
      { b1: null, b2: null, b3: null, b4: null }
    ]);
    rows = await conn.execute('SELECT * from tinyToBool');
    assert.deepEqual(rows, [
      { b1: false, b2: 0, b3: 1, b4: 1 },
      { b1: true, b2: 1, b3: 2, b4: 2 },
      { b1: false, b2: 2, b3: 3, b4: 3 },
      { b1: null, b2: null, b3: null, b4: null }
    ]);
    await conn.end();
  });

  test('long cast', async function () {
    const longCast = (column, next) => {
      if (column.type === 'TINY' && column.columnLength === 1) {
        const val = column.tiny();
        return val == null ? null : Number(val);
      }
      if (column.type === 'VAR_STRING') {
        const val = column.string();
        return val == null ? null : Number(val);
      }
      return next();
    };
    const conn = await base.createConnection({ typeCast: longCast });
    await conn.query('DROP TABLE IF EXISTS stupidCast');
    await conn.query('CREATE TABLE stupidCast(b1 TINYINT(1), b2 varchar(3))');
    await conn.beginTransaction();
    await conn.query("INSERT INTO stupidCast VALUES (0,'0.1'), (1,'1.1')," + " (2,'2.2'), (null,null)");
    const expected = [
      { b1: 0, b2: 0.1 },
      { b1: 1, b2: 1.1 },
      { b1: 2, b2: 2.2 },
      { b1: null, b2: null }
    ];
    let rows = await conn.query('SELECT * from stupidCast');
    assert.deepEqual(rows, expected);
    rows = await conn.execute('SELECT * from stupidCast');
    assert.deepEqual(rows, expected);
    await conn.end();
  }, 5000);

  test('date cast', async function () {
    const longCast = (column, next) => {
      if (column.type === 'TIMESTAMP' || column.type === 'DATETIME') {
        let da = column.datetime();
        return da == null ? null : da.getMinutes();
      }
      if (column.type === 'DATE') {
        let da = column.date();
        return da == null ? null : da.getMonth() + 1;
      }
      return next();
    };
    const conn = await base.createConnection({ typeCast: longCast });
    await conn.query('DROP TABLE IF EXISTS stupidCast2');
    await conn.query('CREATE TABLE stupidCast2(b1 DATETIME default null,b2 DATE default null)');
    await conn.beginTransaction();
    await conn.query(
      'INSERT INTO stupidCast2 VALUES ' +
        "('1999-01-31 12:13:14.000', '1999-01-31'), " +
        "('1999-01-31 12:16:15', '1999-02-15')" +
        ', (null, null)'
    );
    let rows = await conn.query('SELECT * from stupidCast2');
    const expected = [
      { b1: 13, b2: 1 },
      { b1: 16, b2: 2 },
      { b1: null, b2: null }
    ];
    assert.deepEqual(rows, expected);
    rows = await conn.execute('SELECT * from stupidCast2');
    assert.deepEqual(rows, expected);
    await conn.end();
  }, 5000);

  test('geometry cast', async function () {
    const longCast = (column, next) => {
      if (column.type === 'BINARY') {
        return column.geometry();
      }
      return next();
    };
    const conn = await base.createConnection({ typeCast: longCast });
    await conn.query('DROP TABLE IF EXISTS stupidCast3');
    await conn.beginTransaction();
    await conn.query('CREATE TABLE stupidCast3(b1 POINT)');
    await conn.query('INSERT INTO stupidCast3 VALUES (?), (?),(null)', [
      {
        type: 'Point',
        coordinates: [10, 10]
      },
      {
        type: 'Point',
        coordinates: [20, 10]
      }
    ]);
    const expected = [
      {
        b1: {
          type: 'Point',
          coordinates: [10, 10]
        }
      },
      {
        b1: {
          type: 'Point',
          coordinates: [20, 10]
        }
      },
      {
        b1: serverPermitExtendedMetas ? { type: 'Point' } : null
      }
    ];
    let rows = await conn.query('SELECT * from stupidCast3');
    assert.deepEqual(rows, expected);
    rows = await conn.execute('SELECT * from stupidCast3');
    assert.deepEqual(rows, expected);
    await conn.end();
  }, 5000);
});
