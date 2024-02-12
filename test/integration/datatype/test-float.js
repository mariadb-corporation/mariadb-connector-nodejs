//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

const base = require('../../base.js');
const { assert } = require('chai');
const { isXpand } = require('../../base');

describe('float', () => {
  before((done) => {
    shareConn
      .query('DROP TABLE IF EXISTS testBigfloat')
      .then(() => {
        return shareConn.query('CREATE TABLE testBigfloat (a FLOAT, b DOUBLE)');
      })
      .then(() => {
        done();
      })
      .catch(done);
  });

  it('float escape', async function () {
    const buf = 19925.1;
    assert.equal(shareConn.escape(buf), '19925.1');
    const conn = await base.createConnection({ decimalAsNumber: true });

    const rows = await conn.query(' SELECT ' + shareConn.escape(buf) + ' t');
    assert.deepEqual(rows, [{ t: buf }]);
    conn.end();
  });

  it('bigint format', async () => {
    await shareConn.query('TRUNCATE testBigfloat');
    await shareConn.beginTransaction();
    await shareConn.query(
      'INSERT INTO testBigfloat values (-127.1, -128.2), (19925.0991, 900719925.4740991), (null, null)'
    );
    const rows = await shareConn.query('SELECT * FROM testBigfloat');
    assert.equal(rows.length, 3);
    assert.equal(rows[0].a, -127.1);
    assert.equal(rows[0].b, -128.2);
    assert.equal(rows[1].a, 19925.1);
    assert.equal(rows[1].b, isXpand() ? 900719925.4741 : 900719925.4740991);
    assert.equal(rows[2].a, null);
    assert.equal(rows[2].b, null);
    await shareConn.commit();
  });

  it('bigint format exec', async () => {
    await shareConn.query('TRUNCATE testBigfloat');
    await shareConn.beginTransaction();
    await shareConn.query(
      'INSERT INTO testBigfloat values (-127.1, -128.2), (19925.0991, 900719925.4740991), (null, null)'
    );
    const rows = await shareConn.execute('SELECT * FROM testBigfloat');
    assert.equal(rows.length, 3);
    assert.closeTo(rows[0].a, -127.1, 0.1);
    assert.equal(rows[0].b, -128.2);
    assert.closeTo(rows[1].a, 19925.1, 0.1);
    assert.equal(rows[1].b, 900719925.4740991);
    assert.equal(rows[2].a, null);
    assert.equal(rows[2].b, null);
    await shareConn.commit();
  });
});
