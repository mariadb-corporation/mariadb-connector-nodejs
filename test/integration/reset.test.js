//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import { createConnection } from '../base.js';
import * as ServerStatus from '../../lib/const/server-status';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import Conf from '../conf.js';

describe.concurrent('reset connection', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });
  test('reset user variable', async () => {
    const conn = await createConnection();
    await conn.query("set @youhou='test'");
    let rows = await conn.query('select @youhou');
    assert.deepEqual(rows, [{ '@youhou': 'test' }]);
    await conn.reset();
    try {
      rows = await conn.query('select @youhou');
      if (
        (conn.info.isMariaDB() && conn.info.hasMinVersion(10, 2, 4)) ||
        (!conn.info.isMariaDB() && conn.info.hasMinVersion(5, 7, 3))
      ) {
        assert.deepEqual(rows, [{ '@youhou': null }]);
      }
    } catch (err) {
      if (
        (conn.info.isMariaDB() && conn.info.hasMinVersion(10, 2, 4)) ||
        (!conn.info.isMariaDB() && conn.info.hasMinVersion(5, 7, 3))
      ) {
        throw new Error('must have thrown an error');
      }
    }
    await conn.end();
  });

  test('reset temporary tables', async () => {
    const conn = await createConnection();
    await conn.query('CREATE TEMPORARY TABLE resetTemporaryTable(t varchar(128))');
    let rows = await conn.query('select * from resetTemporaryTable');
    assert.deepEqual(rows, []);
    await conn.reset();
    try {
      rows = await conn.query('select * from resetTemporaryTable');
      throw new Error('temporary table must not exist !');
    } catch (err) {
      if (
        (conn.info.isMariaDB() && conn.info.hasMinVersion(10, 2, 4)) ||
        (!conn.info.isMariaDB() && conn.info.hasMinVersion(5, 7, 3))
      ) {
        assert.equal(err.errno, 1146);
      }
    }
    await conn.end;
  });

  test('reset transaction in progress', async () => {
    shareConn.query('DROP TABLE IF EXISTS resetTransaction');
    shareConn.query('CREATE TABLE resetTransaction(firstName varchar(32))');
    await new Promise((resolve, reject) => {
      shareConn
        .query("INSERT INTO resetTransaction values ('john')")
        .then(() => {
          createConnection().then((conn) => {
            conn
              .beginTransaction()
              .then(() => {
                return conn.query("UPDATE resetTransaction SET firstName='Tom'");
              })
              .then(() => {
                assert.isTrue((conn.info.status & ServerStatus.STATUS_IN_TRANS) === 1);
                return conn.reset();
              })
              .then(async () => {
                if (
                  (conn.info.isMariaDB() && conn.info.hasMinVersion(10, 2, 4)) ||
                  (!conn.info.isMariaDB() && conn.info.hasMinVersion(5, 7, 3))
                ) {
                  assert.isTrue((conn.info.status & ServerStatus.STATUS_IN_TRANS) === 0);
                  await conn.end();
                  resolve();
                } else {
                  conn.end(() => {
                    reject(new Error('must have thrown an error'));
                  });
                }
              })
              .catch(async (err) => {
                if (
                  (conn.info.isMariaDB() && conn.info.hasMinVersion(10, 2, 4)) ||
                  (!conn.info.isMariaDB() && conn.info.hasMinVersion(5, 7, 3))
                ) {
                  reject(err);
                } else {
                  await conn.end();
                  resolve();
                }
              });
          });
        })
        .catch(reject);
    });
  });
});
