//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('local-infile', () => {
  const smallFileName = path.join(os.tmpdir(), 'smallLocalInfile.txt');
  const nonReadableFile = path.join(os.tmpdir(), 'nonReadableFile.txt');
  const bigFileName = path.join(os.tmpdir(), 'bigLocalInfile.txt');
  let conn;

  after(function () {
    fs.unlink(smallFileName, (err) => {});
    fs.unlink(nonReadableFile, (err) => {});
    fs.unlink(bigFileName, (err) => {});
  });

  afterEach(() => {
    if (conn) {
      conn.end();
      conn = null;
    }
  });

  it('local infile disable when permitLocalInfile option is set', function (done) {
    base
      .createConnection({ permitLocalInfile: false })
      .then((conn) => {
        conn
          .query("LOAD DATA LOCAL INFILE 'dummy.tsv' INTO TABLE t (id, test)")
          .then(() => {
            done(new Error('must have thrown error !'));
          })
          .catch((err) => {
            switch (err.code) {
              case 'ER_LOAD_INFILE_CAPABILITY_DISABLED':
                assert.equal(err.errno, 4166);
                assert.equal(err.sqlState, 'HY000');
                break;
              case 'ER_NO_SUCH_TABLE':
                assert.equal(err.errno, 1146);
                assert.equal(err.sqlState, 'HY000');
                break;
              default:
                assert.isTrue(err.errno == 1148 || err.errno == 3948);
                assert.equal(err.sqlState, '42000');
                break;
            }
            assert(!err.fatal);
            conn.end();
            done();
          });
      })
      .catch(done);
  });

  it('local infile disable when pipelining option is set', function (done) {
    base
      .createConnection({ pipelining: true })
      .then((conn) => {
        conn
          .query("LOAD DATA LOCAL INFILE 'dummy.tsv' INTO TABLE t (id, test)")
          .then(() => {
            done(new Error('must have thrown error !'));
          })
          .catch((err) => {
            switch (err.code) {
              case 'ER_LOAD_INFILE_CAPABILITY_DISABLED':
                assert.equal(err.errno, 4166);
                assert.equal(err.sqlState, 'HY000');
                break;
              case 'ER_NO_SUCH_TABLE':
                assert.equal(err.errno, 1146);
                assert.equal(err.sqlState, 'HY000');
                break;
              default:
                assert.isTrue(err.errno == 1148 || err.errno == 3948);
                assert.equal(err.sqlState, '42000');
                break;
            }
            assert(!err.fatal);
            conn.end();
            done();
          });
      })
      .catch(done);
  });

  it('local infile and init functions', function (done) {
    if (process.env.srv === 'xpand') this.skip();
    base
      .createConnection({ permitLocalInfile: true, initSql: "set time_zone='+00:00'" })
      .then((conn) => {
        conn
          .query('SELECT 1')
          .then(() => {
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('local infile disable using default options', function (done) {
    base
      .createConnection({ pipelining: undefined, permitLocalInfile: undefined })
      .then((conn) => {
        conn
          .query("LOAD DATA LOCAL INFILE 'dummy.tsv' INTO TABLE t (id, test)")
          .then(() => {
            conn.end();
            done(new Error('must have thrown error !'));
          })
          .catch((err) => {
            assert(err != null);
            switch (err.code) {
              case 'ER_LOAD_INFILE_CAPABILITY_DISABLED':
                assert.equal(err.errno, 4166);
                assert.equal(err.sqlState, 'HY000');
                break;
              case 'ER_NO_SUCH_TABLE':
                assert.equal(err.errno, 1146);
                assert.equal(err.sqlState, 'HY000');
                break;
              default:
                assert.isTrue(err.errno == 1148 || err.errno == 3948);
                assert.equal(err.sqlState, '42000');
                break;
            }
            assert(!err.fatal);
            conn.end();
            done();
          });
      })
      .catch(done);
  });

  it('file error missing', async function () {
    const self = this;
    const rows = await shareConn.query('select @@local_infile');
    if (
      rows[0]['@@local_infile'] === 0 ||
      (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0)) ||
      process.env.srv === 'skysql' ||
      process.env.srv === 'skysql-ha'
    ) {
      return self.skip();
    }
    const conn = await base.createConnection({ permitLocalInfile: true });
    await shareConn.query('DROP TABLE IF EXISTS smallLocalInfile');
    await conn.query('CREATE TABLE smallLocalInfile(id int, test varchar(100))');
    try {
      await conn.query(
        "LOAD DATA LOCAL INFILE '" +
          path.join(os.tmpdir(), 'notExistFile.txt').replace(/\\/g, '/') +
          "' INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)"
      );
      throw new Error('must have thrown error !');
    } catch (err) {
      assert(err.message.includes('LOCAL INFILE command failed: ENOENT: no such file or directory'));
      assert.equal(err.sqlState, '22000');
      assert(!err.fatal);
      conn.end();
    }
  });

  it('small local infile', async function () {
    const self = this;
    const rows = await shareConn.query('select @@local_infile');
    if (
      rows[0]['@@local_infile'] === 0 ||
      (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0)) ||
      process.env.srv === 'skysql' ||
      process.env.srv === 'skysql-ha'
    ) {
      return self.skip();
    }
    await new Promise(function (resolve, reject) {
      fs.writeFile(smallFileName, '1,hello\n2,world\n', 'utf8', function (err) {
        if (err) reject(err);
        else resolve();
      });
    });
    const conn = await base.createConnection({ permitLocalInfile: true });
    await conn.query('DROP TABLE IF EXISTS smallLocalInfile');
    await conn.query('CREATE TABLE smallLocalInfile(id int, test varchar(100))');
    await conn.beginTransaction();
    await conn.query(
      "LOAD DATA LOCAL INFILE '" +
        smallFileName.replace(/\\/g, '\\\\') +
        "' INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)"
    );
    const rows2 = await conn.query('SELECT * FROM smallLocalInfile');
    assert.deepEqual(rows2, [
      { id: 1, test: 'hello' },
      { id: 2, test: 'world' }
    ]);
    conn.end();
  });

  it('small infileStreamFactory connection lvl', async function () {
    const self = this;
    const rows = await shareConn.query('select @@local_infile');
    if (
      rows[0]['@@local_infile'] === 0 ||
      (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0)) ||
      process.env.srv === 'skysql' ||
      process.env.srv === 'skysql-ha'
    ) {
      return self.skip();
    }
    await new Promise(function (resolve, reject) {
      fs.writeFile(smallFileName, '1,hello\n2,world\n', 'utf8', function (err) {
        if (err) reject(err);
        else resolve();
      });
    });
    const conn = await base.createConnection({
      permitLocalInfile: true,
      infileStreamFactory: () => {
        return fs.createReadStream(smallFileName);
      }
    });
    await conn.query('DROP TABLE IF EXISTS smallLocalInfile');
    await conn.query('CREATE TABLE smallLocalInfile(id int, test varchar(100))');
    await conn.beginTransaction();
    await conn.query(
      "LOAD DATA LOCAL INFILE 'no_file' INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)"
    );
    const rows2 = await conn.query('SELECT * FROM smallLocalInfile');
    assert.deepEqual(rows2, [
      { id: 1, test: 'hello' },
      { id: 2, test: 'world' }
    ]);
    conn.end();
  });

  it('infileStreamFactory Error', async function () {
    const self = this;
    const rows = await shareConn.query('select @@local_infile');
    if (
      rows[0]['@@local_infile'] === 0 ||
      (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0)) ||
      process.env.srv === 'skysql' ||
      process.env.srv === 'skysql-ha'
    ) {
      return self.skip();
    }

    const conn = await base.createConnection({
      permitLocalInfile: true,
      infileStreamFactory: () => {
        throw new Error('Expect to throw Error');
      }
    });
    await conn.query('DROP TABLE IF EXISTS smallLocalInfile');
    await conn.query('CREATE TABLE smallLocalInfile(id int, test varchar(100))');
    await conn.beginTransaction();
    try {
      await conn.query(
        "LOAD DATA LOCAL INFILE 'no_file' INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)"
      );
      throw new Error('Expect to have thrown an error');
    } catch (err) {
      assert.equal(err.errno, 45022);
      assert.equal(err.sqlState, '22000');
    }
    const rows2 = await conn.query('SELECT * FROM smallLocalInfile');
    assert.deepEqual(rows2, []);
    conn.end();
  });

  it('small infileStreamFactory query lvl', async function () {
    const self = this;
    const rows = await shareConn.query('select @@local_infile');
    if (
      rows[0]['@@local_infile'] === 0 ||
      (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0)) ||
      process.env.srv === 'skysql' ||
      process.env.srv === 'skysql-ha'
    ) {
      return self.skip();
    }
    await new Promise(function (resolve, reject) {
      fs.writeFile(smallFileName, '1,hello\n2,world\n', 'utf8', function (err) {
        if (err) reject(err);
        else resolve();
      });
    });
    const conn = await base.createConnection({ permitLocalInfile: true });
    await conn.query('DROP TABLE IF EXISTS smallLocalInfile');
    await conn.query('CREATE TABLE smallLocalInfile(id int, test varchar(100))');
    await conn.beginTransaction();
    await conn.query({
      sql: "LOAD DATA LOCAL INFILE 'no_file' INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)",
      infileStreamFactory: () => {
        return fs.createReadStream(smallFileName);
      }
    });
    const rows2 = await conn.query('SELECT * FROM smallLocalInfile');
    assert.deepEqual(rows2, [
      { id: 1, test: 'hello' },
      { id: 2, test: 'world' }
    ]);
    conn.end();
  });

  it('small local infile with parameter', async function () {
    const self = this;
    const rows = await shareConn.query('select @@local_infile');
    if (
      rows[0]['@@local_infile'] === 0 ||
      (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0)) ||
      process.env.srv === 'skysql' ||
      process.env.srv === 'skysql-ha'
    ) {
      return self.skip();
    }
    await new Promise(function (resolve, reject) {
      fs.writeFile(smallFileName, '1,hello\n2,world\n', 'utf8', function (err) {
        if (err) reject(err);
        else resolve();
      });
    });
    const conn = await base.createConnection({ permitLocalInfile: true });
    await conn.query('DROP TABLE IF EXISTS smallLocalInfile');
    await conn.query('CREATE TABLE smallLocalInfile(id int, test varchar(100))');
    await conn.beginTransaction();
    await conn.query(
      "LOAD DATA LOCAL INFILE ? INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)",
      smallFileName
    );
    await conn.query("LOAD DATA LOCAL INFILE ? INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)", [
      smallFileName
    ]);

    const rows2 = await conn.query('SELECT * FROM smallLocalInfile');
    assert.deepEqual(rows2, [
      { id: 1, test: 'hello' },
      { id: 2, test: 'world' },
      { id: 1, test: 'hello' },
      { id: 2, test: 'world' }
    ]);
    conn.end();
  });

  it('small local infile with non supported node.js encoding', async function () {
    const self = this;
    const rows = await shareConn.query('select @@local_infile');
    if (
      rows[0]['@@local_infile'] === 0 ||
      (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0)) ||
      process.env.srv === 'skysql' ||
      process.env.srv === 'skysql-ha'
    ) {
      return self.skip();
    }

    await new Promise(function (resolve, reject) {
      fs.writeFile(smallFileName, '1,hello\n2,world\n', 'utf8', function (err) {
        if (err) reject(err);
        else resolve();
      });
    });
    const conn = await base.createConnection({ permitLocalInfile: true, charset: 'big5' });
    await conn.query('DROP TABLE IF EXISTS smallLocalInfile');
    await conn.query('CREATE TABLE smallLocalInfile(id int, test varchar(100))');
    await conn.beginTransaction();
    await conn.query(
      "LOAD DATA LOCAL INFILE '" +
        smallFileName.replace(/\\/g, '/') +
        "' INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)"
    );
    const rows2 = await conn.query('SELECT * FROM smallLocalInfile');
    assert.deepEqual(rows2, [
      { id: 1, test: 'hello' },
      { id: 2, test: 'world' }
    ]);
    conn.end();
  });

  it('non readable local infile', function (done) {
    //on windows, fs.chmodSync doesn't remove read access.
    if (process.platform === 'win32') this.skip();

    const self = this;
    shareConn
      .query('select @@local_infile')
      .then((rows) => {
        if (
          rows[0]['@@local_infile'] === 0 ||
          (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0)) ||
          process.env.srv === 'skysql' ||
          process.env.srv === 'skysql-ha'
        ) {
          return self.skip();
        }

        return new Promise(function (resolve, reject) {
          fs.writeFile(nonReadableFile, '1,hello\n2,world\n', 'utf8', function (err) {
            if (err) reject(err);
            else resolve();
          });
        });
      })
      .then(() => {
        fs.chmodSync(nonReadableFile, 0o222);
        base
          .createConnection({ permitLocalInfile: true })
          .then((conn) => {
            shareConn
              .query('DROP TABLE IF EXISTS nonReadableFile')
              .then(() => {
                return conn.query('CREATE TABLE nonReadableFile(id int, test varchar(100))');
              })
              .then(() => {
                return conn.query(
                  "LOAD DATA LOCAL INFILE '" +
                    nonReadableFile.replace(/\\/g, '/') +
                    "' INTO TABLE nonReadableFile FIELDS TERMINATED BY ',' (id, test)"
                );
              })
              .then(() => {
                conn.end();
                // expected result is to throw error, but super user might still read file.
                done();
              })
              .catch((err) => {
                assert.equal(err.sqlState, '22000');
                assert(!err.fatal);
                conn.end();
                done();
              });
          })
          .catch(done);
      })
      .catch(done);
  });

  it('big local infile', async function () {
    this.timeout(180000);
    let size;
    const self = this;
    let rows = await shareConn.query('select @@local_infile');
    if (
      rows[0]['@@local_infile'] === 0 ||
      (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0)) ||
      process.env.srv === 'skysql' ||
      process.env.srv === 'skysql-ha'
    ) {
      return self.skip();
    }

    rows = await shareConn.query('SELECT @@max_allowed_packet as t');
    const maxAllowedSize = Number(rows[0].t);
    if (maxAllowedSize > 50000000) this.skip();
    size = Math.round((maxAllowedSize - 300) / 16);
    const header = '"a","b"\n';
    const headerLen = header.length;
    const buf = Buffer.allocUnsafe(size * 16 + headerLen);
    buf.write(header);
    for (let i = 0; i < size; i++) {
      buf.write('"a' + padStartZero(i, 8) + '","b"\n', i * 16 + headerLen);
    }
    await new Promise(function (resolve, reject) {
      fs.writeFile(bigFileName, buf, function (err) {
        if (err) reject(err);
        else resolve();
      });
    });
    const conn = await base.createConnection({ permitLocalInfile: true });
    await conn.query('DROP TABLE IF EXISTS bigLocalInfile');
    await conn.query('CREATE TABLE bigLocalInfile(t1 varchar(10), t2 varchar(2))');
    await conn.beginTransaction();

    const sql =
      "LOAD DATA LOCAL INFILE '" +
      bigFileName.replace(/\\/g, '/') +
      "' INTO TABLE bigLocalInfile " +
      "COLUMNS TERMINATED BY ',' ENCLOSED BY '\\\"' ESCAPED BY '\\\\' " +
      "LINES TERMINATED BY '\\n' IGNORE 1 LINES " +
      '(t1, t2)';

    await conn.query(sql);
    rows = await conn.query('SELECT * FROM bigLocalInfile');
    assert.equal(rows.length, size);
    for (let i = 0; i < size; i++) {
      if (rows[i].t1 !== 'a' + padStartZero(i, 8) && rows[i].t2 !== 'b') {
        console.log(
          'result differ (no:' + i + ') t1=' + rows[i].t1 + ' != ' + padStartZero(i, 8) + ' t2=' + rows[i].t2
        );
      }
    }
    conn.end();
  });

  function padStartZero(val, length) {
    val = '' + val;
    const stringLength = val.length;
    let add = '';
    while (add.length + stringLength < length) add += '0';
    return add + val;
  }
});
