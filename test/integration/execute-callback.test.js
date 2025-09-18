//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import { assert, describe, test, beforeAll, afterAll, beforeEach } from 'vitest';
import { createConnection, createCallbackConnection } from '../base.js';
import Conf from '../conf.js';

describe.concurrent('prepare and execute callback', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });

  test('prepare error', async () => {
    const conn = createCallbackConnection({ prepareCacheLength: 0 });
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) return reject(err);
        conn.prepare('wrong query', (err, prepare) => {
          if (!err) return reject(new Error('Expect error'));
          assert.isTrue(err.message.includes('You have an error in your SQL syntax'));
          assert.isTrue(err.message.includes('sql: wrong query'));
          assert.equal(err.sqlState, 42000);
          assert.equal(err.errno, 1064);
          assert.equal(err.code, 'ER_PARSE_ERROR');
          conn.end(resolve);
        });
      });
    });
  });

  test('execute callback stack trace', async () => {
    const conn = createCallbackConnection({ trace: true });
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        conn.execute('wrong query', (err) => {
          if (!err) {
            reject(Error('must have thrown error !'));
          } else {
            assert.isTrue(err.stack.includes('execute-callback.test.js:'), err.stack);
            conn.end(resolve);
          }
        });
      });
    });
  });

  test('execute callback with parameter', async () => {
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        conn.prepare('SELECT ? as a', (err, prepare) => {
          prepare.execute(['a'], (err, res) => {
            if (err) {
              reject(err);
            } else {
              assert.deepEqual([{ a: 'a' }], res);
              conn.end(resolve);
            }
          });
        });
      });
    });
  });

  test('execute when closed', async () => {
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        conn.prepare('SELECT ? as a', (err, prepare) => {
          prepare.close();
          prepare.execute(['a'], (err, res) => {
            if (!err) {
              reject(new Error('must have thrown error'));
            } else {
              assert.equal(err.errno, 45051);
              assert.equal(err.code, 'ER_PREPARE_CLOSED');
              conn.end(resolve);
            }
          });
        });
      });
    });
  });

  test('execute callback wrong param stack trace', async () => {
    const conn = createCallbackConnection({ trace: true });
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        conn.execute('SELECT ?', [], (err) => {
          if (!err) {
            reject(error('must have thrown error !'));
          } else {
            assert.isTrue(err.stack.includes('execute-callback.test.js:'), err.stack);
            conn.end(resolve);
          }
        });
      });
    });
  });

  test('prepare close, no cache', async () => {
    const conn = createCallbackConnection({ prepareCacheLength: 0 });
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) return reject(err);
        conn.prepare('select ?', (err, prepare) => {
          if (err) return reject(err);
          assert.equal(prepare.parameterCount, 1);
          assert.equal(prepare.columns.length, 1);
          prepare.close();
          conn.end(resolve);
        });
      });
    });
  });

  test('prepare close with cache', async () => {
    const conn = createCallbackConnection({ prepareCacheLength: 2 });
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) return reject(err);
        for (let i = 0; i < 10; i++) {
          conn.prepare('select ' + i + ',?', (err, prepare) => {
            if (err) {
              console.log(err);
              return reject(err);
            }
            assert.equal(prepare.parameterCount, 1);
            assert.equal(prepare.columns.length, 2);
            prepare.close();
            if (i === 9) {
              conn.end(resolve);
            }
          });
        }
      });
    });
  });

  test('prepare after prepare close - no cache', async () => {
    const conn = createCallbackConnection({ prepareCacheLength: 0 });
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) return reject(err);
        conn.prepare('select ?', (err, prepare) => {
          prepare.execute('1', (res) => {
            prepare.close();
            prepare.execute('1', (err, res) => {
              if (!err) {
                reject(new Error('must have thrown error'));
              } else {
                assert.isTrue(err.message.includes('Execute fails, prepare command as already been closed'));
                conn.prepare('select ?', (err, prepare2) => {
                  if (err) {
                    reject(err);
                  } else {
                    prepare2.execute('1', (res) => {
                      prepare2.close();
                      conn.end(resolve);
                    });
                  }
                });
              }
            });
          });
        });
      });
    });
  });

  test('prepare after prepare close - with cache', async () => {
    const conn = createCallbackConnection({ prepareCacheLength: 2 });
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) return reject(err);
        conn.prepare('select ?', (err, prepare) => {
          prepare.execute('1', (res) => {
            prepare.close();
            prepare.execute('1', (err, res) => {
              if (err) {
                assert.isTrue(err.message.includes('Execute fails, prepare command as already been closed'));
              } else {
                reject(new Error('expect to have thrown an error'));
              }
              //remove from cache
              conn.execute('select 1, ?', ['2']);
              conn.execute('select 2, ?', ['2']);
              conn.execute('select 3, ?', ['2']);
              conn.execute('select 4, ?', ['2'], (err, res) => {
                //removed from cache, must really be closed
                prepare.execute('1', (err, res) => {
                  if (!err) {
                    reject(new Error('must have thrown error'));
                  } else {
                    assert.isTrue(err.message.includes('Execute fails, prepare command as already been closed'));
                    conn.prepare('select ?', (err, prepare2) => {
                      if (err) {
                        reject(err);
                      } else {
                        prepare2.execute('1', (res) => {
                          prepare2.close();
                          conn.end(resolve);
                        });
                      }
                    });
                  }
                });
              });
            });
          });
        });
      });
    });
  });

  test('prepare cache reuse', async () => {
    const conn = createCallbackConnection({ prepareCacheLength: 2 });
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) return reject(err);
        conn.prepare('select ?', (err, prepare) => {
          if (err) return reject(err);
          const initialPrepareId = prepare.id;

          prepare.close();
          conn.prepare('select ? + 1', (err, prepare2) => {
            if (err) return reject(err);
            conn.prepare('select ? + 2', (err, prepare3) => {
              if (err) return reject(err);
              conn.prepare('select ? + 3', (err, prepare4) => {
                if (err) return reject(err);
                conn.prepare({ sql: 'select ? + 4' }, (err, prepare5) => {
                  if (err) return reject(err);
                  conn.prepare('select ?', (err, prepare) => {
                    if (err) return reject(err);
                    assert.notEqual(prepare.id, initialPrepareId);
                    const secondPrepareId = prepare.id;
                    for (let i = 0; i < 10; i++) {
                      conn.prepare('select ?', (err, prepare2) => {
                        if (err) return reject(err);
                        assert.equal(prepare2.id, secondPrepareId);
                        prepare2.close();
                        if (i === 9) {
                          conn.reset((err) => {
                            conn.end(resolve);
                          });
                        }
                      });
                    }
                  });
                });
              });
            });
          });
        });
      });
    });
  });

  test('basic prepare and execute', async () => {
    const conn = createCallbackConnection({ prepareCacheLength: 0 });
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) return reject(err);

        conn.prepare('select ? as a', (err, prepare) => {
          if (err) return reject(err);
          assert.equal(prepare.parameterCount, 1);
          assert.equal(prepare.columns.length, 1);
          prepare.execute([2], (err, res) => {
            if (err) return reject(err);
            assert.isTrue(res[0].a === 2 || res[0].a === 2n);
            prepare.execute([3], (err, res) => {
              if (err) return reject(err);
              assert.isTrue(res[0].a === 3 || res[0].a === 3n);
              if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(8, 0, 0)) {
                prepare.execute(['a'], (err, res) => {
                  if (err) return reject(err);
                  assert.isTrue(res[0].a === 'a');
                  prepare.close();
                  conn.end(resolve);
                });
              } else {
                prepare.close();
                conn.end(resolve);
              }
            });
          });
        });
      });
    });
  }, 5000);

  test('direct execution without cache', async () => {
    const conn = createCallbackConnection({ prepareCacheLength: 0 });
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) return reject(err);
        conn.execute('select ? as a', [2], (err, res, meta) => {
          if (err) return reject(err);
          assert.isTrue(res[0].a === 2 || res[0].a === 2n);
          assert.isTrue(meta.length === 1);
          conn.execute({ sql: 'select ? as a', bigIntAsNumber: true }, [3], (err, res, meta) => {
            if (err) return reject(err);
            assert.isTrue(res[0].a === 3);
            conn.execute('select ? as a', ['a'], (err, res, meta) => {
              if (err) return reject(err);
              if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(8, 0, 0)) {
                assert.isTrue(res[0].a === 'a');
              }
              conn.execute({ sql: 'select 4 as a', bigIntAsNumber: true }, (err, res, meta) => {
                if (err) return reject(err);
                assert.isTrue(res[0].a === 4);
                conn.end(resolve);
              });
            });
          });
        });
      });
    });
  });

  test('execution with namedPlaceholders', async () => {
    const conn = createCallbackConnection({ namedPlaceholders: true });
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) return reject(err);
        conn.execute('select :param2 as a, :param1 as b', { param1: 2, param2: 3 }, (err, res, meta) => {
          if (err) return reject(err);
          assert.isTrue(res[0].a === 3 || res[0].a === 3n);
          assert.isTrue(res[0].b === 2 || res[0].b === 2n);
          conn.execute('select :param2 as a, :param1 as b', { param1: 2, param3: 3 }, (err, res, meta) => {
            if (err) {
              assert.isTrue(err.message.includes('Parameter named param2 is not set'));
              conn.end(resolve);
              return;
            }
            conn.end(() => {
              reject(new Error('must have throw error'));
            });
          });
        });
      });
    });
  });

  test('close alias', async () => {
    const conn = createCallbackConnection({ prepareCacheLength: 0 });
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) return reject(err);
        conn.close();
        resolve();
      });
    });
  }, 5000);
});
