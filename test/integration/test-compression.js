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
          maxAllowedSize = row[0].t;
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

  it('simple select 1', function (done) {
    conn
      .query('SELECT 1')
      .then((rows) => {
        assert.deepEqual(rows, [{ 1: 1 }]);
        done();
      })
      .catch(done);
  });

  it('multiple packet result (multiple rows)', function (done) {
    if (process.env.SKYSQL || process.env.SKYSQL_HA) this.skip();
    //using sequence engine
    if (!conn.info.isMariaDB() || !conn.info.hasMinVersion(10, 1)) this.skip();
    conn
      .query('select 1; DO 1;select 2')
      .then((rows) => {
        assert.equal(rows.length, 3);
        assert.deepEqual(rows[0], [{ 1: 1 }]);
        assert.deepEqual(rows[1], {
          affectedRows: 0,
          insertId: 0,
          warningStatus: 0
        });
        assert.deepEqual(rows[2], [{ 2: 2 }]);
        done();
      })
      .catch(done);
  });

  it('parameter bigger than 16M packet size', async function () {
    if (maxAllowedSize <= testSize) this.skip();
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
