//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2023 MariaDB Corporation Ab

'use strict';

require('../base.js');
const base = require('../base.js');
const Proxy = require('../tools/proxy');
const Conf = require('../conf');
const { assert } = require('chai');
describe('redirection', () => {
  it('basic redirection', async function () {
    if (process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    const proxy = new Proxy({
      port: Conf.baseConfig.port,
      host: Conf.baseConfig.host,
      resetAfterUse: false
    });
    await proxy.start();
    let conn = await base.createConnection({ port: proxy.port() });
    try {
      assert.equal(proxy.port(), conn.info.port);
      let permitRedirection = true;
      try {
        await conn.query('set @@session.redirect_url="mariadb://localhost:' + Conf.baseConfig.port + '"');
      } catch (e) {
        // if server doesn't support redirection
        permitRedirection = false;
      }
      if (permitRedirection) {
        assert.equal(Conf.baseConfig.port, conn.info.port);
      }
    } finally {
      conn.end();
      proxy.close();
    }
  });

  it('redirection during pipelining', async function () {
    if (process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    const proxy = new Proxy({
      port: Conf.baseConfig.port,
      host: Conf.baseConfig.host,
      resetAfterUse: false
    });
    await proxy.start();
    let conn = await base.createConnection({ port: proxy.port() });
    try {
      assert.equal(proxy.port(), conn.info.port);
      let permitRedirection = true;
      conn.query('SELECT 1');
      conn.query('set @@session.redirect_url="mariadb://localhost:' + Conf.baseConfig.port + '"').catch((e) => {
        permitRedirection = false;
      });
      conn.query('SELECT 2');
      assert.equal(proxy.port(), conn.info.port);
      await conn.query('SELECT 3');
      if (permitRedirection) {
        assert.equal(Conf.baseConfig.port, conn.info.port);
      }
    } finally {
      conn.end();
      proxy.close();
    }
  });

  it('redirection during transaction', async function () {
    if (process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    const proxy = new Proxy({
      port: Conf.baseConfig.port,
      host: Conf.baseConfig.host,
      resetAfterUse: false
    });
    await proxy.start();
    let conn = await base.createConnection({ port: proxy.port() });
    try {
      assert.equal(proxy.port(), conn.info.port);
      let permitRedirection = true;
      try {
        await conn.beginTransaction();
        await conn.query('set @@session.redirect_url="mariadb://localhost:' + Conf.baseConfig.port + '"');
      } catch (e) {
        // if server doesn't support redirection
        permitRedirection = false;
      }
      assert.equal(proxy.port(), conn.info.port);
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
