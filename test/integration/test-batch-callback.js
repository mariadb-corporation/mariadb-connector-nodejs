//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const Capabilities = require('../../lib/const/capabilities');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Conf = require('../conf');

describe('batch callback', function () {
  const fileName = path.join(os.tmpdir(), Math.random() + 'tempBatchFile.txt');
  const testSize = 16 * 1024 * 1024 + 800; // more than one packet
  let maxAllowedSize, bigBuf, timezoneParam;
  let supportBulk;
  this.timeout(30000);

  before(function (done) {
    supportBulk = (Conf.baseConfig.bulk === undefined ? true : Conf.baseConfig.bulk)
      ? (shareConn.info.serverCapabilities & Capabilities.MARIADB_CLIENT_STMT_BULK_OPERATIONS) > 0
      : false;
    const hourOffset = Math.round((-1 * new Date().getTimezoneOffset()) / 60);

    if (hourOffset < 0) {
      if (hourOffset <= -10) {
        timezoneParam = hourOffset + ':00';
      } else {
        timezoneParam = '-0' + Math.abs(hourOffset) + ':00';
      }
    } else {
      if (hourOffset >= 10) {
        timezoneParam = '+' + Math.abs(hourOffset) + ':00';
      } else {
        timezoneParam = '+0' + Math.abs(hourOffset) + ':00';
      }
    }

    shareConn
      .query('SELECT @@max_allowed_packet as t')
      .then((row) => {
        maxAllowedSize = Number(row[0].t);
        if (testSize < maxAllowedSize + 100) {
          bigBuf = Buffer.alloc(testSize);
          for (let i = 0; i < testSize; i++) {
            bigBuf[i] = 97 + (i % 10);
          }
        }
        const buf = Buffer.from('abcdefghijkflmnopqrtuvwxyz🤘💪');
        fs.writeFile(fileName, buf, 'utf8', function (err) {
          if (err) {
            done(err);
          } else {
            done();
          }
        });
      })
      .catch(done);
  });

  beforeEach(function (done) {
    //just to ensure shared connection is not closed by server due to inactivity
    shareConn
      .ping()
      .then(() => {
        done();
      })
      .catch(done);
  });

  after(function () {
    fs.unlink(fileName, (err) => {});
  });

  const simpleBatch = (useCompression, useBulk, timezone, done) => {
    const conn = base.createCallbackConnection({
      compress: useCompression,
      bulk: useBulk,
      timezone: timezone
    });
    conn.connect(function (err) {
      if (err) return done(err);
      conn.query('DROP TABLE IF EXISTS simpleBatch');
      conn.query(
        'CREATE TABLE simpleBatch(' +
          'id int, id2 boolean, id3 int, t varchar(128), d datetime, d2 datetime(6), g POINT, id4 int) ' +
          'CHARSET utf8mb4'
      );
      conn.query('FLUSH TABLES');
      conn.beginTransaction(() => {
        const f = {};
        f.toSqlString = () => {
          return 'blabla';
        };
        conn.batch(
          { sql: 'INSERT INTO `simpleBatch` values (1, ?, 2, ?, ?, ?, ?, 3)', fullResult: false },
          [
            [
              true,
              'john😎🌶\\\\',
              new Date('2001-12-31 23:59:58'),
              new Date('2018-01-01 12:30:20.456789'),
              {
                type: 'Point',
                coordinates: [10, 10]
              }
            ],
            [
              true,
              f,
              new Date('2001-12-31 23:59:58'),
              new Date('2018-01-01 12:30:20.456789'),
              {
                type: 'Point',
                coordinates: [10, 10]
              }
            ],
            [
              false,
              { name: 'jackमस्', val: 'tt' },
              null,
              new Date('2018-01-21 11:30:20.123456'),
              {
                type: 'Point',
                coordinates: [10, 20]
              }
            ],
            [
              0,
              null,
              new Date('2020-12-31 23:59:59'),
              new Date('2018-01-21 11:30:20.123456'),
              {
                type: 'Point',
                coordinates: [20, 20]
              }
            ]
          ],
          (err, res) => {
            if (err) return done(err);

            assert.equal(res.affectedRows, 4);
            conn.query('select * from `simpleBatch`', (err, res) => {
              if (err) return done(err);
              assert.deepEqual(res, [
                {
                  id: 1,
                  id2: 1,
                  id3: 2,
                  t: 'john😎🌶\\\\',
                  d: new Date('2001-12-31 23:59:58'),
                  d2: new Date('2018-01-01 12:30:20.456789'),
                  g: {
                    type: 'Point',
                    coordinates: [10, 10]
                  },
                  id4: 3
                },
                {
                  id: 1,
                  id2: 1,
                  id3: 2,
                  t: 'blabla',
                  d: new Date('2001-12-31 23:59:58'),
                  d2: new Date('2018-01-01 12:30:20.456789'),
                  g: {
                    type: 'Point',
                    coordinates: [10, 10]
                  },
                  id4: 3
                },
                {
                  id: 1,
                  id2: 0,
                  id3: 2,
                  t: '{"name":"jackमस्","val":"tt"}',
                  d: null,
                  d2: new Date('2018-01-21 11:30:20.123456'),
                  g: {
                    type: 'Point',
                    coordinates: [10, 20]
                  },
                  id4: 3
                },
                {
                  id: 1,
                  id2: 0,
                  id3: 2,
                  t: null,
                  d: new Date('2020-12-31 23:59:59'),
                  d2: new Date('2018-01-21 11:30:20.123456'),
                  g: {
                    type: 'Point',
                    coordinates: [20, 20]
                  },
                  id4: 3
                }
              ]);
              conn.query('DROP TABLE simpleBatch', (err, res) => {
                conn.end(() => {
                  done();
                });
              });
            });
          }
        );
      });
      conn.query("select '1'", (err, rows) => {
        if (err) return done(err);
        assert.deepEqual(rows, [{ 1: '1' }]);
      });
    });
  };

  const simpleBatchWithOptions = (useCompression, useBulk, done) => {
    const conn = base.createCallbackConnection({
      compress: useCompression,
      bulk: useBulk
    });
    conn.connect(function (err) {
      if (err) return done(err);
      conn.query('DROP TABLE IF EXISTS simpleBatchWithOptions');
      conn.query(
        'CREATE TABLE simpleBatchWithOptions(id INT NOT NULL AUTO_INCREMENT, d datetime, UNIQUE KEY `id` (`id`))'
      );
      conn.query('FLUSH TABLES');
      conn.beginTransaction(() => {
        const f = {};
        f.toSqlString = () => {
          return 'blabla';
        };
        conn.batch(
          {
            sql: 'INSERT INTO `simpleBatchWithOptions`(d) values (?)',
            maxAllowedPacket: 1048576,
            fullResult: true
          },
          [[new Date('2001-12-31 23:59:58')], [new Date('2001-12-31 23:59:58')]],
          (err, res) => {
            if (err) {
              return conn.end(() => {
                done(err);
              });
            }
            assert.deepEqual(res, [
              {
                affectedRows: 1,
                insertId: 1n,
                warningStatus: 0
              },
              {
                affectedRows: 1,
                insertId: 2n,
                warningStatus: 0
              }
            ]);
            conn.query('select * from `simpleBatchWithOptions`', (err, res) => {
              if (err) return done(err);
              assert.deepEqual(res, [
                {
                  id: 1,
                  d: new Date('2001-12-31 23:59:58')
                },
                {
                  id: 2,
                  d: new Date('2001-12-31 23:59:58')
                }
              ]);
              conn.query('DROP TABLE simpleBatchWithOptions', (err, res) => {
                if (err) return done(err);
                conn.end(() => {
                  done();
                });
              });
            });
          }
        );
      });

      conn.query({ sql: 'select 1', bigIntAsNumber: true }, (err, rows) => {
        if (err) {
          return conn.end(() => {
            done(err);
          });
        }
        assert.deepEqual(rows, [{ 1: 1 }]);
      });
    });
  };

  const simpleBatchEncodingCP1251 = (useCompression, useBulk, timezone, done) => {
    const conn = base.createCallbackConnection({
      compress: useCompression,
      bulk: useBulk,
      collation: 'CP1251_GENERAL_CI'
    });
    conn.connect(function (err) {
      if (err) return done(err);
      conn.query('DROP TABLE IF EXISTS simpleBatchCP1251');
      conn.query('CREATE TABLE simpleBatchCP1251(t varchar(128), id int) CHARSET utf8mb4');
      conn.query('FLUSH TABLES');
      conn.beginTransaction(() => {
        conn.batch(
          { sql: 'INSERT INTO `simpleBatchCP1251` values (?, ?)', fullResult: false },
          [
            ['john', 2],
            ['©°', 3]
          ],
          (err, res) => {
            assert.equal(res.affectedRows, 2);
            conn.query('select * from `simpleBatchCP1251`', (err, res) => {
              if (err) {
                return conn.end(() => {
                  done(err);
                });
              }
              assert.deepEqual(res, [
                { id: 2, t: 'john' },
                { id: 3, t: '©°' }
              ]);
              conn.query('DROP TABLE simpleBatchCP1251', (err, res) => {
                if (err) return done(err);
                conn.end(() => {
                  done();
                });
              });
            });
          }
        );
      });

      conn.query({ sql: 'select 2', bigIntAsNumber: true }, (err, rows) => {
        if (err) {
          return conn.end(() => {
            done(err);
          });
        }
        assert.deepEqual(rows, [{ 2: 2 }]);
      });
    });
  };

  const simpleBatchErrorMsg = (compression, useBulk, done) => {
    const conn = base.createCallbackConnection({ trace: true, bulk: useBulk });
    conn.connect(function (err) {
      if (err) return done(err);
      conn.batch(
        'INSERT INTO simpleBatchErrorMsg values (1, ?, 2, ?, 3)',
        [
          [1, 'john'],
          [2, 'jack']
        ],
        (err) => {
          if (!err) {
            return conn.end(() => {
              done(new Error('must have thrown error !'));
            });
          }
          assert.equal(err.errno, 1146);
          assert.equal(err.code, 'ER_NO_SUCH_TABLE');
          assert.equal(err.sqlState, '42S02');
          assert.isTrue(err.message.includes(" doesn't exist"));
          assert.isTrue(err.message.includes('sql: INSERT INTO simpleBatchErrorMsg values (1, ?, 2, ?, 3)'));
          conn.end(() => {
            done();
          });
        }
      );
    });
  };

  const simpleBatchErrorSplit = (useCompression, useBulk, timezone, done) => {
    const conn = base.createCallbackConnection({
      compress: useCompression,
      bulk: useBulk,
      timezone: timezone
    });
    conn.connect(function (err) {
      if (err) return done(err);
      conn.query('DROP TABLE IF EXISTS simpleBatch');
      conn.query(
        'CREATE TABLE simpleBatch(id int, id2 boolean, id3 int, t varchar(8), d datetime, d2 datetime(6), g POINT, id4 int) CHARSET utf8mb4'
      );
      conn.query('FLUSH TABLES', (err) => {
        conn.beginTransaction(() => {
          conn.batch(
            'INSERT INTO `simpleBatch` values (1, ?, 2, ?, ?, ?, ?, 3)',
            [
              [
                true,
                'john',
                new Date('2001-12-31 23:59:58'),
                new Date('2018-01-01 12:30:20.456789'),
                {
                  type: 'Point',
                  coordinates: [10, 10]
                }
              ],
              [
                false,
                '12345678901',
                null,
                new Date('2018-01-21 11:30:20.123456'),
                {
                  type: 'Point',
                  coordinates: [10, 20]
                }
              ],
              [
                0,
                null,
                new Date('2020-12-31 23:59:59'),
                new Date('2018-01-21 11:30:20.123456'),
                {
                  type: 'Point',
                  coordinates: [20, 20]
                }
              ]
            ],
            (err, res) => {
              if (err) {
                assert.isTrue(err.message.includes("Data too long for column 't' at row "), err.message);
                conn.query('DROP TABLE simpleBatch', (err, res) => {
                  conn.end(() => {
                    done();
                  });
                });
              } else {
                conn.end(() => {
                  if (
                    (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 2, 0)) ||
                    (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(5, 7, 0))
                  ) {
                    //field truncated must have thrown error
                    done(new Error('must have throw error !'));
                  } else {
                    done();
                  }
                });
              }
            }
          );
        });

        conn.query({ sql: 'select 1', bigIntAsNumber: true }, (err, rows) => {
          if (err) {
            return conn.end(() => {
              done(err);
            });
          }
          assert.deepEqual(rows, [{ 1: 1 }]);
        });
      });
    });
  };

  const nonRewritableBatch = (useCompression, useBulk, done) => {
    const conn = base.createCallbackConnection({
      compress: useCompression,
      bulk: useBulk
    });

    conn.connect(function (err) {
      if (err) return done(err);
      conn.query('DROP TABLE IF EXISTS nonRewritableBatch');
      conn.query('CREATE TABLE nonRewritableBatch(id int, t varchar(256))');
      conn.beginTransaction();
      conn.batch(
        'INSERT INTO nonRewritableBatch(id, t) VALUES (?,?)',
        [
          [1, 'john'],
          [2, 'jack']
        ],
        (err, res) => {
          if (err) {
            conn.end();
            done(err);
          } else {
            conn.query('SELECT * from nonRewritableBatch', (err, res) => {
              assert.deepEqual(res, [
                {
                  id: 1,
                  t: 'john'
                },
                {
                  id: 2,
                  t: 'jack'
                }
              ]);
              conn.commit((err, res) => {
                conn.end();
                done();
              });
            });
          }
        }
      );
    });
  };

  const bigBatchError = (useCompression, useBulk, done) => {
    const conn = base.createCallbackConnection({
      compress: useCompression,
      bulk: useBulk
    });
    conn.connect(function (err) {
      if (err) return done(err);
      const values = [];
      for (let i = 0; i < 1000000; i++) {
        values.push([i, 'abcdefghijkflmnopqrtuvwxyz🤘💪']);
      }
      conn.batch('INSERT INTO `bigBatchError` values (1, ?, 2, ?, 3)', values, (err, res) => {
        if (!err) {
          conn.end(() => {
            done(new Error('must have thrown error !'));
          });
        } else {
          conn.query({ sql: 'select 1', bigIntAsNumber: true }, (err, rows) => {
            if (err) {
              return conn.end(() => {
                done(err);
              });
            }
            assert.deepEqual(rows, [{ 1: 1 }]);
            return conn.end(() => {
              done();
            });
          });
        }
      });
    });
  };

  const batchWithStream = (useCompression, useBulk, done) => {
    const stream1 = fs.createReadStream(fileName);
    const stream2 = fs.createReadStream(fileName);
    const conn = base.createCallbackConnection({
      compress: useCompression,
      bulk: useBulk
    });
    conn.connect(function (err) {
      if (err) return done(err);
      conn.query('DROP TABLE IF EXISTS batchWithStream');
      conn.query(
        'CREATE TABLE batchWithStream(id int, id2 int, id3 int, t varchar(128), id4 int, id5 int) CHARSET utf8mb4'
      );
      conn.query('FLUSH TABLES', (err) => {
        conn.beginTransaction(() => {
          conn.batch(
            'INSERT INTO `batchWithStream` values (1, ?, 2, ?, ?, 3)',
            [
              [1, stream1, 99],
              [2, stream2, 98]
            ],
            (err, res) => {
              if (err) {
                return conn.end(() => {
                  done(err);
                });
              }
              assert.deepEqual(res, [
                {
                  affectedRows: 1,
                  insertId: 0n,
                  warningStatus: 0
                },
                {
                  affectedRows: 1,
                  insertId: 0n,
                  warningStatus: 0
                }
              ]);
              conn.query('select * from `batchWithStream`', (err, res) => {
                if (err) {
                  return conn.end(() => {
                    done(err);
                  });
                }
                assert.deepEqual(res, [
                  {
                    id: 1,
                    id2: 1,
                    id3: 2,
                    t: 'abcdefghijkflmnopqrtuvwxyz🤘💪',
                    id4: 99,
                    id5: 3
                  },
                  {
                    id: 1,
                    id2: 2,
                    id3: 2,
                    t: 'abcdefghijkflmnopqrtuvwxyz🤘💪',
                    id4: 98,
                    id5: 3
                  }
                ]);
                conn.query('DROP TABLE batchWithStream');
                conn.end(() => {
                  done();
                });
              });
            }
          );
        });
      });
    });
  };

  const batchErrorWithStream = (useCompression, useBulk, done) => {
    const stream1 = fs.createReadStream(fileName);
    const stream2 = fs.createReadStream(fileName);
    const conn = base.createCallbackConnection({
      compress: useCompression,
      bulk: useBulk
    });
    conn.connect(function (err) {
      if (err) return done(err);
      conn.batch(
        'INSERT INTO batchErrorWithStream values (1, ?, 2, ?, ?, 3)',
        [
          [1, stream1, 99],
          [2, stream2, 98]
        ],
        (err) => {
          if (!err) {
            return conn.end(() => {
              done(new Error('must have thrown error !'));
            });
          }
          assert.equal(err.errno, 1146);
          assert.equal(err.code, 'ER_NO_SUCH_TABLE');
          assert.isTrue(err.message.includes(" doesn't exist"));
          assert.isTrue(err.message.includes('sql: INSERT INTO batchErrorWithStream values (1, ?, 2, ?, ?, 3)'));
          assert.equal(err.sqlState, '42S02');
          conn.end(() => {
            done();
          });
        }
      );
    });
  };

  const simpleNamedPlaceHolders = (useBulk, done) => {
    const conn = base.createCallbackConnection({
      namedPlaceholders: true,
      bulk: useBulk
    });
    conn.connect(function (err) {
      if (err) return done(err);
      conn.query('DROP TABLE IF EXISTS simpleNamedPlaceHolders');
      conn.query(
        'CREATE TABLE simpleNamedPlaceHolders(id int, id2 int, id3 int, t varchar(128), id4 int) CHARSET utf8mb4'
      );
      conn.query('FLUSH TABLES', (err) => {
        conn.beginTransaction(() => {
          conn.batch(
            'INSERT INTO `simpleNamedPlaceHolders` values (1, :param_1, 2, :param_2, 3)',
            [
              { param_1: 1, param_2: 'john' },
              { param_1: 2, param_2: 'jack' }
            ],
            (err, res) => {
              if (err) {
                return conn.end(() => {
                  done(err);
                });
              }
              if (res.affectedRows) {
                assert.equal(res.affectedRows, 2);
              } else {
                assert.deepEqual(res, [
                  {
                    affectedRows: 1,
                    insertId: 0n,
                    warningStatus: 0
                  },
                  {
                    affectedRows: 1,
                    insertId: 0n,
                    warningStatus: 0
                  }
                ]);
              }

              conn.query('select * from `simpleNamedPlaceHolders`', (err, res) => {
                if (err) {
                  return conn.end(() => {
                    done(err);
                  });
                }
                assert.deepEqual(res, [
                  {
                    id: 1,
                    id2: 1,
                    id3: 2,
                    t: 'john',
                    id4: 3
                  },
                  {
                    id: 1,
                    id2: 2,
                    id3: 2,
                    t: 'jack',
                    id4: 3
                  }
                ]);
                conn.query('DROP TABLE simpleNamedPlaceHolders', () => {
                  return conn.end(() => {
                    done();
                  });
                });
              });
            }
          );
        });
      });
    });
  };

  const simpleNamedPlaceHoldersErr = (useBulk, done) => {
    const conn = base.createCallbackConnection({
      namedPlaceholders: true,
      bulk: useBulk
    });
    conn.connect(function (err) {
      if (err) return done(err);
      conn.batch(
        'INSERT INTO blabla values (1, :param_1, 2, :param_2, 3)',
        [
          { param_1: 1, param_2: 'john' },
          { param_1: 2, param_2: 'jack' }
        ],
        (err) => {
          if (!err) {
            return conn.end(() => {
              done(new Error('must have thrown error !'));
            });
          }
          assert.equal(err.errno, 1146);
          assert.equal(err.code, 'ER_NO_SUCH_TABLE');
          assert.isTrue(err.message.includes(" doesn't exist"));
          assert.isTrue(err.message.includes('sql: INSERT INTO blabla values (1, ?, 2, ?, 3)'));
          assert.equal(err.sqlState, '42S02');
          conn.end(() => {
            done();
          });
        }
      );
    });
  };

  const nonRewritableHoldersErr = (useBulk, done) => {
    const conn = base.createCallbackConnection({
      namedPlaceholders: true,
      bulk: useBulk
    });
    conn.connect(function (err) {
      if (err) return done(err);

      conn.query('DROP TABLE IF EXISTS nonRewritableHoldersErr');
      conn.query('CREATE TABLE nonRewritableHoldersErr(id int, t varchar(256))');
      conn.beginTransaction(() => {
        conn.batch(
          'INSERT INTO nonRewritableHoldersErr(id, t) VALUES (:id2,:id1)',
          [
            { id2: 1, id1: 'john' },
            { id1: 'jack', id2: 2 }
          ],
          (err, res) => {
            if (err) {
              conn.end();
              done(err);
            } else {
              conn.query('SELECT * FROM nonRewritableHoldersErr', (err, res) => {
                assert.deepEqual(res, [
                  {
                    id: 1,
                    t: 'john'
                  },
                  {
                    id: 2,
                    t: 'jack'
                  }
                ]);
                conn.end();
                done();
              });
            }
          }
        );
      });
    });
  };

  const streamNamedPlaceHolders = (useBulk, done) => {
    const stream1 = fs.createReadStream(fileName);
    const stream2 = fs.createReadStream(fileName);
    const conn = base.createCallbackConnection({
      namedPlaceholders: true,
      bulk: useBulk
    });
    conn.connect(function (err) {
      if (err) return done(err);

      conn.query('DROP TABLE IF EXISTS streamNamedPlaceHolders');
      conn.query(
        'CREATE TABLE streamNamedPlaceHolders(id int, id2 int, id3 int, t varchar(128), id4 int, id5 int) CHARSET utf8mb4'
      );
      conn.query('FLUSH TABLES', (err) => {
        conn.beginTransaction(() => {
          conn.batch(
            'INSERT INTO `streamNamedPlaceHolders` values (1, :id1, 2, :id3, :id4, 3)',
            [
              { id1: 1, id3: stream1, id4: null, id5: 6 },
              { id1: 2, id3: stream2, id4: null }
            ],
            (err, res) => {
              if (err) {
                conn.end();
                return done(err);
              }
              assert.deepEqual(res, [
                {
                  affectedRows: 1,
                  insertId: 0n,
                  warningStatus: 0
                },
                {
                  affectedRows: 1,
                  insertId: 0n,
                  warningStatus: 0
                }
              ]);
              conn.query('select * from `streamNamedPlaceHolders`', (err, res) => {
                if (err) {
                  conn.end();
                  return done(err);
                }
                assert.deepEqual(res, [
                  {
                    id: 1,
                    id2: 1,
                    id3: 2,
                    t: 'abcdefghijkflmnopqrtuvwxyz🤘💪',
                    id4: null,
                    id5: 3
                  },
                  {
                    id: 1,
                    id2: 2,
                    id3: 2,
                    t: 'abcdefghijkflmnopqrtuvwxyz🤘💪',
                    id4: null,
                    id5: 3
                  }
                ]);
                conn.query('DROP TABLE streamNamedPlaceHolders');
                conn.end(() => {
                  done();
                });
              });
            }
          );
        });
      });
    });
  };

  const streamErrorNamedPlaceHolders = (useBulk, done) => {
    const stream1 = fs.createReadStream(fileName);
    const stream2 = fs.createReadStream(fileName);
    const conn = base.createCallbackConnection({
      namedPlaceholders: true,
      bulk: useBulk
    });
    conn.connect(function (err) {
      if (err) return done(err);

      conn.batch(
        'INSERT INTO blabla values (1, :id1, 2, :id3, :id4, 3)',
        [
          { id1: 1, id3: stream1, id4: null, id5: 6 },
          { id1: 2, id3: stream2, id4: null }
        ],
        (err) => {
          if (!err) {
            conn.end();
            return done(new Error('must have thrown error !'));
          }
          assert.equal(err.errno, 1146);
          assert.equal(err.code, 'ER_NO_SUCH_TABLE');
          assert.equal(err.sqlState, '42S02');
          assert.isTrue(err.message.includes(" doesn't exist"));
          assert.isTrue(err.message.includes('sql: INSERT INTO blabla values (1, ?, 2, ?, ?, 3)'));
          conn.end();
          done();
        }
      );
    });
  };

  describe('standard question mark using bulk', () => {
    const useCompression = false;
    it('simple batch, local date', function (done) {
      // https://jira.mariadb.org/browse/XPT-12
      if (!base.utf8Collation()) this.skip();
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      simpleBatch(useCompression, true, 'local', done);
    });

    it('simple batch with option', function (done) {
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      simpleBatchWithOptions(useCompression, true, done);
    });

    it('batch without parameter', function (done) {
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      base.createConnection({ compress: useCompression, bulk: true }).then((conn) => {
        conn
          .batch('INSERT INTO `blabla` values (?)')
          .then((res) => {
            conn.end();
            done(new Error('expect an error !'));
          })
          .catch((err) => {
            assert.isTrue(err.message.includes('Batch must have values set'), err.message);
            conn.end();
            done();
          });
      });
    });

    it('batch with undefined parameter', async function () {
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      const conn = await base.createConnection({ compress: useCompression, bulk: true });
      conn.query('DROP TABLE IF EXISTS blabla');
      conn.query('CREATE TABLE blabla(i int, i2 int)');
      conn.beginTransaction();
      await conn.batch('INSERT INTO `blabla` values (?, ?)', [
        [1, 2],
        [1, undefined]
      ]);
      const rows = await conn.query('SELECT * from blabla');
      assert.deepEqual(rows, [
        { i: 1, i2: 2 },
        { i: 1, i2: null }
      ]);
      conn.query('DROP TABLE IF EXISTS blabla');
      conn.commit();
      conn.end();
    });

    it('simple batch offset date', function (done) {
      if (!base.utf8Collation()) this.skip();
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      simpleBatch(useCompression, true, timezoneParam, done);
    });

    it('simple batch encoding CP1251', function (done) {
      simpleBatchEncodingCP1251(useCompression, true, 'local', done);
    });

    it('simple batch error message ', function (done) {
      simpleBatchErrorMsg(useCompression, true, done);
    });

    it('simple batch error message packet split', function (done) {
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      simpleBatchErrorSplit(useCompression, true, 'local', done);
    });

    it('non rewritable batch', function (done) {
      if (!supportBulk) this.skip();
      nonRewritableBatch(useCompression, true, done);
    });

    it('16M+ error batch', function (done) {
      if (maxAllowedSize <= testSize) this.skip();
      this.timeout(360000);
      bigBatchError(useCompression, true, done);
    });

    it('batch with streams', function (done) {
      if (!base.utf8Collation()) this.skip();
      batchWithStream(useCompression, true, done);
    });

    it('batch error with streams', function (done) {
      batchErrorWithStream(useCompression, true, done);
    });
  });

  describe('standard question mark and compress with bulk', function () {
    const useCompression = true;

    it('simple batch, local date', function (done) {
      if (!base.utf8Collation()) this.skip();
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      simpleBatch(useCompression, true, 'local', done);
    });

    it('simple batch offset date', function (done) {
      if (!base.utf8Collation()) this.skip();
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      simpleBatch(useCompression, true, timezoneParam, done);
    });

    it('simple batch error message ', function (done) {
      simpleBatchErrorMsg(useCompression, true, done);
    });

    it('non rewritable batch', function (done) {
      if (!supportBulk) this.skip();
      nonRewritableBatch(useCompression, true, done);
    });

    it('16M+ error batch', function (done) {
      if (maxAllowedSize <= testSize) this.skip();
      this.timeout(360000);
      bigBatchError(useCompression, true, done);
    });

    it('batch with streams', function (done) {
      if (!base.utf8Collation()) this.skip();
      batchWithStream(useCompression, true, done);
    });

    it('batch error with streams', function (done) {
      batchErrorWithStream(useCompression, true, done);
    });
  });

  describe('standard question mark without bulk', () => {
    const useCompression = false;

    it('immediate batch after callback with bulk', function (done) {
      parameterError(true, done);
    });

    it('immediate batch after callback without bulk', function (done) {
      parameterError(false, done);
    });

    function parameterError(bulk, done) {
      let conn = base.createCallbackConnection({ bulk: bulk });
      conn.query('DROP TABLE IF EXISTS contacts');
      conn.query(
        'CREATE TABLE contacts(' +
          'first_name varchar(128), ' +
          'last_name varchar(128), ' +
          'email varchar(128)) CHARSET utf8mb4'
      );
      conn.batch(
        'INSERT INTO contacts(first_name, last_name, email) VALUES(?, ?, ?)',
        ['John', 'Smith'],
        (err, res, meta) => {
          conn.query('DROP TABLE IF EXISTS contacts');
          conn.end();
          if (err) {
            if (
              err.message.includes('Expect 3 parameters, but at index 0, parameters only contains 2') ||
              err.message.includes('Parameter at position 2 is not set')
            ) {
              done();
            } else done(err);
          } else {
            done(new Error('Must have throw error'));
          }
        }
      );
    }
    it('simple batch, local date', function (done) {
      if (!base.utf8Collation()) this.skip();
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      simpleBatch(useCompression, false, 'local', done);
    });

    it('batch without parameter', function (done) {
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      const conn = base.createCallbackConnection({ compress: useCompression, bulk: false });
      conn.batch('INSERT INTO `blabla` values (?)', (err, rows) => {
        conn.end();
        if (err) {
          assert.isTrue(err.message.includes('Batch must have values set'), err.message);
          done();
        } else {
          done('must have thrown an exception');
        }
      });
    });

    it('batch with erroneous parameter', function (done) {
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      const conn = base.createCallbackConnection({ compress: useCompression, bulk: true });
      conn.query('DROP TABLE IF EXISTS blabla');
      conn.query('CREATE TABLE blabla(i int, i2 int)');
      conn.batch('INSERT INTO `blabla` values (?,?)', [[1, 2], [1]], (err, rows) => {
        if (err) {
          assert.isTrue(err.message.includes('Parameter at position 1 is not set'), err.message);
          conn.query('DROP TABLE IF EXISTS blabla', (err) => {
            conn.end();
            done();
          });
        } else {
          done('must have thrown error');
        }
      });
    });

    it('batch with undefined parameter', function (done) {
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();

      const conn = base.createCallbackConnection({ compress: useCompression, bulk: true });
      conn.query('DROP TABLE IF EXISTS blabla');
      conn.query('CREATE TABLE blabla(i int, i2 int)');
      conn.beginTransaction(() => {
        conn.batch(
          'INSERT INTO `blabla` values (?,?)',
          [
            [1, 2],
            [1, undefined]
          ],
          (err, res) => {
            conn.query('SELECT * from blabla', (err, rows) => {
              if (err) {
                done(err);
              } else {
                assert.deepEqual(rows, [
                  { i: 1, i2: 2 },
                  { i: 1, i2: null }
                ]);
                conn.query('DROP TABLE IF EXISTS blabla', (err) => {
                  conn.end();
                  done();
                });
              }
            });
          }
        );
      });
    });

    it('simple batch offset date', function (done) {
      if (!base.utf8Collation()) this.skip();
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      simpleBatch(useCompression, false, timezoneParam, done);
    });

    it('simple batch error message ', function (done) {
      simpleBatchErrorMsg(useCompression, false, done);
    });

    it('non rewritable batch', function (done) {
      nonRewritableBatch(useCompression, false, done);
    });

    it('batch with streams', function (done) {
      if (!base.utf8Collation()) this.skip();
      batchWithStream(useCompression, false, done);
    });

    it('batch error with streams', function (done) {
      batchErrorWithStream(useCompression, false, done);
    });
  });

  describe('standard question mark and compress without bulk', () => {
    const useCompression = true;

    it('simple batch, local date', function (done) {
      if (!base.utf8Collation()) this.skip();
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      simpleBatch(useCompression, false, 'local', done);
    });

    it('simple batch offset date', function (done) {
      if (!base.utf8Collation()) this.skip();
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      simpleBatch(useCompression, false, timezoneParam, done);
    });

    it('simple batch error message ', function (done) {
      simpleBatchErrorMsg(useCompression, false, done);
    });

    it('non rewritable batch', function (done) {
      nonRewritableBatch(useCompression, false, done);
    });

    it('batch with streams', function (done) {
      if (!base.utf8Collation()) this.skip();
      batchWithStream(useCompression, false, done);
    });

    it('batch error with streams', function (done) {
      batchErrorWithStream(useCompression, false, done);
    });
  });

  describe('named parameter with bulk', () => {
    it('simple batch', function (done) {
      simpleNamedPlaceHolders(true, done);
    });

    it('simple batch error', function (done) {
      simpleNamedPlaceHoldersErr(true, done);
    });

    it('non rewritable batch', function (done) {
      if (!supportBulk) this.skip();
      nonRewritableHoldersErr(true, done);
    });

    it('batch with streams', function (done) {
      if (!base.utf8Collation()) this.skip();
      streamNamedPlaceHolders(true, done);
    });

    it('batch error with streams', function (done) {
      streamErrorNamedPlaceHolders(true, done);
    });
  });

  describe('named parameter without bulk', () => {
    it('simple batch', function (done) {
      simpleNamedPlaceHolders(false, done);
    });

    it('simple batch error', function (done) {
      simpleNamedPlaceHoldersErr(false, done);
    });

    it('non rewritable batch', function (done) {
      nonRewritableHoldersErr(false, done);
    });

    it('batch with streams', function (done) {
      if (!base.utf8Collation()) this.skip();
      streamNamedPlaceHolders(false, done);
    });
  });
});
