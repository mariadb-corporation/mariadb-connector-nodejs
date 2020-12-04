'use strict';

const base = require('../base.js');
const { assert } = require('chai');

describe('Big query', function () {
  const testSize = 16 * 1024 * 1024 + 800; // more than one packet
  let maxAllowedSize, buf;

  before(function (done) {
    shareConn
      .query('SELECT @@max_allowed_packet as t')
      .then((row) => {
        maxAllowedSize = row[0].t;
        if (testSize < maxAllowedSize) {
          buf = Buffer.alloc(testSize);
          for (let i = 0; i < testSize; i++) {
            buf[i] = 97 + (i % 10);
          }
        }
        done();
      })
      .catch(done);
  });

  it('parameter bigger than 16M packet size', async function () {
    if (maxAllowedSize <= testSize) this.skip();
    this.timeout(20000); //can take some time
    shareConn.query('DROP TABLE IF EXISTS bigParameterBigParam');
    shareConn.query('CREATE TABLE bigParameterBigParam (b longblob)');
    await shareConn.query('FLUSH TABLES');
    shareConn.beginTransaction();
    shareConn.query('insert into bigParameterBigParam(b) values(?)', [buf]);
    const rows = await shareConn.query('SELECT * from bigParameterBigParam');
    assert.deepEqual(rows[0].b, buf);
    shareConn.commit();
  });

  it('int8 buffer overflow', async function () {
    const buf = Buffer.alloc(979, '0');
    const conn = await base.createConnection({ collation: 'latin1_swedish_ci' });
    conn.query('DROP TABLE IF EXISTS bigParameterInt8');
    conn.query('CREATE TABLE bigParameterInt8 (a varchar(1024), b varchar(10))');
    await conn.query('FLUSH TABLE');
    await conn.beginTransaction();
    await conn.query('insert into bigParameterInt8 values(?, ?)', [buf.toString(), 'test']);
    const rows = await conn.query('SELECT * from bigParameterInt8');
    assert.deepEqual(rows[0].a, buf.toString());
    assert.deepEqual(rows[0].b, 'test');
    conn.end();
  });

  it('buffer growing', async function () {
    if (maxAllowedSize <= 11 * 1024 * 1024) this.skip();
    this.timeout(10000); //can take some time
    const conn = await base.createConnection({ compress: true });
    await bufferGrowing(conn);
  });

  it('buffer growing compression', async function () {
    if (maxAllowedSize <= 11 * 1024 * 1024) this.skip();
    this.timeout(10000); //can take some time
    const conn = await base.createConnection({ compress: true });
    await bufferGrowing(conn);
  });

  async function bufferGrowing(conn) {
    const st = Buffer.alloc(65536, '0').toString();
    const st2 = Buffer.alloc(1048576, '0').toString();
    const params = [st];
    let sql = 'CREATE TABLE bigParameter (a0 MEDIUMTEXT ';
    let sqlInsert = 'insert into bigParameter values (?';
    for (let i = 1; i < 10; i++) {
      sql += ',a' + i + ' MEDIUMTEXT ';
      sqlInsert += ',?';
      params.push(i < 4 ? st : st2);
    }
    sql += ')';
    sqlInsert += ')';
    conn.query('DROP TABLE IF EXISTS bigParameter');
    conn.query(sql);
    await conn.query('FLUSH TABLES');
    conn.beginTransaction();
    await conn.beginTransaction();
    conn.query(sqlInsert, params);
    const rows = await conn.query('SELECT * from bigParameter');
    for (let i = 0; i < 10; i++) {
      assert.deepEqual(rows[0]['a' + i], params[i]);
    }
    conn.end();
  }
});
