//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';
import * as basePromise from '../../promise';
import * as baseCallback from '../../callback';
import * as base from '../base.js';
import { createConnection, isMaxscale } from '../base.js';
import { getEnv } from '../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import Conf from '../conf.js';

describe('Connection meta', function () {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });

  test('server version', () => {
    const serverVersion = shareConn.serverVersion();
    if (!isMaxscale(shareConn)) {
      const version = getEnv('DB_VERSION');
      if (version && !version.includes('-rc')) {
        assert(serverVersion.startsWith(version), serverVersion + '/' + version);
      }
    }
  });

  test('connector version', () => {
    const connectorVersion = basePromise.version;
    assert(connectorVersion.startsWith('3.'));
  });

  test('callback connector version', () => {
    const connectorVersion = baseCallback.version;
    assert(connectorVersion.startsWith('3.'));
  });

  test('server version before connect error', async () => {
    const conn = base.createCallbackConnection();
    await new Promise((resolve, reject) => {
      try {
        conn.serverVersion();
        throw new Error('Must have thrown exception');
      } catch (err) {
        assert(err.message.includes('cannot know if server information until connection is established'));
        conn.connect((err) => {
          conn.end(() => {
            resolve();
          });
        });
      }
    });
  });

  test('isMariaDB', () => {
    const isMariadb = shareConn.info.isMariaDB();
    if (getEnv('DB_TYPE')) {
      assert.equal(isMariadb, !getEnv('DB_TYPE').startsWith('mysql'));
    }
  });

  test('isMariaDB before connect error', async () => {
    const conn = base.createCallbackConnection();
    await new Promise((resolve, reject) => {
      try {
        conn.info.isMariaDB();
        throw new Error('Must have thrown exception');
      } catch (err) {
        assert(err.message.includes('cannot know if server is MariaDB until connection is established'));
        conn.connect((err) => {
          conn.end(() => {
            resolve();
          });
        });
      }
    });
  });

  test('info.hasMinVersion before connect error', async () => {
    const conn = base.createCallbackConnection();
    await new Promise((resolve, reject) => {
      try {
        conn.info.hasMinVersion();
        reject(new Error('Must have thrown exception'));
      } catch (err) {
        assert(err.message.includes('cannot know if server version until connection is established'));
        conn.connect((err) => {
          conn.end(() => {
            resolve();
          });
        });
      }
    });
  });

  test('info.hasMinVersion', () => {
    try {
      shareConn.info.hasMinVersion();
      throw new Error('Must have thrown exception');
    } catch (err) {
      assert(err.message.includes('a major version must be set'));
    }

    assert(shareConn.info.hasMinVersion(3));
    assert(shareConn.info.hasMinVersion(3, 4));
    assert(shareConn.info.hasMinVersion(3, 4, 10));
    assert(!shareConn.info.hasMinVersion(33));
    assert(!shareConn.info.hasMinVersion(33, 5));
    assert(!shareConn.info.hasMinVersion(33, 5, 20));
  });
});
