//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import Conf from '../../conf.js';
import { createConnection, getEnv, isLocalDb, isMaxscale } from '../../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';

describe('datetime', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
    //MySQL 5.5 doesn't permit datetime(6)
    if (shareConn.info.isMariaDB() || shareConn.info.hasMinVersion(5, 6)) {
      await shareConn.query('DROP TABLE IF EXISTS table_date');
      await shareConn.query('CREATE TABLE table_date (t0 DATE, t1 DATETIME(3), t2 DATETIME(6))');
      await shareConn.query('INSERT INTO table_date VALUES (?, ?, ?)', [date, date2, date3]);
      await shareConn.query('INSERT INTO table_date VALUES (?, ?, ?)', [null, null, null]);
      if (shareConn.info.isMariaDB() || (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 7))) {
        await shareConn.query('INSERT INTO table_date VALUES (?, ?, ?)', [
          '0000-00-00',
          '0000-00-00 00:00:00',
          '0000-00-00 00:00:00'
        ]);
      }
    }
  });
  afterAll(async () => {
    await shareConn.query('DROP TABLE IF EXISTS table_date');
    await shareConn.end();
    shareConn = null;
  });

  const date = new Date('2001-12-31 00:00:00');
  const date2 = new Date('2250-12-31 23:59:58.123');
  const date3 = new Date('888-12-31 23:59:59.123456');

  test('date escape', async function () {
    const val = '1999-01-31 12:13:14';
    const buf = new Date('1999-01-31 12:13:14.000');
    assert.equal(shareConn.escape(buf), "'1999-01-31 12:13:14'");

    let rows = await shareConn.query(' SELECT ' + shareConn.escape(buf) + ' t');
    assert.deepEqual(rows, [{ t: val }]);
  });

  test('standard date', async ({ skip }) => {
    //using a distant server, time might be different
    // if local socket not available, this means using a distant / docker server that might have another default
    if (
      !isLocalDb() ||
      (Conf.baseConfig.host !== 'localhost' && Conf.baseConfig.host !== 'mariadb.example.com') ||
      isMaxscale(shareConn)
    ) {
      skip();
      return;
    }

    let res = await shareConn.query('SELECT UNIX_TIMESTAMP(?) tt', [new Date('2000-01-01 UTC')]);
    assert.deepEqual(res[0].tt, 946684800n);

    res = await shareConn.execute('SELECT UNIX_TIMESTAMP(?) tt', [new Date('2000-01-01 UTC')]);
    assert.deepEqual(res[0].tt, 946684800n);
  });

  test('date text', async ({ skip }) => {
    const date = new Date('1999-01-31 12:13:14');
    if (!shareConn.info.isMariaDB()) {
      skip();
      return;
    }

    let res = await shareConn.query('select CAST(? as datetime) d', [date]);
    assert.equal(Object.prototype.toString.call(res[0].d), '[object Date]');
    assert.equal(res[0].d.getDate(), date.getDate());
    assert.equal(res[0].d.getHours(), date.getHours());
    assert.equal(res[0].d.getMinutes(), date.getMinutes());
    assert.equal(res[0].d.getSeconds(), date.getSeconds());

    res = await shareConn.execute('select ? d', [date]);
    assert.equal(Object.prototype.toString.call(res[0].d), '[object Date]');
    assert.equal(res[0].d.getDate(), date.getDate());
    assert.equal(res[0].d.getHours(), date.getHours());
    assert.equal(res[0].d.getMinutes(), date.getMinutes());
    assert.equal(res[0].d.getSeconds(), date.getSeconds());
  });

  test('date text Z timezone', async ({ skip }) => {
    const date = new Date('1999-01-31 12:13:14');
    if (!shareConn.info.isMariaDB()) {
      skip();
      return;
    }
    const conn = await createConnection({ timezone: 'Z' });
    let res = await conn.query({ sql: 'select CAST(? as datetime) d' }, [date]);
    assert.equal(Object.prototype.toString.call(res[0].d), '[object Date]');
    assert.equal(res[0].d.getDate(), date.getDate());
    assert.equal(res[0].d.getHours(), date.getHours());
    assert.equal(res[0].d.getMinutes(), date.getMinutes());
    assert.equal(res[0].d.getSeconds(), date.getSeconds());

    res = await conn.execute({ sql: 'select ? d' }, [date]);
    assert.equal(Object.prototype.toString.call(res[0].d), '[object Date]');
    assert.equal(res[0].d.getDate(), date.getDate());
    assert.equal(res[0].d.getHours(), date.getHours());
    assert.equal(res[0].d.getMinutes(), date.getMinutes());
    assert.equal(res[0].d.getSeconds(), date.getSeconds());

    conn.close();
  });

  test('date text America/New_York timezone', async function (ctx) {
    try {
      const conn = await createConnection({ timezone: 'America/New_York' });
      const res = await conn.query({ sql: 'select CAST(? as datetime) d' }, [date]);
      assert.equal(Object.prototype.toString.call(res[0].d), '[object Date]');
      assert.equal(res[0].d.getDate(), date.getDate());
      assert.equal(res[0].d.getHours(), date.getHours());
      assert.equal(res[0].d.getMinutes(), date.getMinutes());
      assert.equal(res[0].d.getSeconds(), date.getSeconds());
      conn.close();
    } catch (err) {
      assert.equal(err.errno, 45033);
    }
  });

  test('date text from row', async ({ skip }) => {
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6)) {
      skip();
      return;
    }
    const rows = await shareConn.query('select * from table_date');
    const rowsExecute = await shareConn.execute('select * from table_date');
    const check = (rows) => {
      assert.equal(rows[0].t0.getTime(), date.getTime());
      assert.equal(rows[0].t1.getTime(), date2.getTime());
      assert.equal(rows[0].t2.getTime(), date3.getTime());

      assert.isNull(rows[1].t0);
      assert.isNull(rows[1].t1);
      assert.isNull(rows[1].t2);

      if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(5, 7)) {
        assert.isNull(rows[2].t0);
        assert.isNull(rows[2].t1);
        assert.isNull(rows[2].t2);
      }
    };
    check(rows);
    check(rowsExecute);
  });

  test('date text as string', async ({ skip }) => {
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6)) {
      skip();
      return;
    }

    const conn = await createConnection({
      dateStrings: true,
      profileSql: true
    });
    const rows = await conn.query('select * from table_date');
    const rowsExecute = await conn.execute('select * from table_date');
    const check = (rows, binary) => {
      assert.equal(rows[0].t0, '2001-12-31');
      assert.equal(rows[0].t1, '2250-12-31 23:59:58.123');
      //microsecond doesn't work in javascript date
      assert.equal(rows[0].t2, '0888-12-31 23:59:59.123000');

      assert.isNull(rows[1].t0);
      assert.isNull(rows[1].t1);
      assert.isNull(rows[1].t2);

      if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(5, 7)) {
        assert.equal(rows[2].t0, '0000-00-00');
        assert.equal(rows[2].t1, '0000-00-00 00:00:00.000');
        assert.equal(rows[2].t2, '0000-00-00 00:00:00.000000');
      }
    };
    check(rows, false);
    check(rowsExecute, true);
    conn.end();
  });

  test('query option : date text as string', async ({ skip }) => {
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6)) {
      skip();
      return;
    }
    const rows = await shareConn.query({ dateStrings: true, sql: 'select * from table_date' });
    const rowsExecute = await shareConn.execute({
      dateStrings: true,
      sql: 'select * from table_date'
    });
    const check = (rows, binary) => {
      assert.equal(rows[0].t0, '2001-12-31');
      assert.equal(rows[0].t1, '2250-12-31 23:59:58.123');
      //microsecond doesn't work in javascript date
      assert.equal(rows[0].t2, '0888-12-31 23:59:59.123000');

      assert.isNull(rows[1].t0);
      assert.isNull(rows[1].t1);
      assert.isNull(rows[1].t2);

      if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(5, 7)) {
        assert.equal(rows[2].t0, '0000-00-00');
        assert.equal(rows[2].t1, '0000-00-00 00:00:00.000');
        assert.equal(rows[2].t2, '0000-00-00 00:00:00.000000');
      }
    };
    check(rows, false);
    check(rowsExecute, true);
  });

  test('date insert with bulk', async function () {
    const val = '1999-01-31 12:13:14';
    const buf = new Date('1999-01-31 12:13:14.000');
    assert.equal(shareConn.escape(buf), "'1999-01-31 12:13:14'");

    await shareConn.query('DROP TABLE IF EXISTS table_date2');
    await shareConn.query('CREATE TABLE table_date2 (t0 DATE, t1 DATETIME(3), t2 DATETIME(6))');
    await shareConn.execute('INSERT INTO table_date2 VALUES (?, ?, ?)', [date, date2, date3]);
    let rows = await shareConn.query('select * from table_date2');
    assert.equal(rows[0].t0.getTime(), date.getTime());
    assert.equal(rows[0].t1.getTime(), date2.getTime());
    assert.equal(rows[0].t2.getTime(), date3.getTime());
    await shareConn.query('TRUNCATE TABLE table_date2');
    await shareConn.batch('INSERT INTO table_date2 VALUES (?, ?, ?)', [
      [date, date2, date3],
      [date, date2, date3]
    ]);
    rows = await shareConn.query('select * from table_date2');
    assert.equal(rows[0].t0.getTime(), date.getTime());
    assert.equal(rows[0].t1.getTime(), date2.getTime());
    assert.equal(rows[0].t2.getTime(), date3.getTime());
    assert.equal(rows[1].t0.getTime(), date.getTime());
    assert.equal(rows[1].t1.getTime(), date2.getTime());
    assert.equal(rows[1].t2.getTime(), date3.getTime());
  });
});
