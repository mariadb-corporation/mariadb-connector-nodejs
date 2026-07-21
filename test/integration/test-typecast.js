//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const Capabilities = require('../../lib/const/capabilities');

describe('TypeCast', () => {
  let serverPermitExtendedMetas;
  before(function () {
    serverPermitExtendedMetas = (shareConn.info.serverCapabilities & Capabilities.MARIADB_CLIENT_EXTENDED_METADATA) > 0;
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

  it('query level typecast function', async function () {
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

  it('query level typecast function execute', async function () {
    const rows = await shareConn.execute({
      sql: "SELECT 'blaBLA' as upper, 'blaBLA' as lower, 'blaBLA' as std, '1' as r",
      typeCast: changeCaseCast
    });
    assert.deepEqual(rows, [{ upper: 'BLABLA', lower: 'blabla', std: 'blaBLA', r: '1' }]);
  });

  it('connection level typecast function', async function () {
    this.timeout(5000);
    const conn = await base.createConnection({ typeCast: changeCaseCast });
    const rows = await conn.query("SELECT 'blaBLA' as upper, 'blaBLA' as lower, 'blaBLA' as std, '1' as r");
    assert.deepEqual(rows, [{ upper: 'BLABLA', lower: 'blabla', std: 'blaBLA', r: '1' }]);
    conn.end();
  });

  it('connection level typecast function execute', async function () {
    this.timeout(5000);
    const conn = await base.createConnection({ typeCast: changeCaseCast });
    const rows = await conn.execute("SELECT 'blaBLA' as upper, 'blaBLA' as lower, 'blaBLA' as std, '1' as r");
    assert.deepEqual(rows, [{ upper: 'BLABLA', lower: 'blabla', std: 'blaBLA', r: '1' }]);
    conn.end();
  });

  it('compatibility automatic cast', async function () {
    this.timeout(5000);
    const conn = await base.createConnection({ typeCast: true });
    const rows = await conn.query("SELECT '1' as r");
    assert.deepEqual(rows, [{ r: '1' }]);
    conn.end();
  });

  it('compatibility automatic cast execute', async function () {
    this.timeout(5000);
    const conn = await base.createConnection({ typeCast: true });
    const rows = await conn.execute("SELECT '1' as r");
    assert.deepEqual(rows, [{ r: '1' }]);
    conn.end();
  });

  it('cast fields', async function () {
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

  it('cast fields execute', async function () {
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

  it('TINY(1) to boolean cast', async function () {
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
    conn.end();
  });

  it('long cast', async function () {
    this.timeout(5000);
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
    conn.end();
  });

  const ALL_TYPES_DDL =
    'ti TINYINT, uti TINYINT UNSIGNED, si SMALLINT, usi SMALLINT UNSIGNED, ' +
    'mi MEDIUMINT, umi MEDIUMINT UNSIGNED, i INT, ui INT UNSIGNED, ' +
    'bi BIGINT, ubi BIGINT UNSIGNED, yr YEAR, fl FLOAT, dbl DOUBLE, ' +
    'de DECIMAL(10,2), dt DATE, dtt DATETIME, tm TIME, vc VARCHAR(20)';
  const ALL_TYPES_VALUES =
    '(-128, 255, -32768, 65535, -8388608, 16777215, -2147483648, 4294967295, ' +
    '-9223372036854775808, 18446744073709551615, 2024, 1.5, 1234.5678, 12.34, ' +
    "'2020-02-29', '2020-02-29 12:13:14', '10:20:30', 'hello'), " +
    '(null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null)';

  // The binary protocol only length-encodes variable-length values, so string()/buffer() must
  // decode each fixed-width type natively. Getting this wrong also desynchronizes the packet
  // cursor, corrupting every subsequent column of the row - hence asserting on a wide row.
  it('string cast of every type is identical in text and binary protocol', async function () {
    this.timeout(5000);
    const conn = await base.createConnection({ typeCast: (column, next) => column.string() });
    await conn.query('DROP TABLE IF EXISTS castAllTypes');
    await conn.query(`CREATE TABLE castAllTypes(${ALL_TYPES_DDL})`);
    await conn.beginTransaction();
    await conn.query(`INSERT INTO castAllTypes VALUES ${ALL_TYPES_VALUES}`);

    const expected = [
      {
        ti: '-128',
        uti: '255',
        si: '-32768',
        usi: '65535',
        mi: '-8388608',
        umi: '16777215',
        i: '-2147483648',
        ui: '4294967295',
        bi: '-9223372036854775808',
        ubi: '18446744073709551615',
        yr: '2024',
        fl: '1.5',
        dbl: '1234.5678',
        de: '12.34',
        dt: '2020-02-29',
        dtt: '2020-02-29 12:13:14',
        tm: '10:20:30',
        vc: 'hello'
      },
      {
        ti: null,
        uti: null,
        si: null,
        usi: null,
        mi: null,
        umi: null,
        i: null,
        ui: null,
        bi: null,
        ubi: null,
        yr: null,
        fl: null,
        dbl: null,
        de: null,
        dt: null,
        dtt: null,
        tm: null,
        vc: null
      }
    ];

    assert.deepEqual(await conn.query('SELECT * from castAllTypes'), expected);
    assert.deepEqual(await conn.execute('SELECT * from castAllTypes'), expected);
    conn.end();
  });

  it('buffer cast of every type is identical in text and binary protocol', async function () {
    this.timeout(5000);
    const conn = await base.createConnection({
      typeCast: (column, next) => {
        const buf = column.buffer();
        return buf == null ? null : buf.toString('latin1');
      }
    });
    await conn.query('DROP TABLE IF EXISTS castAllTypesBuf');
    await conn.query(`CREATE TABLE castAllTypesBuf(${ALL_TYPES_DDL})`);
    await conn.beginTransaction();
    await conn.query(`INSERT INTO castAllTypesBuf VALUES ${ALL_TYPES_VALUES}`);

    const textRows = await conn.query('SELECT * from castAllTypesBuf');
    const binaryRows = await conn.execute('SELECT * from castAllTypesBuf');
    assert.deepEqual(binaryRows, textRows);
    assert.equal(textRows[0].i, '-2147483648');
    assert.equal(textRows[0].ubi, '18446744073709551615');
    conn.end();
  });

  it('numeric accessors honour column signedness', async function () {
    this.timeout(5000);
    const numCast = (column, next) => {
      if (column.type === 'INT') return column.int();
      if (column.type === 'BIGINT') return column.long();
      if (column.type === 'DOUBLE') return column.float();
      return next();
    };
    const conn = await base.createConnection({ typeCast: numCast });
    await conn.query('DROP TABLE IF EXISTS castUnsigned');
    await conn.query('CREATE TABLE castUnsigned(i INT UNSIGNED, bi BIGINT UNSIGNED, dbl DOUBLE)');
    await conn.beginTransaction();
    await conn.query('INSERT INTO castUnsigned VALUES (4294967295, 18446744073709551615, 1234.5678)');

    const expected = [{ i: 4294967295, bi: 18446744073709551615n, dbl: 1234.5678 }];
    assert.deepEqual(await conn.query('SELECT * from castUnsigned'), expected);
    assert.deepEqual(await conn.execute('SELECT * from castUnsigned'), expected);
    conn.end();
  });

  it('date cast', async function () {
    this.timeout(5000);
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
    await conn.query('DROP TABLE IF EXISTS stupidCast');
    await conn.query('CREATE TABLE stupidCast(b1 DATETIME default null,b2 DATE default null)');
    await conn.beginTransaction();
    await conn.query(
      'INSERT INTO stupidCast VALUES ' +
        "('1999-01-31 12:13:14.000', '1999-01-31'), " +
        "('1999-01-31 12:16:15', '1999-02-15')" +
        ', (null, null)'
    );
    let rows = await conn.query('SELECT * from stupidCast');
    const expected = [
      { b1: 13, b2: 1 },
      { b1: 16, b2: 2 },
      { b1: null, b2: null }
    ];
    assert.deepEqual(rows, expected);
    rows = await conn.execute('SELECT * from stupidCast');
    assert.deepEqual(rows, expected);
    conn.end();
  });

  it('geometry cast', async function () {
    this.timeout(5000);
    const longCast = (column, next) => {
      if (column.type === 'BINARY') {
        return column.geometry();
      }
      return next();
    };
    const conn = await base.createConnection({ typeCast: longCast });
    await conn.query('DROP TABLE IF EXISTS stupidCast');
    await conn.beginTransaction();
    await conn.query('CREATE TABLE stupidCast(b1 POINT)');
    await conn.query('INSERT INTO stupidCast VALUES (?), (?),(null)', [
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
    let rows = await conn.query('SELECT * from stupidCast');
    assert.deepEqual(rows, expected);
    rows = await conn.execute('SELECT * from stupidCast');
    assert.deepEqual(rows, expected);
    conn.end();
  });
});
