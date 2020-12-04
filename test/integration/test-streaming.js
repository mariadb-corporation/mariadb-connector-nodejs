'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('streaming', () => {
  const fileName = path.join(os.tmpdir(), 'tempBigFile.txt');
  const halfFileName = path.join(os.tmpdir(), 'tempHalfFile.txt');
  const size = 20 * 1024 * 1024;
  const buf = Buffer.alloc(size);
  const buf2 = Buffer.alloc(size / 2);
  let maxAllowedSize;

  before(function (done) {
    this.timeout(20000);
    shareConn
      .query('DROP TABLE IF EXISTS Streaming')
      .then(() => {
        return shareConn.query(
          'CREATE TABLE Streaming (id int NOT NULL AUTO_INCREMENT, b longblob, c varchar(10), d longblob, e varchar(10), PRIMARY KEY (id))'
        );
      })
      .then(() => {
        return shareConn.query('SELECT @@max_allowed_packet as t');
      })
      .then((rows) => {
        maxAllowedSize = rows[0].t;
        createTmpFiles(done);
      })
      .catch(done);
  });

  after(function () {
    //create
    fs.unlink(fileName, (err) => {});
    fs.unlink(halfFileName, (err) => {});
  });

  it('Streaming url content', function (done) {
    this.timeout(30000);
    shareConn
      .query('DROP TABLE IF EXISTS StreamingContent')
      .then(() => {
        return shareConn.query(
          'CREATE TABLE StreamingContent (id int NOT NULL AUTO_INCREMENT, b longblob, c' +
            ' varchar(10), PRIMARY KEY (id))'
        );
      })
      .then(() => {
        const https = require('https');
        https.get(
          'https://repo1.maven.org/maven2/org/mariadb/jdbc/mariadb-java-client/2.3.0/mariadb-java-client-2.3.0.jar',
          (readableStream) => {
            shareConn
              .query('INSERT INTO StreamingContent (b, c) VALUE (?, ?)', [readableStream, null])
              .then(() => shareConn.query('SELECT * FROM StreamingContent'))
              .then((rows) => {
                done();
              })
              .catch(done);
          }
        );
      });
  });

  it('Streaming single parameter', async function () {
    if (maxAllowedSize < size) this.skip();
    this.timeout(20000);
    const r = fs.createReadStream(fileName);
    await shareConn.query('truncate Streaming');
    await shareConn.beginTransaction();
    await shareConn.query('insert into Streaming(b) values(?)', [r]);
    const rows = await shareConn.query('SELECT b from Streaming');
    assert.equal(size, rows[0].b.length);
    assert.deepEqual(rows, [{ b: buf }]);
  });

  it('Streaming multiple parameter', async function () {
    this.timeout(20000);
    if (maxAllowedSize < size) this.skip();
    const r = fs.createReadStream(halfFileName);
    const r2 = fs.createReadStream(halfFileName);
    await shareConn.query('truncate Streaming');
    await shareConn.beginTransaction();
    await shareConn.query('insert into Streaming(b, c, d, e) values(?, ?, ?, ?)', [
      r,
      't1',
      r2,
      't2'
    ]);
    const rows = await shareConn.query('SELECT * from Streaming');
    assert.equal(size / 2, rows[0].b.length);
    assert.equal(size / 2, rows[0].d.length);
    assert.deepEqual(rows, [{ id: 1, b: buf2, c: 't1', d: buf2, e: 't2' }]);
  });

  it('Streaming multiple parameter begin no stream', async function () {
    if (maxAllowedSize < size) this.skip();
    this.timeout(20000);
    const r = fs.createReadStream(halfFileName);
    const r2 = fs.createReadStream(halfFileName);
    await shareConn.query('truncate Streaming');
    await shareConn.beginTransaction();
    await shareConn.query('insert into Streaming(c, b, e, d) values(?, ?, ?, ?)', [
      't1',
      r,
      't2',
      r2
    ]);
    const rows = await shareConn.query('SELECT * from Streaming');
    assert.equal(size / 2, rows[0].b.length);
    assert.equal(size / 2, rows[0].d.length);
    assert.deepEqual(rows, [{ id: 1, b: buf2, c: 't1', d: buf2, e: 't2' }]);
  });

  it('Streaming multiple parameter ensure max callstack', async function () {
    if (maxAllowedSize < size) this.skip();
    this.timeout(20000);
    const r = fs.createReadStream(halfFileName);

    let createTable = 'CREATE TABLE Streaming2 (b longblob';
    let insertSql = 'insert into Streaming2 values(?';
    const params = [r];
    const max = 200;
    for (let i = 0; i < max; i++) {
      createTable += ',t' + i + ' int';
      insertSql += ',?';
      params.push(i);
    }
    createTable += ')';
    insertSql += ')';

    await shareConn.query('DROP TABLE IF EXISTS Streaming2');
    await shareConn.query(createTable);
    await shareConn.beginTransaction();
    await shareConn.query(insertSql, params);
    const rows = await shareConn.query('SELECT * from Streaming2');
    assert.equal(size / 2, rows[0].b.length);
    assert.deepEqual(rows[0].b, buf2);
    for (let i = 0; i < max; i++) {
      assert.equal(rows[0]['t' + i], i);
    }
  });

  function createTmpFiles(done) {
    for (let i = 0; i < buf.length; i++) {
      buf[i] = 97 + (i % 10);
    }

    //create
    fs.writeFile(fileName, buf, 'utf8', function (err) {
      if (err) {
        done(err);
      } else {
        for (let i = 0; i < buf2.length; i++) {
          buf2[i] = 97 + (i % 10);
        }
        fs.writeFile(halfFileName, buf2, 'utf8', function (err) {
          if (err) {
            done(err);
          } else {
            done();
          }
        });
      }
    });
  }
});
