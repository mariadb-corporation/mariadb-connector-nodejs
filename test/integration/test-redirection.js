//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

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
    let conn = await base.createConnection({ host: 'localhost', port: proxy.port() });
    try {
      assert.equal(proxy.port(), conn.info.port);
      let permitRedirection = true;
      try {
        await conn.beginTransaction();
        await conn.query(`set @@session.redirect_url="mariadb://${Conf.baseConfig.host}:${Conf.baseConfig.port}"`);
      } catch (e) {
        // if server doesn't support redirection
        permitRedirection = false;
      }
      if (permitRedirection) {
        assert.equal(Conf.baseConfig.port, conn.info.port);
        let conn2 = await base.createConnection({ host: 'localhost', port: proxy.port() });
        assert.equal(proxy.port(), conn2.info.port);
        await conn2.end();
      }
    } finally {
      conn.end();
      proxy.close();
    }
  });

  it('maxscale redirection', async function () {
    // need maxscale 23.08+
    if (process.env.srv !== 'maxscale') this.skip();
    const proxy = new Proxy({
      port: Conf.baseConfig.port,
      host: Conf.baseConfig.host,
      resetAfterUse: false
    });
    await proxy.start();

    try {
      await shareConn.query(`set @@global.redirect_url="mariadb://${Conf.baseConfig.host}:${Conf.baseConfig.port}"`);
    } catch (e) {
      this.skip();
      return;
    }
    let conn = await base.createConnection({ host: 'localhost', port: proxy.port() });
    try {
      assert.equal(Conf.baseConfig.host, conn.info.host);
      assert.equal(Conf.baseConfig.port, conn.info.port);
      console.log(await conn.query('Select 1'));
      conn.end();
      console.log('*****************************************************************************');
      let conn2 = await base.createConnection({ host: 'localhost', port: proxy.port() });
      assert.equal(Conf.baseConfig.port, conn2.info.port);
      console.log(await conn2.query('Select 2'));
      console.log('*****************************************************************************');
      conn2.end();
    } finally {
      proxy.close();
      try {
        shareConn.query('set @@global.redirect_url=""');
      } catch (e) {}
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
    let conn = await base.createConnection({ host: 'localhost', port: proxy.port() });
    try {
      assert.equal(proxy.port(), conn.info.port);
      let permitRedirection = true;
      conn.query('SELECT 1');
      await conn.beginTransaction();
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
    let conn = await base.createConnection({ host: 'localhost', port: proxy.port() });
    try {
      assert.equal(proxy.port(), conn.info.port);
      let permitRedirection = true;
      try {
        await conn.beginTransaction();
        await conn.query(`set @@session.redirect_url="mariadb://${Conf.baseConfig.host}:${Conf.baseConfig.port}"`);
      } catch (e) {
        // if server doesn't support redirection
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
