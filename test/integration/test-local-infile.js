'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('local-infile', () => {
  const smallFileName = path.join(os.tmpdir(), 'smallLocalInfile.txt');
  const bigFileName = path.join(os.tmpdir(), 'bigLocalInfile.txt');
  let conn;

  after(function() {
    fs.unlink(smallFileName, err => {});
    fs.unlink(bigFileName, err => {});
  });

  afterEach(() => {
    if (conn) {
      conn.end();
      conn = null;
    }
  });

  it('local infile disable when permitLocalInfile option is set', function(done) {
    base
      .createConnection({ permitLocalInfile: false })
      .then(conn => {
        conn
          .query("LOAD DATA LOCAL INFILE 'dummy.tsv' INTO TABLE t (id, test)")
          .then(() => {
            done(new Error('must have thrown error !'));
          })
          .catch(err => {
            assert.equal(err.errno, 1148);
            assert.equal(err.sqlState, '42000');
            assert(!err.fatal);
            conn.end();
            done();
          });
      })
      .catch(done);
  });

  it('local infile disable when pipelining option is set', function(done) {
    base
      .createConnection({ pipelining: true })
      .then(conn => {
        conn
          .query("LOAD DATA LOCAL INFILE 'dummy.tsv' INTO TABLE t (id, test)")
          .then(() => {
            done(new Error('must have thrown error !'));
          })
          .catch(err => {
            assert.equal(err.errno, 1148);
            assert.equal(err.sqlState, '42000');
            assert(!err.fatal);
            conn.end();
            done();
          });
      })
      .catch(done);
  });

  it('local infile disable using default options', function(done) {
    base
      .createConnection({ pipelining: undefined, permitLocalInfile: undefined })
      .then(conn => {
        conn
          .query("LOAD DATA LOCAL INFILE 'dummy.tsv' INTO TABLE t (id, test)")
          .then(() => {
            done(new Error('must have thrown error !'));
          })
          .catch(err => {
            assert(err != null);
            assert.equal(err.errno, 1148);
            assert.equal(err.sqlState, '42000');
            assert(!err.fatal);
            conn.end();
            done();
          });
      })
      .catch(done);
  });

  it('file error missing', function(done) {
    const self = this;
    shareConn
      .query('select @@local_infile')
      .then(rows => {
        if (rows[0]['@@local_infile'] === 0) {
          self.skip();
        }
        base
          .createConnection({ permitLocalInfile: true })
          .then(conn => {
            conn
              .query(
                'CREATE TEMPORARY TABLE smallLocalInfile(id int, test varchar(100))'
              )
              .then(() => {
                return conn.query(
                  "LOAD DATA LOCAL INFILE '" +
                    path
                      .join(os.tmpdir(), 'notExistFile.txt')
                      .replace(/\\/g, '/') +
                    "' INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)"
                );
              })
              .then(() => {
                done(new Error('must have thrown error !'));
              })
              .catch(err => {
                assert(
                  err.message.includes(
                    'LOCAL INFILE command failed: ENOENT: no such file or directory'
                  )
                );
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

  it('small local infile', function(done) {
    const self = this;
    shareConn
      .query('select @@local_infile')
      .then(rows => {
        if (rows[0]['@@local_infile'] === 0) {
          self.skip();
        }
        return new Promise(function(resolve, reject) {
          fs.writeFile(smallFileName, '1,hello\n2,world\n', 'utf8', function(
            err
          ) {
            if (err) reject(err);
            else resolve();
          });
        });
      })
      .then(() => {
        base
          .createConnection({ permitLocalInfile: true })
          .then(conn => {
            conn.query(
              'CREATE TEMPORARY TABLE smallLocalInfile(id int, test varchar(100))'
            );
            conn
              .query(
                "LOAD DATA LOCAL INFILE '" +
                  smallFileName.replace(/\\/g, '/') +
                  "' INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)"
              )
              .then(() => {
                return conn.query('SELECT * FROM smallLocalInfile');
              })
              .then(rows => {
                assert.deepEqual(rows, [
                  { id: 1, test: 'hello' },
                  { id: 2, test: 'world' }
                ]);
                conn.end();
                done();
              })
              .catch(done);
          })
          .catch(done);
      })
      .catch(done);
  });

  it('big local infile', function(done) {
    this.timeout(180000);
    let size;
    const self = this;
    shareConn
      .query('select @@local_infile')
      .then(rows => {
        if (rows[0]['@@local_infile'] === 0) {
          self.skip();
        }
        return shareConn.query('SELECT @@max_allowed_packet as t');
      })
      .then(rows => {
        const maxAllowedSize = rows[0].t;
        size = Math.round((maxAllowedSize - 100) / 16);
        const header = '"a","b"\n';
        const headerLen = header.length;
        const buf = Buffer.allocUnsafe(size * 16 + headerLen);
        buf.write(header);
        for (let i = 0; i < size; i++) {
          buf.write('"a' + padStartZero(i, 8) + '","b"\n', i * 16 + headerLen);
        }
        return new Promise(function(resolve, reject) {
          fs.writeFile(bigFileName, buf, function(err) {
            if (err) reject(err);
            else resolve();
          });
        });
      })
      .then(() => {
        base
          .createConnection({ permitLocalInfile: true })
          .then(conn => {
            conn.query(
              'CREATE TEMPORARY TABLE bigLocalInfile(t1 varchar(10), t2 varchar(2))'
            );
            conn
              .query(
                "LOAD DATA LOCAL INFILE '" +
                  bigFileName.replace(/\\/g, '/') +
                  "' INTO TABLE bigLocalInfile " +
                  "COLUMNS TERMINATED BY ',' ENCLOSED BY '\\\"' ESCAPED BY '\\\\' " +
                  "LINES TERMINATED BY '\\n' IGNORE 1 LINES " +
                  '(t1, t2)'
              )
              .then(() => {
                return conn.query('SELECT * FROM bigLocalInfile');
              })
              .then(rows => {
                assert.equal(rows.length, size);
                for (let i = 0; i < size; i++) {
                  if (
                    rows[i].t1 !== 'a' + padStartZero(i, 8) &&
                    rows[i].t2 !== 'b'
                  ) {
                    console.log(
                      'result differ (no:' +
                        i +
                        ') t1=' +
                        rows[i].t1 +
                        ' != ' +
                        padStartZero(i, 8) +
                        ' t2=' +
                        rows[i].t2
                    );
                  }
                }
                conn.end();
                done();
              })
              .catch(done);
          })
          .catch(done);
      })
      .catch(done);
  });

  function padStartZero(val, length) {
    val = '' + val;
    const stringLength = val.length;
    let add = '';
    while (add.length + stringLength < length) add += '0';
    return add + val;
  }
});
