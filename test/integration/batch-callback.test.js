//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import * as base from '../base.js';
import * as Capabilities from '../../lib/const/capabilities';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Conf from '../conf.js';
import { assert, describe, test, beforeAll, afterAll, beforeEach } from 'vitest';
import { createConnection } from '../base.js';

describe.sequential(
  'batch callback',
  function () {
    const fileName = path.join(os.tmpdir(), Math.random() + 'tempBatchFile.txt');
    const testSize = 16 * 1024 * 1024 + 800; // more than one packet
    let maxAllowedSize, bigBuf, timezoneParam;
    let supportBulk;
    let shareConn;
    beforeAll(async () => {
      shareConn = await createConnection(Conf.baseConfig);
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

      const row = await shareConn.query('SELECT @@max_allowed_packet as t');
      maxAllowedSize = Number(row[0].t);
      if (testSize < maxAllowedSize + 100) {
        bigBuf = Buffer.alloc(testSize);
        for (let i = 0; i < testSize; i++) {
          bigBuf[i] = 97 + (i % 10);
        }
      }
      const buf = Buffer.from('abcdefghijkflmnopqrtuvwxyz🤘💪');
      fs.writeFileSync(fileName, buf, 'utf8');
    });

    afterAll(async () => {
      await shareConn.end();
      shareConn = null;
      fs.unlink(fileName, (err) => {});
    });

    beforeEach(async () => {
      //just to ensure, server does not close shared connection due to inactivity
      await shareConn.ping();
    });

    const simpleBatch = (useCompression, useBulk, timezone, resolve, reject) => {
      const conn = base.createCallbackConnection({
        compress: useCompression,
        bulk: useBulk,
        timezone: timezone
      });
      conn.connect(function (err) {
        if (err) return reject(err);
        conn.query('DROP TABLE IF EXISTS simpleBatchCall');
        conn.query(
          'CREATE TABLE simpleBatchCall(' +
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
            { sql: 'INSERT INTO `simpleBatchCall` values (1, ?, 2, ?, ?, ?, ?, 3)', fullResult: false },
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
              if (err) return reject(err);

              assert.equal(res.affectedRows, 4);
              conn.query('select * from `simpleBatchCall`', (err, res) => {
                if (err) return reject(err);
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
                conn.query('DROP TABLE simpleBatchCall', (err, res) => {
                  conn.end(() => {
                    resolve();
                  });
                });
              });
            }
          );
        });
        conn.query("select '1'", (err, rows) => {
          if (err) return reject(err);
          assert.deepEqual(rows, [{ 1: '1' }]);
        });
      });
    };

    const simpleBatchWithOptions = (useCompression, useBulk, resolve, reject) => {
      const conn = base.createCallbackConnection({
        compress: useCompression,
        bulk: useBulk
      });
      conn.connect(function (err) {
        if (err) return reject(err);
        conn.query('DROP TABLE IF EXISTS simpleBatchCallWithOptions');
        conn.query(
          'CREATE TABLE simpleBatchCallWithOptions(id INT NOT NULL AUTO_INCREMENT, d datetime, UNIQUE KEY `id` (`id`))'
        );
        conn.query('FLUSH TABLES');
        conn.beginTransaction(() => {
          const f = {};
          f.toSqlString = () => {
            return 'blabla';
          };
          conn.batch(
            {
              sql: 'INSERT INTO `simpleBatchCallWithOptions`(d) values (?)',
              maxAllowedPacket: 1048576,
              fullResult: true
            },
            [[new Date('2001-12-31 23:59:58')], [new Date('2001-12-31 23:59:58')]],
            (err, res) => {
              if (err) {
                return conn.end(() => {
                  reject(err);
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
              conn.query('select * from `simpleBatchCallWithOptions`', (err, res) => {
                if (err) return reject(err);
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
                conn.query('DROP TABLE simpleBatchCallWithOptions', (err, res) => {
                  if (err) return reject(err);
                  conn.end(() => {
                    resolve();
                  });
                });
              });
            }
          );
        });

        conn.query({ sql: 'select 1', bigIntAsNumber: true }, (err, rows) => {
          if (err) {
            return conn.end(() => {
              resolve(err);
            });
          }
          assert.deepEqual(rows, [{ 1: 1 }]);
        });
      });
    };

    const simpleBatchEncodingCP1251 = (useCompression, useBulk, timezone, resolve, reject) => {
      const conn = base.createCallbackConnection({
        compress: useCompression,
        bulk: useBulk,
        collation: 'CP1251_GENERAL_CI'
      });
      conn.connect(function (err) {
        if (err) return reject(err);
        conn.query('DROP TABLE IF EXISTS simpleBatchCallCP1251');
        conn.query('CREATE TABLE simpleBatchCallCP1251(t varchar(128), id int) CHARSET utf8mb4');
        conn.query('FLUSH TABLES');
        conn.beginTransaction(() => {
          conn.batch(
            { sql: 'INSERT INTO `simpleBatchCallCP1251` values (?, ?)', fullResult: false },
            [
              ['john', 2],
              ['©°', 3]
            ],
            (err, res) => {
              assert.equal(res.affectedRows, 2);
              conn.query('select * from `simpleBatchCallCP1251`', (err, res) => {
                if (err) {
                  return conn.end(() => {
                    reject(err);
                  });
                }
                assert.deepEqual(res, [
                  { id: 2, t: 'john' },
                  { id: 3, t: '©°' }
                ]);
                conn.query('DROP TABLE simpleBatchCallCP1251', (err, res) => {
                  if (err) return reject(err);
                  conn.end(() => {
                    resolve();
                  });
                });
              });
            }
          );
        });

        conn.query({ sql: 'select 2', bigIntAsNumber: true }, (err, rows) => {
          if (err) {
            return conn.end(() => {
              reject(err);
            });
          }
          assert.deepEqual(rows, [{ 2: 2 }]);
        });
      });
    };

    const simpleBatchErrorMsg = (compression, useBulk, resolve, reject) => {
      const conn = base.createCallbackConnection({ trace: true, bulk: useBulk });
      conn.connect(function (err) {
        if (err) return reject(err);
        conn.batch(
          'INSERT INTO simpleBatchCallErrorMsg values (1, ?, 2, ?, 3)',
          [
            [1, 'john'],
            [2, 'jack']
          ],
          (err) => {
            if (!err) {
              return conn.end(() => {
                reject(new Error('must have thrown error !'));
              });
            }
            assert.equal(err.errno, 1146);
            assert.equal(err.code, 'ER_NO_SUCH_TABLE');
            assert.equal(err.sqlState, '42S02');
            assert.isTrue(err.message.includes(" doesn't exist"));
            assert.isTrue(err.message.includes('sql: INSERT INTO simpleBatchCallErrorMsg values (1, ?, 2, ?, 3)'));
            conn.end(() => {
              resolve();
            });
          }
        );
      });
    };

    const simpleBatchErrorSplit = (useCompression, useBulk, timezone, resolve, reject) => {
      const conn = base.createCallbackConnection({
        compress: useCompression,
        bulk: useBulk,
        timezone: timezone
      });
      conn.connect(function (err) {
        if (err) return reject(err);
        conn.query('DROP TABLE IF EXISTS simpleBatchCallErrorSplit');
        conn.query(
          'CREATE TABLE simpleBatchCallErrorSplit(' +
            'id int, id2 boolean, id3 int, t varchar(8), d datetime, d2 datetime(6), ' +
            'g POINT, id4 int) CHARSET utf8mb4'
        );
        conn.query('FLUSH TABLES', (err) => {
          conn.beginTransaction(() => {
            conn.batch(
              'INSERT INTO `simpleBatchCallErrorSplit` values (1, ?, 2, ?, ?, ?, ?, 3)',
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
                  conn.query('DROP TABLE IF EXISTS simpleBatchCallErrorSplit', (err, res) => {
                    conn.end(() => {
                      resolve();
                    });
                  });
                } else {
                  conn.end(() => {
                    if (
                      (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 2, 0)) ||
                      (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(5, 7, 0))
                    ) {
                      //field truncated must have thrown error
                      reject(new Error('must have throw error !'));
                    } else {
                      resolve();
                    }
                  });
                }
              }
            );
          });

          conn.query({ sql: 'select 1', bigIntAsNumber: true }, (err, rows) => {
            if (err) {
              return conn.end(() => {
                reject(err);
              });
            }
            assert.deepEqual(rows, [{ 1: 1 }]);
          });
        });
      });
    };

    const nonRewritableBatch = (useCompression, useBulk, resolve, reject) => {
      const conn = base.createCallbackConnection({
        compress: useCompression,
        bulk: useBulk
      });

      conn.connect(function (err) {
        if (err) return reject(err);
        conn.query('DROP TABLE IF EXISTS nonRewritableCallBatch');
        conn.query('CREATE TABLE nonRewritableCallBatch(id int, t varchar(256))');
        conn.beginTransaction();
        conn.batch(
          'INSERT INTO nonRewritableCallBatch(id, t) VALUES (?,?)',
          [
            [1, 'john'],
            [2, 'jack']
          ],
          (err, res) => {
            if (err) {
              conn.end(() => reject(err));
            } else {
              conn.query('SELECT * from nonRewritableCallBatch', (err, res) => {
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
                  conn.end(resolve);
                });
              });
            }
          }
        );
      });
    };

    const bigBatchError = (useCompression, useBulk, resolve, reject) => {
      const conn = base.createCallbackConnection({
        compress: useCompression,
        bulk: useBulk
      });
      conn.connect(function (err) {
        if (err) return reject(err);
        const values = [];
        for (let i = 0; i < 1000000; i++) {
          values.push([i, 'abcdefghijkflmnopqrtuvwxyz🤘💪']);
        }
        conn.batch('INSERT INTO `bigBatchCallError` values (1, ?, 2, ?, 3)', values, (err, res) => {
          if (!err) {
            conn.end(() => {
              reject(new Error('must have thrown error !'));
            });
          } else {
            conn.query({ sql: 'select 1', bigIntAsNumber: true }, (err, rows) => {
              if (err) {
                return conn.end(() => {
                  reject(err);
                });
              }
              assert.deepEqual(rows, [{ 1: 1 }]);
              return conn.end(() => {
                resolve();
              });
            });
          }
        });
      });
    };

    const batchWithStream = (useCompression, useBulk, resolve, reject) => {
      const stream1 = fs.createReadStream(fileName);
      const stream2 = fs.createReadStream(fileName);
      const conn = base.createCallbackConnection({
        compress: useCompression,
        bulk: useBulk
      });
      conn.connect(function (err) {
        if (err) return reject(err);
        conn.query('DROP TABLE IF EXISTS batchWithCallStream');
        conn.query(
          'CREATE TABLE batchWithCallStream(id int, id2 int, id3 int, t varchar(128), id4 int, id5 int) CHARSET utf8mb4'
        );
        conn.query('FLUSH TABLES', (err) => {
          conn.beginTransaction(() => {
            conn.batch(
              'INSERT INTO `batchWithCallStream` values (1, ?, 2, ?, ?, 3)',
              [
                [1, stream1, 99],
                [2, stream2, 98]
              ],
              (err, res) => {
                if (err) {
                  return conn.end(() => {
                    reject(err);
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
                conn.query('select * from `batchWithCallStream`', (err, res) => {
                  if (err) {
                    return conn.end(() => {
                      reject(err);
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
                  conn.query('DROP TABLE batchWithCallStream');
                  conn.end(() => {
                    resolve();
                  });
                });
              }
            );
          });
        });
      });
    };

    const batchErrorWithStream = (useCompression, useBulk, resolve, reject) => {
      const stream1 = fs.createReadStream(fileName);
      const stream2 = fs.createReadStream(fileName);
      const conn = base.createCallbackConnection({
        compress: useCompression,
        bulk: useBulk
      });
      conn.connect(function (err) {
        if (err) return reject(err);
        conn.batch(
          'INSERT INTO batchErrorCallWithStream values (1, ?, 2, ?, ?, 3)',
          [
            [1, stream1, 99],
            [2, stream2, 98]
          ],
          (err) => {
            if (!err) {
              return conn.end(() => {
                reject(new Error('must have thrown error !'));
              });
            }
            assert.equal(err.errno, 1146);
            assert.equal(err.code, 'ER_NO_SUCH_TABLE');
            assert.isTrue(err.message.includes(" doesn't exist"));
            assert.isTrue(err.message.includes('sql: INSERT INTO batchErrorWithStream values (1, ?, 2, ?, ?, 3)'));
            assert.equal(err.sqlState, '42S02');
            conn.end(() => {
              resolve();
            });
          }
        );
      });
    };

    const simpleNamedPlaceHolders = (useBulk, resolve, reject) => {
      const conn = base.createCallbackConnection({
        namedPlaceholders: true,
        bulk: useBulk
      });
      conn.connect(function (err) {
        if (err) return reject(err);
        conn.query('DROP TABLE IF EXISTS simpleNamedCallPlaceHolders');
        conn.query(
          'CREATE TABLE simpleNamedCallPlaceHolders(id int, id2 int, id3 int, t varchar(128), id4 int) CHARSET utf8mb4'
        );
        conn.query('FLUSH TABLES', (err) => {
          conn.beginTransaction(() => {
            conn.batch(
              'INSERT INTO `simpleNamedCallPlaceHolders` values (1, :param_1, 2, :param_2, 3)',
              [
                { param_1: 1, param_2: 'john' },
                { param_1: 2, param_2: 'jack' }
              ],
              (err, res) => {
                if (err) {
                  return conn.end(() => {
                    reject(err);
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

                conn.query('select * from `simpleNamedCallPlaceHolders`', (err, res) => {
                  if (err) {
                    return conn.end(() => {
                      reject(err);
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
                  conn.query('DROP TABLE simpleNamedCallPlaceHolders', () => {
                    return conn.end(() => {
                      resolve();
                    });
                  });
                });
              }
            );
          });
        });
      });
    };

    const simpleNamedPlaceHoldersErr = (useBulk, resolve, reject) => {
      const conn = base.createCallbackConnection({
        namedPlaceholders: true,
        bulk: useBulk
      });
      conn.connect(function (err) {
        if (err) return reject(err);
        conn.batch(
          'INSERT INTO blablaCall values (1, :param_1, 2, :param_2, 3)',
          [
            { param_1: 1, param_2: 'john' },
            { param_1: 2, param_2: 'jack' }
          ],
          (err) => {
            if (!err) {
              return conn.end(() => {
                reject(new Error('must have thrown error !'));
              });
            }
            assert.equal(err.errno, 1146);
            assert.equal(err.code, 'ER_NO_SUCH_TABLE');
            assert.isTrue(err.message.includes(" doesn't exist"));
            assert.isTrue(err.message.includes('sql: INSERT INTO blablaCall values (1, ?, 2, ?, 3)'));
            assert.equal(err.sqlState, '42S02');
            conn.end(() => {
              resolve();
            });
          }
        );
      });
    };

    const nonRewritableHoldersErr = (useBulk, resolve, reject) => {
      const conn = base.createCallbackConnection({
        namedPlaceholders: true,
        bulk: useBulk
      });
      conn.connect(function (err) {
        if (err) return reject(err);

        conn.query('DROP TABLE IF EXISTS nonRewritableCallHoldersErr');
        conn.query('CREATE TABLE nonRewritableCallHoldersErr(id int, t varchar(256))');
        conn.beginTransaction(() => {
          conn.batch(
            'INSERT INTO nonRewritableCallHoldersErr(id, t) VALUES (:id2,:id1)',
            [
              { id2: 1, id1: 'john' },
              { id1: 'jack', id2: 2 }
            ],
            (err, res) => {
              if (err) {
                conn.end();
                reject(err);
              } else {
                conn.query('SELECT * FROM nonRewritableCallHoldersErr', (err, res) => {
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
                  conn.end(resolve);
                });
              }
            }
          );
        });
      });
    };

    const streamNamedPlaceHolders = (useBulk, resolve, reject) => {
      const stream1 = fs.createReadStream(fileName);
      const stream2 = fs.createReadStream(fileName);
      const conn = base.createCallbackConnection({
        namedPlaceholders: true,
        bulk: useBulk
      });
      conn.connect(function (err) {
        if (err) return reject(err);

        conn.query('DROP TABLE IF EXISTS streamNamedCallPlaceHolders');
        conn.query(
          'CREATE TABLE streamNamedCallPlaceHolders(id int, id2 int, id3 int, t varchar(128), id4 int, id5 int) ' +
            'CHARSET utf8mb4'
        );
        conn.query('FLUSH TABLES', (err) => {
          conn.beginTransaction(() => {
            conn.batch(
              'INSERT INTO `streamNamedCallPlaceHolders` values (1, :id1, 2, :id3, :id4, 3)',
              [
                { id1: 1, id3: stream1, id4: null, id5: 6 },
                { id1: 2, id3: stream2, id4: null }
              ],
              (err, res) => {
                if (err) {
                  conn.end();
                  return reject(err);
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
                conn.query('select * from `streamNamedCallPlaceHolders`', (err, res) => {
                  if (err) {
                    conn.end();
                    return reject(err);
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
                  conn.query('DROP TABLE streamNamedCallPlaceHolders');
                  conn.end(() => {
                    resolve();
                  });
                });
              }
            );
          });
        });
      });
    };

    const streamErrorNamedPlaceHolders = (useBulk, resolve, reject) => {
      const stream1 = fs.createReadStream(fileName);
      const stream2 = fs.createReadStream(fileName);
      const conn = base.createCallbackConnection({
        namedPlaceholders: true,
        bulk: useBulk
      });
      conn.connect(function (err) {
        if (err) return reject(err);

        conn.batch(
          'INSERT INTO blabla values (1, :id1, 2, :id3, :id4, 3)',
          [
            { id1: 1, id3: stream1, id4: null, id5: 6 },
            { id1: 2, id3: stream2, id4: null }
          ],
          (err) => {
            if (!err) {
              conn.end();
              return reject(new Error('must have thrown error !'));
            }
            assert.equal(err.errno, 1146);
            assert.equal(err.code, 'ER_NO_SUCH_TABLE');
            assert.equal(err.sqlState, '42S02');
            assert.isTrue(err.message.includes(" doesn't exist"));
            assert.isTrue(err.message.includes('sql: INSERT INTO blabla values (1, ?, 2, ?, ?, 3)'));
            conn.end(resolve);
          }
        );
      });
    };

    describe.sequential('standard question mark using bulk', () => {
      const useCompression = false;
      test('simple batch, local date', async ({ skip }) => {
        // https://jira.mariadb.org/browse/XPT-12
        if (!base.utf8Collation()) return skip();
        if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) return skip();
        await new Promise((resolve, reject) => {
          simpleBatch(useCompression, true, 'local', resolve, reject);
        });
      });

      test('simple batch with option', async ({ skip }) => {
        if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) return skip();
        await new Promise((resolve, reject) => {
          simpleBatchWithOptions(useCompression, true, resolve, reject);
        });
      });

      test('batch without parameter', async ({ skip }) => {
        if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) return skip();
        const conn = await createConnection({ compress: useCompression, bulk: true });
        try {
          await conn.batch('INSERT INTO `blabla` values (?)');
          throw new Error('expect an error !');
        } catch (err) {
          assert.isTrue(err.message.includes('Batch must have values set'), err.message);
          await conn.end();
        }
      });

      test('batch with undefined parameter', async function () {
        if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) return skip();
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
        await conn.commit();
        await conn.end();
      });

      test('simple batch offset date', async ({ skip }) => {
        if (!base.utf8Collation()) return skip();
        if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) return skip();
        await new Promise((resolve, reject) => {
          simpleBatch(useCompression, true, timezoneParam, resolve, reject);
        });
      });

      test('simple batch encoding CP1251', async ({ skip }) => {
        await new Promise((resolve, reject) => {
          simpleBatchEncodingCP1251(useCompression, true, 'local', resolve, reject);
        });
      });

      test('simple batch error message ', async ({ skip }) => {
        await new Promise((resolve, reject) => {
          simpleBatchErrorMsg(useCompression, true, resolve, reject);
        });
      });

      test('simple batch error message packet split', async ({ skip }) => {
        if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) return skip();
        await new Promise((resolve, reject) => {
          simpleBatchErrorSplit(useCompression, true, 'local', resolve, reject);
        });
      });

      test('non rewritable batch', async ({ skip }) => {
        if (!supportBulk) return skip();
        await new Promise((resolve, reject) => {
          nonRewritableBatch(useCompression, true, resolve, reject);
        });
      });

      test('16M+ error batch', async ({ skip }) => {
        if (maxAllowedSize <= testSize) return skip();
        await new Promise((resolve, reject) => {
          bigBatchError(useCompression, true, resolve, reject);
        });
      }, 360000);

      test('batch with streams', async ({ skip }) => {
        if (!base.utf8Collation()) return skip();
        await new Promise((resolve, reject) => {
          batchWithStream(useCompression, true, resolve, reject);
        });
      });

      test('batch error with streams', async ({ skip }) => {
        await new Promise((resolve, reject) => {
          batchErrorWithStream(useCompression, true, resolve, reject);
        });
      });
    });

    describe('standard question mark and compress with bulk', function () {
      const useCompression = true;

      test('simple batch, local date', async ({ skip }) => {
        if (!base.utf8Collation()) return skip();
        if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) return skip();
        await new Promise((resolve, reject) => {
          simpleBatch(useCompression, true, 'local', resolve, reject);
        });
      });

      test('simple batch offset date', async ({ skip }) => {
        if (!base.utf8Collation()) return skip();
        if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) return skip();
        await new Promise((resolve, reject) => {
          simpleBatch(useCompression, true, timezoneParam, resolve, reject);
        });
      });

      test('simple batch error message ', async ({ skip }) => {
        await new Promise((resolve, reject) => {
          simpleBatchErrorMsg(useCompression, true, resolve, reject);
        });
      });

      test('non rewritable batch', async ({ skip }) => {
        if (!supportBulk) return skip();
        await new Promise((resolve, reject) => {
          nonRewritableBatch(useCompression, true, resolve, reject);
        });
      });

      test('16M+ error batch', async ({ skip }) => {
        if (maxAllowedSize <= testSize) return skip();
        await new Promise((resolve, reject) => {
          bigBatchError(useCompression, true, resolve, reject);
        });
      }, 360000);

      test('batch with streams', async ({ skip }) => {
        if (!base.utf8Collation()) return skip();
        await new Promise((resolve, reject) => {
          batchWithStream(useCompression, true, resolve, reject);
        });
      });

      test('batch error with streams', async ({ skip }) => {
        await new Promise((resolve, reject) => {
          batchErrorWithStream(useCompression, true, resolve, reject);
        });
      });
    });

    describe.sequential('standard question mark without bulk', () => {
      const useCompression = false;

      test('immediate batch after callback with bulk', async ({ skip }) => {
        await new Promise((resolve, reject) => {
          parameterError(true, resolve, reject);
        });
      });

      test('immediate batch after callback without bulk', async ({ skip }) => {
        await new Promise((resolve, reject) => {
          parameterError(false, resolve, reject);
        });
      });

      function parameterError(bulk, resolve, reject) {
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
            conn.end(() => {
              if (err) {
                if (
                  err.message.includes('Expect 3 parameters, but at index 0, parameters only contains 2') ||
                  err.message.includes('Parameter at position 2 is not set')
                ) {
                  resolve();
                } else reject(err);
              } else {
                reject(new Error('Must have throw error'));
              }
            });
          }
        );
      }
      test('simple batch, local date', async ({ skip }) => {
        if (!base.utf8Collation()) return skip();
        if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) return skip();
        await new Promise((resolve, reject) => {
          simpleBatch(useCompression, false, 'local', resolve, reject);
        });
      });

      test('batch without parameter', async ({ skip }) => {
        if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) return skip();
        const conn = base.createCallbackConnection({ compress: useCompression, bulk: false });
        await new Promise((resolve, reject) => {
          conn.batch('INSERT INTO `blabla` values (?)', (err, rows) => {
            conn.end(() => {
              if (err) {
                assert.isTrue(err.message.includes('Batch must have values set'), err.message);
                resolve();
              } else {
                reject('must have thrown an exception');
              }
            });
          });
        });
      });

      test('batch with erroneous parameter', async ({ skip }) => {
        if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) return skip();
        const conn = base.createCallbackConnection({ compress: useCompression, bulk: true });
        conn.query('DROP TABLE IF EXISTS blabla');
        conn.query('CREATE TABLE blabla(i int, i2 int)');
        await new Promise((resolve, reject) => {
          conn.batch('INSERT INTO `blabla` values (?,?)', [[1, 2], [1]], (err, rows) => {
            if (err) {
              assert.isTrue(err.message.includes('Parameter at position 1 is not set'), err.message);
              conn.query('DROP TABLE IF EXISTS blabla', (err) => {
                conn.end(resolve);
              });
            } else {
              reject('must have thrown error');
            }
          });
        });
      });

      test('batch with undefined parameter', async ({ skip }) => {
        if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) return skip();

        const conn = base.createCallbackConnection({ compress: useCompression, bulk: true });
        conn.query('DROP TABLE IF EXISTS blabla');
        conn.query('CREATE TABLE blabla(i int, i2 int)');
        await new Promise((resolve, reject) => {
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
                    reject(err);
                  } else {
                    assert.deepEqual(rows, [
                      { i: 1, i2: 2 },
                      { i: 1, i2: null }
                    ]);
                    conn.query('DROP TABLE IF EXISTS blabla', (err) => {
                      conn.end(resolve);
                    });
                  }
                });
              }
            );
          });
        });
      });

      test('simple batch offset date', async ({ skip }) => {
        if (!base.utf8Collation()) return skip();
        if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) return skip();
        await new Promise((resolve, reject) => {
          simpleBatch(useCompression, false, timezoneParam, resolve, reject);
        });
      });

      test('simple batch error message ', async ({ skip }) => {
        await new Promise((resolve, reject) => {
          simpleBatchErrorMsg(useCompression, false, resolve, reject);
        });
      });

      test('non rewritable batch', async ({ skip }) => {
        await new Promise((resolve, reject) => {
          nonRewritableBatch(useCompression, false, resolve, reject);
        });
      });

      test('batch with streams', async ({ skip }) => {
        if (!base.utf8Collation()) return skip();
        await new Promise((resolve, reject) => {
          batchWithStream(useCompression, false, resolve, reject);
        });
      });

      test('batch error with streams', async ({ skip }) => {
        await new Promise((resolve, reject) => {
          batchErrorWithStream(useCompression, false, resolve, reject);
        });
      });
    });

    describe.sequential('standard question mark and compress without bulk', () => {
      const useCompression = true;

      test('simple batch, local date', async ({ skip }) => {
        if (!base.utf8Collation()) return skip();
        if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) return skip();
        await new Promise((resolve, reject) => {
          simpleBatch(useCompression, false, 'local', resolve, reject);
        });
      });

      test('simple batch offset date', async ({ skip }) => {
        if (!base.utf8Collation()) return skip();
        if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0)) return skip();
        await new Promise((resolve, reject) => {
          simpleBatch(useCompression, false, timezoneParam, resolve, reject);
        });
      });

      test('simple batch error message ', async ({ skip }) => {
        await new Promise((resolve, reject) => {
          simpleBatchErrorMsg(useCompression, false, resolve, reject);
        });
      });

      test('non rewritable batch', async ({ skip }) => {
        await new Promise((resolve, reject) => {
          nonRewritableBatch(useCompression, false, resolve, reject);
        });
      });

      test('batch with streams', async ({ skip }) => {
        if (!base.utf8Collation()) return skip();
        await new Promise((resolve, reject) => {
          batchWithStream(useCompression, false, resolve, reject);
        });
      });

      test('batch error with streams', async ({ skip }) => {
        await new Promise((resolve, reject) => {
          batchErrorWithStream(useCompression, false, resolve, reject);
        });
      });
    });

    describe.sequential('named parameter with bulk', () => {
      test('simple batch', async ({ skip }) => {
        await new Promise((resolve, reject) => {
          simpleNamedPlaceHolders(true, resolve, reject);
        });
      });

      test('simple batch error', async ({ skip }) => {
        await new Promise((resolve, reject) => {
          simpleNamedPlaceHoldersErr(true, resolve, reject);
        });
      });

      test('non rewritable batch', async ({ skip }) => {
        if (!supportBulk) return skip();
        await new Promise((resolve, reject) => {
          nonRewritableHoldersErr(true, resolve, reject);
        });
      });

      test('batch with streams', async ({ skip }) => {
        if (!base.utf8Collation()) return skip();
        await new Promise((resolve, reject) => {
          streamNamedPlaceHolders(true, resolve, reject);
        });
      });

      test('batch error with streams', async ({ skip }) => {
        await new Promise((resolve, reject) => {
          streamErrorNamedPlaceHolders(true, resolve, reject);
        });
      });
    });

    describe.sequential('named parameter without bulk', () => {
      test('simple batch', async ({ skip }) => {
        await new Promise((resolve, reject) => {
          simpleNamedPlaceHolders(false, resolve, reject);
        });
      });

      test('simple batch error', async ({ skip }) => {
        await new Promise((resolve, reject) => {
          simpleNamedPlaceHoldersErr(false, resolve, reject);
        });
      });

      test('non rewritable batch', async ({ skip }) => {
        await new Promise((resolve, reject) => {
          nonRewritableHoldersErr(false, resolve, reject);
        });
      });

      test('batch with streams', async ({ skip }) => {
        if (!base.utf8Collation()) return skip();
        await new Promise((resolve, reject) => {
          streamNamedPlaceHolders(false, resolve, reject);
        });
      });
    });
  },
  30000
);
