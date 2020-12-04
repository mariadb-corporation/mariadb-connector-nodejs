'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const Capabilities = require('../../lib/const/capabilities');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Conf = require('../conf');
describe('batch callback', () => {
  const fileName = path.join(os.tmpdir(), Math.random() + 'tempBatchFile.txt');
  const testSize = 16 * 1024 * 1024 + 800; // more than one packet

  let maxAllowedSize, bigBuf, timezoneParam;
  let supportBulk;
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
        maxAllowedSize = row[0].t;
        if (testSize < maxAllowedSize) {
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

      const timeout = setTimeout(() => {
        console.log(conn.info.getLastPackets());
      }, 25000);

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
          'INSERT INTO `simpleBatch` values (1, ?, 2, ?, ?, ?, ?, 3)',
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
                clearTimeout(timeout);
                conn.end(() => {
                  done();
                });
              });
            });
          }
        );
      });
      conn.query('select 1', (err, rows) => {
        if (err) return done(err);
        assert.deepEqual(rows, [{ 1: 1 }]);
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
      const timeout = setTimeout(() => {
        console.log(conn.info.getLastPackets());
      }, 25000);

      conn.query('DROP TABLE IF EXISTS simpleBatchWithOptions');
      conn.query('CREATE TABLE simpleBatchWithOptions(id int, d datetime)');
      conn.query('FLUSH TABLES');
      conn.beginTransaction(() => {
        const f = {};
        f.toSqlString = () => {
          return 'blabla';
        };
        conn.batch(
          {
            sql: 'INSERT INTO `simpleBatchWithOptions` values (?, ?)',
            maxAllowedPacket: 1048576
          },
          [
            [1, new Date('2001-12-31 23:59:58')],
            [2, new Date('2001-12-31 23:59:58')]
          ],
          (err, res) => {
            if (err) {
              return conn.end(() => {
                done(err);
              });
            }

            assert.equal(res.affectedRows, 2);
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
                clearTimeout(timeout);
                conn.end(() => {
                  done();
                });
              });
            });
          }
        );
      });

      conn.query('select 1', (err, rows) => {
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
      const timeout = setTimeout(() => {
        console.log(conn.info.getLastPackets());
      }, 25000);

      conn.query('DROP TABLE IF EXISTS simpleBatchCP1251');
      conn.query('CREATE TABLE simpleBatchCP1251(t varchar(128), id int) CHARSET utf8mb4');
      conn.query('FLUSH TABLES');
      conn.beginTransaction(() => {
        conn.batch(
          'INSERT INTO `simpleBatchCP1251` values (?, ?)',
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
                clearTimeout(timeout);
                conn.end(() => {
                  done();
                });
              });
            });
          }
        );
      });

      conn.query('select 2', (err, rows) => {
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
      const timeout = setTimeout(() => {
        console.log(conn.info.getLastPackets());
      }, 25000);
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
          assert.isTrue(err != null);
          assert.isTrue(err.message.includes(" doesn't exist"));
          assert.isTrue(
            err.message.includes(
              "INSERT INTO simpleBatchErrorMsg values (1, ?, 2, ?, 3) - parameters:[[1,'john'],[2,'jack']]"
            )
          );
          assert.equal(err.errno, 1146);
          assert.equal(err.sqlState, '42S02');
          assert.equal(err.code, 'ER_NO_SUCH_TABLE');
          clearTimeout(timeout);
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
      const timeout = setTimeout(() => {
        console.log(conn.info.getLastPackets());
      }, 25000);

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
                assert.isTrue(
                  err.message.includes("Data too long for column 't' at row 2"),
                  err.message
                );
                conn.query('DROP TABLE simpleBatch', (err, res) => {
                  clearTimeout(timeout);
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

        conn.query('select 1', (err, rows) => {
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
      const timeout = setTimeout(() => {
        console.log(conn.info.getLastPackets());
      }, 25000);
      conn.batch(
        'SELECT ? as id, ? as t',
        [
          [1, 'john'],
          [2, 'jack']
        ],
        (err, res) => {
          conn.end(() => {
            clearTimeout(timeout);
            if (err) {
              if (useBulk & conn.info.isMariaDB() && conn.info.hasMinVersion(10, 2, 7)) {
                assert.isTrue(
                  err.message.includes(
                    'This command is not supported in the prepared statement protocol yet'
                  ),
                  err.message
                );
                done();
              } else {
                done(err);
              }
            } else {
              if (useBulk && conn.info.isMariaDB() && conn.info.hasMinVersion(10, 2, 7)) {
                done(new Error('Must have thrown an error'));
              } else {
                assert.deepEqual(res, [
                  [
                    {
                      id: 1,
                      t: 'john'
                    }
                  ],
                  [
                    {
                      id: 2,
                      t: 'jack'
                    }
                  ]
                ]);
                done();
              }
            }
          });
        }
      );
    });
  };

  const bigBatchError = (useCompression, useBulk, done) => {
    const conn = base.createCallbackConnection({
      compress: useCompression,
      bulk: useBulk,
      logPackets: true
    });
    conn.connect(function (err) {
      if (err) return done(err);
      const timeout = setTimeout(() => {
        console.log(conn.info.getLastPackets());
      }, 200000);
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
          conn.query('select 1', (err, rows) => {
            if (err) {
              return conn.end(() => {
                done(err);
              });
            }
            assert.deepEqual(rows, [{ 1: 1 }]);
            clearTimeout(timeout);
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
      bulk: useBulk,
      logPackets: true
    });
    conn.connect(function (err) {
      if (err) return done(err);
      const timeout = setTimeout(() => {
        console.log(conn.info.getLastPackets());
      }, 25000);
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
              assert.equal(res.affectedRows, 2);
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
                clearTimeout(timeout);
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
      bulk: useBulk,
      logPackets: true
    });
    conn.connect(function (err) {
      if (err) return done(err);
      const timeout = setTimeout(() => {
        console.log(conn.info.getLastPackets());
      }, 25000);
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
          assert.isTrue(err != null);
          assert.isTrue(err.message.includes(" doesn't exist"));
          assert.isTrue(
            err.message.includes(
              'sql: INSERT INTO batchErrorWithStream values (1, ?, 2, ?, ?, 3) - parameters:[[1,[object Object],99],[2,[object Object],98]]'
            )
          );
          assert.equal(err.errno, 1146);
          assert.equal(err.sqlState, '42S02');
          assert.equal(err.code, 'ER_NO_SUCH_TABLE');
          clearTimeout(timeout);
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
      bulk: useBulk,
      logPackets: true
    });
    conn.connect(function (err) {
      if (err) return done(err);
      const timeout = setTimeout(() => {
        console.log(conn.info.getLastPackets());
      }, 25000);
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
              assert.equal(res.affectedRows, 2);
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
                  clearTimeout(timeout);
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
      bulk: useBulk,
      logPackets: true
    });
    conn.connect(function (err) {
      if (err) return done(err);
      const timeout = setTimeout(() => {
        console.log(conn.info.getLastPackets());
      }, 25000);
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
          assert.isTrue(err != null);
          assert.isTrue(err.message.includes(" doesn't exist"));
          assert.isTrue(
            err.message.includes(
              "sql: INSERT INTO blabla values (1, :param_1, 2, :param_2, 3) - parameters:[{'param_1':1,'param_2':'john'},{'param_1':2,'param_2':'jack'}]"
            )
          );
          assert.equal(err.errno, 1146);
          assert.equal(err.sqlState, '42S02');
          assert.equal(err.code, 'ER_NO_SUCH_TABLE');
          clearTimeout(timeout);
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
      bulk: useBulk,
      logPackets: true
    });
    conn.connect(function (err) {
      if (err) return done(err);
      const timeout = setTimeout(() => {
        console.log(conn.info.getLastPackets());
      }, 25000);
      conn.batch(
        'SELECT :id2 as id, :id1 as t',
        [
          { id2: 1, id1: 'john' },
          { id1: 'jack', id2: 2 }
        ],
        (err, res) => {
          if (err) {
            conn.end();
            if (useBulk & conn.info.isMariaDB() && conn.info.hasMinVersion(10, 2, 7)) {
              assert.isTrue(
                err.message.includes(
                  'This command is not supported in the prepared statement protocol yet'
                )
              );
              clearTimeout(timeout);
              done();
            } else {
              done(err);
            }
          } else {
            conn.end();
            if (useBulk & conn.info.isMariaDB() && conn.info.hasMinVersion(10, 2, 7)) {
              done(new Error('Must have thrown an exception'));
            } else {
              assert.deepEqual(res, [
                [
                  {
                    id: 1,
                    t: 'john'
                  }
                ],
                [
                  {
                    id: 2,
                    t: 'jack'
                  }
                ]
              ]);
              clearTimeout(timeout);
              done();
            }
          }
        }
      );
    });
  };

  const streamNamedPlaceHolders = (useBulk, done) => {
    const stream1 = fs.createReadStream(fileName);
    const stream2 = fs.createReadStream(fileName);
    const conn = base.createCallbackConnection({
      namedPlaceholders: true,
      bulk: useBulk,
      logPackets: true
    });
    conn.connect(function (err) {
      if (err) return done(err);
      const timeout = setTimeout(() => {
        console.log(conn.info.getLastPackets());
      }, 25000);
      conn.query('DROP TABLE IF EXISTS streamNamedPlaceHolders');
      conn.query(
        'CREATE TABLE streamNamedPlaceHolders(id int, id2 int, id3 int, t varchar(128), id4 int, id5 int) CHARSET utf8mb4'
      );
      conn.query('FLUSH TABLES', (err) => {
        conn.beginTransaction(() => {
          conn.batch(
            'INSERT INTO `streamNamedPlaceHolders` values (1, :id1, 2, :id3, :id7, 3)',
            [
              { id1: 1, id3: stream1, id4: 99, id5: 6 },
              { id1: 2, id3: stream2, id4: 98 }
            ],
            (err, res) => {
              if (err) {
                conn.end();
                return done(err);
              }
              assert.equal(res.affectedRows, 2);
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
                clearTimeout(timeout);
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
      bulk: useBulk,
      logPackets: true
    });
    conn.connect(function (err) {
      if (err) return done(err);
      const timeout = setTimeout(() => {
        console.log(conn.info.getLastPackets());
      }, 25000);
      conn.batch(
        'INSERT INTO blabla values (1, :id1, 2, :id3, :id7, 3)',
        [
          { id1: 1, id3: stream1, id4: 99, id5: 6 },
          { id1: 2, id3: stream2, id4: 98 }
        ],
        (err) => {
          if (!err) {
            conn.end();
            done(new Error('must have thrown error !'));
          }
          assert.isTrue(err != null);
          assert.isTrue(err.message.includes(" doesn't exist"));
          assert.isTrue(
            err.message.includes(
              "sql: INSERT INTO blabla values (1, :id1, 2, :id3, :id7, 3) - parameters:[{'id1':1,'id3':[object Object],'id4':99,'id5':6},{'id1':2,'id3':[object Object],'id4':98}]"
            )
          );
          assert.equal(err.errno, 1146);
          assert.equal(err.sqlState, '42S02');
          assert.equal(err.code, 'ER_NO_SUCH_TABLE');
          clearTimeout(timeout);
          conn.end();
          done();
        }
      );
    });
  };

  describe('standard question mark using bulk', () => {
    const useCompression = false;
    it('simple batch, local date', function (done) {
      if (!base.utf8Collation()) this.skip();
      this.timeout(30000);
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      simpleBatch(useCompression, true, 'local', done);
    });

    it('simple batch with option', function (done) {
      this.timeout(30000);
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

    it('batch with erroneous parameter', function (done) {
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      base.createConnection({ compress: useCompression, bulk: true }).then((conn) => {
        conn
          .batch('INSERT INTO `blabla` values (?, ?)', [
            [1, 2],
            [1, undefined]
          ])
          .then((res) => {
            conn.end();
            done(new Error('expect an error !'));
          })
          .catch((err) => {
            assert.isTrue(
              err.message.includes('Parameter at position 2 is undefined for values 1', err.message)
            );
            conn.end();
            done();
          });
      });
    });

    it('simple batch offset date', function (done) {
      if (!base.utf8Collation()) this.skip();
      this.timeout(30000);
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      simpleBatch(useCompression, true, timezoneParam, done);
    });

    it('simple batch encoding CP1251', function (done) {
      this.timeout(30000);
      simpleBatchEncodingCP1251(useCompression, true, 'local', done);
    });

    it('simple batch error message ', function (done) {
      if (process.env.SKYSQL_HA) {
        // due to https://jira.mariadb.org/browse/MXS-3196
        this.skip();
        return;
      }
      this.timeout(30000);
      simpleBatchErrorMsg(useCompression, true, done);
    });

    it('simple batch error message packet split', function (done) {
      this.timeout(30000);
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      simpleBatchErrorSplit(useCompression, true, 'local', done);
    });

    it('non rewritable batch', function (done) {
      if (!supportBulk) this.skip();
      this.timeout(30000);
      nonRewritableBatch(useCompression, true, done);
    });

    it('16M+ error batch', function (done) {
      if (maxAllowedSize <= testSize) this.skip();
      this.timeout(360000);
      bigBatchError(useCompression, true, done);
    });

    it('batch with streams', function (done) {
      if (!base.utf8Collation()) this.skip();
      this.timeout(30000);
      batchWithStream(useCompression, true, done);
    });

    it('batch error with streams', function (done) {
      this.timeout(30000);
      batchErrorWithStream(useCompression, true, done);
    });
  });

  describe('standard question mark and compress with bulk', () => {
    const useCompression = true;

    it('simple batch, local date', function (done) {
      if (!base.utf8Collation()) this.skip();
      this.timeout(30000);
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      simpleBatch(useCompression, true, 'local', done);
    });

    it('simple batch offset date', function (done) {
      if (!base.utf8Collation()) this.skip();
      this.timeout(30000);
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      simpleBatch(useCompression, true, timezoneParam, done);
    });

    it('simple batch error message ', function (done) {
      if (process.env.SKYSQL_HA) {
        // due to https://jira.mariadb.org/browse/MXS-3196
        this.skip();
        return;
      }
      this.timeout(30000);
      simpleBatchErrorMsg(useCompression, true, done);
    });

    it('non rewritable batch', function (done) {
      if (!supportBulk) this.skip();
      this.timeout(30000);
      nonRewritableBatch(useCompression, true, done);
    });

    it('16M+ error batch', function (done) {
      if (maxAllowedSize <= testSize) this.skip();
      this.timeout(360000);
      bigBatchError(useCompression, true, done);
    });

    it('batch with streams', function (done) {
      if (!base.utf8Collation()) this.skip();
      this.timeout(30000);
      batchWithStream(useCompression, true, done);
    });

    it('batch error with streams', function (done) {
      this.timeout(30000);
      batchErrorWithStream(useCompression, true, done);
    });
  });

  describe('standard question mark using rewrite', () => {
    const useCompression = false;

    it('immediate batch after callback', function (done) {
      let conn = base.createCallbackConnection();
      conn.batch(
        'INSERT INTO contacts(first_name, last_name, email) VALUES(?, ?, ?)',
        ['John', 'Smith', 'js@example.com'],
        (err, res, meta) => {
          conn.end();
          if (err) {
            if (err.message.includes('Parameter at position 1 is not set for values 0')) {
              done();
            } else done(err);
          } else {
            done(new Error('Must have throw error'));
          }
        }
      );
    });

    it('simple batch, local date', function (done) {
      if (!base.utf8Collation()) this.skip();
      this.timeout(30000);
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      simpleBatch(useCompression, false, 'local', done);
    });

    it('batch without parameter', function (done) {
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      base.createConnection({ compress: useCompression, bulk: false }).then((conn) => {
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

    it('batch with erroneous parameter', function (done) {
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      base.createConnection({ compress: useCompression, bulk: true }).then((conn) => {
        conn
          .batch('INSERT INTO `blabla` values (?,?)', [[1, 2], [1]])
          .then((res) => {
            conn.end();
            done(new Error('expect an error !'));
          })
          .catch((err) => {
            assert.isTrue(
              err.message.includes('Parameter at position 1 is not set for values 1'),
              err.message
            );
            conn.end();
            done();
          });
      });
    });

    it('batch with undefined parameter', function (done) {
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      base.createConnection({ compress: useCompression, bulk: true }).then((conn) => {
        conn
          .batch('INSERT INTO `blabla` values (?,?)', [
            [1, 2],
            [1, undefined]
          ])
          .then((res) => {
            conn.end();
            done(new Error('expect an error !'));
          })
          .catch((err) => {
            assert.isTrue(
              err.message.includes('Parameter at position 2 is undefined for values 1'),
              err.message
            );
            conn.end();
            done();
          });
      });
    });

    it('simple batch offset date', function (done) {
      if (!base.utf8Collation()) this.skip();
      this.timeout(30000);
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      simpleBatch(useCompression, false, timezoneParam, done);
    });

    it('simple batch error message ', function (done) {
      if (process.env.SKYSQL_HA) {
        // due to https://jira.mariadb.org/browse/MXS-3196
        this.skip();
        return;
      }
      this.timeout(30000);
      simpleBatchErrorMsg(useCompression, false, done);
    });

    it('non rewritable batch', function (done) {
      this.timeout(30000);
      nonRewritableBatch(useCompression, false, done);
    });

    it('batch with streams', function (done) {
      if (!base.utf8Collation()) this.skip();
      this.timeout(30000);
      batchWithStream(useCompression, false, done);
    });

    it('batch error with streams', function (done) {
      this.timeout(30000);
      batchErrorWithStream(useCompression, false, done);
    });
  });

  describe('standard question mark and compress with rewrite', () => {
    const useCompression = true;

    it('simple batch, local date', function (done) {
      if (!base.utf8Collation()) this.skip();
      this.timeout(30000);
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      simpleBatch(useCompression, false, 'local', done);
    });

    it('simple batch offset date', function (done) {
      if (!base.utf8Collation()) this.skip();
      this.timeout(30000);
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) this.skip();
      simpleBatch(useCompression, false, timezoneParam, done);
    });

    it('simple batch error message ', function (done) {
      if (process.env.SKYSQL_HA) {
        // due to https://jira.mariadb.org/browse/MXS-3196
        this.skip();
        return;
      }
      this.timeout(30000);
      simpleBatchErrorMsg(useCompression, false, done);
    });

    it('non rewritable batch', function (done) {
      this.timeout(30000);
      nonRewritableBatch(useCompression, false, done);
    });

    it('batch with streams', function (done) {
      if (!base.utf8Collation()) this.skip();
      this.timeout(30000);
      batchWithStream(useCompression, false, done);
    });

    it('batch error with streams', function (done) {
      this.timeout(30000);
      batchErrorWithStream(useCompression, false, done);
    });
  });

  describe('named parameter with bulk', () => {
    it('simple batch', function (done) {
      this.timeout(30000);
      simpleNamedPlaceHolders(true, done);
    });

    it('simple batch error', function (done) {
      if (process.env.SKYSQL_HA) {
        // due to https://jira.mariadb.org/browse/MXS-3196
        this.skip();
        return;
      }
      this.timeout(30000);
      simpleNamedPlaceHoldersErr(true, done);
    });

    it('non rewritable batch', function (done) {
      if (!supportBulk) this.skip();
      this.timeout(30000);
      nonRewritableHoldersErr(true, done);
    });

    it('batch with streams', function (done) {
      if (!base.utf8Collation()) this.skip();
      this.timeout(30000);
      streamNamedPlaceHolders(true, done);
    });

    it('batch error with streams', function (done) {
      this.timeout(30000);
      streamErrorNamedPlaceHolders(true, done);
    });
  });

  describe('named parameter with rewrite', () => {
    it('simple batch', function (done) {
      this.timeout(30000);
      simpleNamedPlaceHolders(false, done);
    });

    it('simple batch error', function (done) {
      if (process.env.SKYSQL_HA) {
        // due to https://jira.mariadb.org/browse/MXS-3196
        this.skip();
        return;
      }
      this.timeout(30000);
      simpleNamedPlaceHoldersErr(false, done);
    });

    it('non rewritable batch', function (done) {
      this.timeout(30000);
      nonRewritableHoldersErr(false, done);
    });

    it('batch with streams', function (done) {
      if (!base.utf8Collation()) this.skip();
      this.timeout(30000);
      streamNamedPlaceHolders(false, done);
    });
  });
});
