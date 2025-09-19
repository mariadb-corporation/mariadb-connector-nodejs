//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import Conf from '../conf.js';
import { createConnection, isLocalDb, isMaxscale, isWindows } from '../base.js';
import { getEnv } from '../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';

describe.concurrent('test socket', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });
  test('named pipe', async ({ skip }) => {
    if (!isWindows()) return skip();
    if (!isLocalDb() || isMaxscale(shareConn)) return skip();
    if (Conf.baseConfig.host !== 'localhost' && Conf.baseConfig.host !== 'mariadb.example.com') return skip();

    const res = await shareConn.query('select @@version_compile_os,@@socket soc, @@named_pipe pipeEnable');
    if (res[0].pipeEnable === 0) {
      return skip();
    }
    const conn = await createConnection({ socketPath: '\\\\.\\pipe\\' + res[0].soc });
    await conn.connect();
    await conn.query('DO 1');
    await conn.end();
    try {
      await conn.connect();
      throw new Error('must have thrown error');
    } catch (err) {
      assert(err.message.includes('Connection closed'));
    }
  });

  test('named pipe error', async ({ skip }) => {
    if (!isWindows()) return skip();
    if (!isLocalDb()) return skip();
    if (Conf.baseConfig.host !== 'localhost' && Conf.baseConfig.host !== 'mariadb.example.com') return skip();

    const res = await shareConn.query('select @@version_compile_os,@@socket soc');
    try {
      await createConnection({ socketPath: '\\\\.\\pipe\\wrong' + res[0].soc });
      throw new Error('must have thrown error');
    } catch (err) {
      assert(err.message.includes('connect ENOENT \\\\.\\pipe\\'));
    }
  });

  test('unix socket', async ({ skip }) => {
    if (!isLocalDb()) return skip();
    if (isWindows()) return skip();
    if (
      Conf.baseConfig.host &&
      !(Conf.baseConfig.host === 'localhost' || Conf.baseConfig.host === 'mariadb.example.com')
    )
      return skip();

    const res = await shareConn.query('select @@version_compile_os,@@socket soc');
    const localEnv = getEnv('LOCAL_DB');
    const conn = await createConnection({ socketPath: res[0].soc });
    await conn.query('DO 1');
    await conn.end();
  });
});
