//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import { Writable } from 'node:stream';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import { createConnection, createCallbackConnection } from '../base.js';
import Conf from '../conf.js';

describe.concurrent('results-set streaming', () => {
  let shareConn;
  const numb = 1000;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
    await shareConn.query('DROP TABLE IF EXISTS testStreamResult');
    await shareConn.query('CREATE TABLE testStreamResult (v int)');
    let sql = 'INSERT INTO testStreamResult VALUE (?)';
    const params = [0];
    for (let i = 1; i < numb; i++) {
      sql += ',(?)';
      params.push(i);
    }
    await shareConn.query(sql, params);
  });
  afterAll(async () => {
    await shareConn.query('DROP TABLE IF EXISTS testStreamResult');
    await shareConn.end();
    shareConn = null;
  });

  test('Streaming result-set for-await-of', async function () {
    let currRow = 0;
    const stream = shareConn.queryStream('SELECT * FROM testStreamResult');
    for await (const row of stream) {
      assert.equal(currRow++, row.v);
    }
    assert.equal(numb, currRow);
  });

  test('Streaming Update for-await-of', async function () {
    let currRow = 0;
    const stream = shareConn.queryStream('DO 1');
    for await (const row of stream) {
      console.log(row);
      currRow++;
    }
    assert.equal(1, currRow);
  });

  test('Streaming Error', async () => {
    const stream = shareConn.queryStream('wrong');
    await new Promise((resolve, reject) => {
      stream.on('error', (error) => {
        resolve();
      });
    });
  });

  test('Streaming result-set for-await-of callback', async function () {
    let currRow = 0;
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect(async (err) => {
        const cmd = conn.query('SELECT * FROM testStreamResult');
        const stream = cmd.stream();
        for await (const row of stream) {
          assert.equal(currRow++, row.v);
        }
        assert.equal(numb, currRow);
        conn.end(resolve);
      });
    });
  });

  test('Streaming using queryStream result-set for-await-of callback', async function () {
    let currRow = 0;
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect(async (err) => {
        const stream = conn.queryStream('SELECT * FROM testStreamResult');
        for await (const row of stream) {
          assert.equal(currRow++, row.v);
        }
        assert.equal(numb, currRow);
        conn.end(resolve);
      });
    });
  });

  test('Streaming execute result-set for-await-of', async function () {
    let currRow = 0;
    const prepare = await shareConn.prepare('SELECT * FROM testStreamResult');
    const stream = prepare.executeStream();
    for await (const row of stream) {
      assert.equal(currRow++, row.v);
    }
    assert.equal(numb, currRow);
    prepare.close();
  });

  test('Streaming result-set close', async () => {
    let currRow = 0;
    let metaReceived = false;
    const stream = shareConn.queryStream('SELECT * FROM testStreamResult');
    await new Promise((resolve, reject) => {
      stream
        .on('error', (err) => {
          reject(new Error('must not have thrown any error !'));
        })
        .on('fields', (meta) => {
          assert.equal(meta.length, 1);
          metaReceived = true;
        })
        .on('data', (row) => {
          assert.equal(currRow++, row.v);
        })
        .on('end', () => {
          assert.equal(0, currRow);
          assert.isOk(metaReceived);
          resolve();
        });
      stream.close();
    });
  });

  test('execute Streaming result-set close', async () => {
    let currRow = 0;
    let metaReceived = false;
    let conn = await createConnection({});
    await new Promise((resolve, reject) => {
      conn.prepare('SELECT * FROM testStreamResult').then((prepare) => {
        const stream = prepare.executeStream();
        stream
          .on('error', (err) => {
            reject(new Error('must not have thrown any error !'));
          })
          .on('fields', (meta) => {
            assert.equal(meta.length, 1);
            metaReceived = true;
          })
          .on('data', (row) => {
            assert.equal(currRow++, row.v);
          })
          .on('end', () => {
            assert.equal(0, currRow);
            assert.isOk(metaReceived);
            resolve();
          });
        stream.close();
      });
    }).finally(() => {
      conn.close();
    });
  });

  test('Streaming result-set close callback', async () => {
    let currRow = 0;
    let metaReceived = false;
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect(async (err) => {
        const stream = conn.query('SELECT * FROM testStreamResult').stream();
        stream
          .on('error', (err) => {
            reject(new Error('must not have thrown any error !'));
          })
          .on('fields', (meta) => {
            assert.equal(meta.length, 1);
            metaReceived = true;
          })
          .on('data', (row) => {
            assert.equal(currRow++, row.v);
          })
          .on('end', () => {
            assert.equal(0, currRow);
            assert.isOk(metaReceived);
            conn.end(resolve);
          });
        stream.close();
      });
    });
  });

  test('Streaming result-set close callback queryStream', async () => {
    let currRow = 0;
    let metaReceived = false;
    const conn = createCallbackConnection();
    new Promise((resolve, reject) => {
      conn.connect(async (err) => {
        const stream = conn.queryStream('SELECT * FROM testStreamResult');
        stream
          .on('error', (err) => {
            reject(new Error('must not have thrown any error !'));
          })
          .on('fields', (meta) => {
            assert.equal(meta.length, 1);
            metaReceived = true;
          })
          .on('data', (row) => {
            assert.equal(currRow++, row.v);
          })
          .on('end', () => {
            assert.equal(0, currRow);
            assert.isOk(metaReceived);
            conn.end(resolve);
          });
        stream.close();
      });
    });
  });

  test('Streaming result-set callback', async () => {
    let currRow = 0;
    let metaReceived = false;
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect(async (err) => {
        const stream = conn.query('SELECT * FROM testStreamResult').stream();
        stream
          .on('error', (err) => {
            reject(new Error('must not have thrown any error !'));
          })
          .on('fields', (meta) => {
            assert.equal(meta.length, 1);
            metaReceived = true;
          })
          .on('data', (row) => {
            assert.equal(currRow++, row.v);
          })
          .on('end', () => {
            assert.equal(numb, currRow);
            assert.isOk(metaReceived);
            conn.end(resolve);
          });
      });
    });
  });

  test('Streaming result-set with promise implementation', async () => {
    let currRow = 0;
    let metaReceived = false;
    await new Promise((resolve, reject) => {
      shareConn
        .queryStream('SELECT * FROM testStreamResult')
        .on('error', (err) => {
          reject(new Error('must not have thrown any error !'));
        })
        .on('fields', (meta) => {
          assert.equal(meta.length, 1);
          metaReceived = true;
        })
        .on('data', (row) => {
          assert.equal(currRow++, row.v);
        })
        .on('end', () => {
          assert.equal(numb, currRow);
          assert.isOk(metaReceived);
          resolve();
        });
    });
  });

  test('Streaming error', async () => {
    await new Promise((resolve, reject) => {
      shareConn.queryStream('wrong query').on('error', (err) => {
        assert.isTrue(err.message.includes('You have an error in your SQL syntax'));
        assert.equal(err.sqlState, 42000);
        resolve();
      });
    });
  });

  test('Streaming result-set with callback implementation', async () => {
    let currRow = 0;
    let metaReceived = false;
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          const query = conn.query('SELECT * FROM testStreamResult');
          query
            .on('error', (err) => {
              reject(new Error('must not have thrown any error !'));
            })
            .on('fields', (meta) => {
              assert.equal(meta.length, 1);
              metaReceived = true;
            })
            .on('data', (row) => {
              assert.equal(currRow++, row.v);
            })
            .on('end', () => {
              assert.equal(numb, currRow);
              assert.isOk(metaReceived);
              conn.end(resolve);
            });
        }
      });
    });
  });

  test('Streaming callback execute result-set for-await-of', async () => {
    let currRow = 0;
    let metaReceived = false;
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.prepare('SELECT * FROM testStreamResult', (err, prepare) => {
        const stream = prepare.executeStream();
        stream
          .on('error', (err) => {
            reject(new Error('must not have thrown any error !'));
          })
          .on('fields', (meta) => {
            assert.equal(meta.length, 1);
            metaReceived = true;
          })
          .on('data', (row) => {
            assert.equal(currRow++, row.v);
          })
          .on('end', () => {
            assert.equal(numb, currRow);
            assert.isOk(metaReceived);
            prepare.close();
            conn.end(resolve);
          });
      });
    });
  });

  test('streaming with option rows as array', async () => {
    let currRow = 0;
    let metaReceived = false;
    await new Promise((resolve, reject) => {
      shareConn
        .queryStream({ rowsAsArray: true, sql: 'SELECT * FROM testStreamResult' })
        .on('error', (err) => {
          reject(new Error('must not have thrown any error !'));
        })
        .on('fields', (meta) => {
          assert.equal(meta.length, 1);
          metaReceived = true;
        })
        .on('data', (row) => {
          assert(Array.isArray(row));
          assert.deepEqual(row, [currRow++]);
        })
        .on('end', () => {
          assert.equal(numb, currRow);
          assert.isOk(metaReceived);
          resolve();
        });
    });
  });

  test('Streaming result-set pipe', async () => {
    let currRow = 0;
    await new Promise((resolve, reject) => {
      const writableStream = new Writable({
        objectMode: true,
        decodeStrings: false,
        write: (row, encoding, callback) => {
          assert.equal(currRow++, row.v);
          callback();
          if (currRow === numb) {
            //final was implemented in v8
            if (!process || process.versions.node.startsWith('6.')) resolve();
          }
        },
        writev: (rows, callback) => {
          for (let i = 0; i < rows.length; i++) {
            assert.equal(++currRow, rows[i].v);
          }
          callback();
        },
        final: () => {
          assert.equal(numb, currRow);
          resolve();
        }
      });

      shareConn.queryStream('SELECT * FROM testStreamResult').pipe(writableStream);
    });
  });

  test('Streaming result-set callback pipe', async () => {
    let currRow = 0;
    await new Promise((resolve, reject) => {
      const writableStream = new Writable({
        objectMode: true,
        decodeStrings: false,
        write: (row, encoding, callback) => {
          assert.equal(currRow++, row.v);
          callback();
          if (process.versions.node.startsWith('6.') && currRow === numb) {
            //final was implemented in v8
            resolve();
          }
        },
        writev: (rows, callback) => {
          for (let i = 0; i < rows.length; i++) {
            assert.equal(++currRow, rows[i].v);
          }
          callback();
        },
        final: () => {
          assert.equal(numb, currRow);
          conn.end(resolve);
        }
      });
      const conn = createCallbackConnection();
      conn.query('SELECT * FROM testStreamResult').stream({ highWaterMark: 10 }).pipe(writableStream);
    });
  });

  test('Streaming error handling', async () => {
    await new Promise((resolve, reject) => {
      shareConn.queryStream('SELECT * FROM UnknownTable').on('error', (err) => {
        assert.equal(err.errno, 1146);
        assert.equal(err.sqlState, '42S02');
        assert.equal(err.code, 'ER_NO_SUCH_TABLE');
        resolve();
      });
    });
  });
});
