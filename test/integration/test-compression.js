//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

const base = require('../base.js');
const { assert } = require('chai');

describe('Compression', function () {
  const testSize = 16 * 1024 * 1024 + 800; // more than one packet
  let maxAllowedSize, buf, randomBuf;
  let conn;

  before(function (done) {
    base
      .createConnection({ compress: true, multipleStatements: true })
      .then((con) => {
        conn = con;
        conn.query('SELECT @@max_allowed_packet as t').then((row) => {
          maxAllowedSize = Number(row[0].t);
          if (testSize < maxAllowedSize) {
            buf = Buffer.alloc(testSize);
            randomBuf = Buffer.alloc(testSize);
            for (let i = 0; i < buf.length; i++) {
              buf[i] = 97 + (i % 10);
              randomBuf[i] = Math.floor(Math.random() * 255);
            }
          }
          done();
        });
      })
      .catch(done);
  });

  after(function (done) {
    conn
      .end()
      .then(() => {
        done();
      })
      .catch(done);
  });

  const generateLongText = function (len) {
    let t = '';
    for (let i = 0; i < len; i++) {
      t += 'a';
    }
    return t;
  };

  it('test compression multiple packet', function (done) {
    this.timeout(60000);
    if (maxAllowedSize < 35000000) this.skip();

    conn.query('CREATE TEMPORARY TABLE compressTab (t1 LONGTEXT, t2 LONGTEXT, t3 LONGTEXT, t4 LONGTEXT)');

    const longText = generateLongText(20000000);
    const mediumText = generateLongText(10000000);
    const smallIntText = generateLongText(60000);
    conn
      .query('INSERT INTO compressTab values (?,?,?,?)', [longText, mediumText, smallIntText, 'expected'])
      .then(() => {
        done();
      })
      .catch(done);
  });

  it('simple select 1', function (done) {
    conn
      .query("SELECT '1'")
      .then((rows) => {
        assert.deepEqual(rows, [{ 1: '1' }]);
        done();
      })
      .catch(done);
  });

  it('connection.ping()', async () => {
    let compressCon = await base.createConnection({ compress: true, multipleStatements: true });
    compressCon.ping();
    await compressCon.ping();
    try {
      await compressCon.ping(-2);
      throw new Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.message.includes('Ping cannot have negative timeout value'));
    }
    await compressCon.ping(200);

    compressCon.query('SELECT SLEEP(1)');
    const initTime = Date.now();

    try {
      await compressCon.ping(200);
      throw new Error('must have thrown error after ' + (Date.now() - initTime));
    } catch (err) {
      assert.isTrue(
        Date.now() - initTime > 195,
        'expected > 195, without waiting for SLEEP to finish, but was ' + (Date.now() - initTime)
      );
      assert.isTrue(err.message.includes('Ping timeout'));
      assert.isFalse(compressCon.isValid());
    }
  });

  it('multiple packet result (multiple rows)', function (done) {
    //using sequence engine
    if (!conn.info.isMariaDB() || !conn.info.hasMinVersion(10, 1)) this.skip();
    conn
      .query("select '1'; DO 1;select '2'")
      .then((rows) => {
        assert.equal(rows.length, 3);
        assert.deepEqual(rows[0], [{ 1: '1' }]);
        assert.deepEqual(rows[1], {
          affectedRows: 0,
          insertId: 0n,
          warningStatus: 0
        });
        assert.deepEqual(rows[2], [{ 2: '2' }]);
        done();
      })
      .catch(done);
  });

  it('parameter bigger than 16M packet size', async function () {
    if (maxAllowedSize <= testSize) return this.skip();
    this.timeout(20000); //can take some time
    conn.query('DROP TABLE IF EXISTS bigParameter');
    conn.query('CREATE TABLE bigParameter (b longblob)');
    await conn.query('FLUSH TABLES');
    await conn.beginTransaction();
    conn.query('insert into bigParameter(b) values(?)', [buf]);
    const rows = await conn.query('SELECT * from bigParameter');
    assert.deepEqual(rows[0].b, buf);
  });

  it('multi compression packet size', async function () {
    if (maxAllowedSize <= testSize) this.skip();
    this.timeout(20000); //can take some time
    conn.query('DROP TABLE IF EXISTS bigParameter2');
    conn.query('CREATE TABLE bigParameter2 (b longblob)');
    await conn.query('FLUSH TABLES');
    await conn.beginTransaction();
    conn.query('insert into bigParameter2(b) values(?)', [randomBuf]);
    const rows = await conn.query('SELECT * from bigParameter2');
    assert.deepEqual(rows[0].b, randomBuf);
  });
});
