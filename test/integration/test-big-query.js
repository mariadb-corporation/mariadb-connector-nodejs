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

  it('parameter bigger than 16M packet size', function (done) {
    if (maxAllowedSize <= testSize) this.skip();
    this.timeout(20000); //can take some time
    shareConn
      .query('DROP TABLE IF EXISTS bigParameterBigParam')
      .then(() => {
        return shareConn.query('CREATE TABLE bigParameterBigParam (b longblob)');
      })
      .then(() => {
        return shareConn.query('insert into bigParameterBigParam(b) values(?)', [buf]);
      })
      .then(() => {
        return shareConn.query('SELECT * from bigParameterBigParam');
      })
      .then((rows) => {
        assert.deepEqual(rows[0].b, buf);
        done();
      })
      .catch(done);
  });

  it('int8 buffer overflow', function (done) {
    const buf = Buffer.alloc(979, '0');
    base.createConnection({ collation: 'latin1_swedish_ci' }).then((conn) => {
      conn
        .query('DROP TABLE IF EXISTS bigParameterInt8')
        .then(() => {
          return conn.query('CREATE TABLE bigParameterInt8 (a varchar(1024), b varchar(10))');
        })
        .then(() => {
          return conn.query('insert into bigParameterInt8 values(?, ?)', [buf.toString(), 'test']);
        })
        .then(() => {
          return conn.query('SELECT * from bigParameterInt8');
        })
        .then((rows) => {
          assert.deepEqual(rows[0].a, buf.toString());
          assert.deepEqual(rows[0].b, 'test');
          conn.end();
          done();
        })
        .catch(done);
    });
  });

  it('buffer growing', function (done) {
    if (maxAllowedSize <= 11 * 1024 * 1024) this.skip();
    this.timeout(10000); //can take some time
    base
      .createConnection()
      .then((conn) => {
        bufferGrowing(conn, done);
      })
      .catch(done);
  });

  it('buffer growing compression', function (done) {
    if (maxAllowedSize <= 11 * 1024 * 1024) this.skip();
    this.timeout(10000); //can take some time
    base
      .createConnection({ compress: true })
      .then((conn) => {
        bufferGrowing(conn, done);
      })
      .catch(done);
  });

  function bufferGrowing(conn, done) {
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
    conn
      .query('DROP TABLE IF EXISTS bigParameter')
      .then(() => {
        return conn.query(sql);
      })
      .then(() => {
        return conn.query(sqlInsert, params);
      })
      .then(() => {
        return conn.query('SELECT * from bigParameter');
      })
      .then((rows) => {
        for (let i = 0; i < 10; i++) {
          assert.deepEqual(rows[0]['a' + i], params[i]);
        }
        conn.end();
        done();
      })
      .catch((err) => {
        conn.end();
        done(err);
      });
  }
});
