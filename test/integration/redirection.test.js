//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import Proxy from '../tools/proxy.js';
import Conf from '../conf.js';
import { isMaxscale, isMaxscaleMinVersion, createConnection } from '../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import { skip } from 'node:test';

describe.concurrent('redirection', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });

  test('basic redirection', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const proxy = new Proxy({
      port: Conf.baseConfig.port,
      host: Conf.baseConfig.host,
      resetAfterUse: false
    });
    await proxy.start();
    let conn = null;
    try {
      conn = await createConnection({ host: 'localhost', port: proxy.port(), permitRedirect: true });
      assert.equal(proxy.port(), conn.info.port);
      let permitRedirection = true;
      try {
        // await conn.beginTransaction();
        await conn.query(`set @@session.redirect_url="mariadb://${Conf.baseConfig.host}:${Conf.baseConfig.port}"`);
      } catch (e) {
        // if the server doesn't support redirection
        permitRedirection = false;
      }
      if (permitRedirection) {
        assert.equal(Conf.baseConfig.port, conn.info.port);
        let conn2 = await createConnection({ host: 'localhost', port: proxy.port() });
        assert.equal(proxy.port(), conn2.info.port);
        await conn2.end();
      }
    } finally {
      if (conn) conn.end();
      proxy.close();
    }
  });

  test('redirection during pipelining', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    const proxy = new Proxy({
      port: Conf.baseConfig.port,
      host: Conf.baseConfig.host,
      resetAfterUse: false
    });
    await proxy.start();
    let conn = await createConnection({ host: 'localhost', port: proxy.port(), permitRedirect: true });
    try {
      assert.equal(proxy.port(), conn.info.port);
      let permitRedirection = true;
      conn.query('SELECT 1');
      conn
        .query(`set @@session.redirect_url="mariadb://${Conf.baseConfig.host}:${Conf.baseConfig.port}"`)
        .catch((e) => {
          permitRedirection = false;
        });
      conn.query('SELECT 2');
      assert.equal(proxy.port(), conn.info.port);
      await conn.query('SELECT 3');
      if (permitRedirection) {
        assert.equal(Conf.baseConfig.port, conn.info.port);
      }
    } finally {
      await conn.end();
      proxy.close();
    }
  });

  test('redirection during transaction', async ({ skip}) => {
    if (isMaxscale(shareConn)) return skip();
    const proxy = new Proxy({
      port: Conf.baseConfig.port,
      host: Conf.baseConfig.host,
      resetAfterUse: false
    });
    await proxy.start();
    let conn = await createConnection({
      host: 'localhost',
      port: proxy.port(),
      permitRedirect: true,
      debug: true,
      debugLen: 1024 });
    try {
      assert.equal(proxy.port(), conn.info.port);
      let permitRedirection = true;
      try {
        await conn.beginTransaction();
        await conn.query(`set @@session.redirect_url="mariadb://${Conf.baseConfig.host}:${Conf.baseConfig.port}"`);
      } catch (e) {
        // if the server doesn't support redirection
        permitRedirection = false;
      }
      assert.equal(proxy.port(), conn.info.port);
      const rows = await conn.query("SELECT '4'");
      assert.deepEqual(rows, [{ 4: '4' }]);
      if (permitRedirection) {
        await conn.commit();
        assert.equal(Conf.baseConfig.port, conn.info.port);
      }
    } finally {
      conn.end();
      proxy.close();
    }
  });
});
