//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import { createConnection, isMaxscale } from '../base.js';
import { getEnv } from '../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import Conf from '../conf.js';

describe('server additional information API', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });
  test('server version', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();

    const res = await shareConn.query('SELECT VERSION() a');
    assert.deepEqual(res, [{ a: shareConn.serverVersion() }]);
  });

  test('server type', ({ skip }) => {
    if (!getEnv('DB_TYPE')) {
      skip();
      return;
    }
    assert.equal(getEnv('DB_TYPE') !== 'mysql', shareConn.info.isMariaDB());
  });
});
