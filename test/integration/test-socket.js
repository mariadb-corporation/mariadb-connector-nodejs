//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const Conf = require('../conf');
const { isMaxscale } = require('../base');

describe('test socket', () => {
  it('named pipe', async function () {
    if (process.platform !== 'win32') this.skip();
    if (!process.env.LOCAL_SOCKET_AVAILABLE || isMaxscale()) this.skip();
    if (Conf.baseConfig.host !== 'localhost' && Conf.baseConfig.host !== 'mariadb.example.com') this.skip();

    const res = await shareConn.query('select @@version_compile_os,@@socket soc, @@named_pipe pipeEnable');
    if (!res[0].pipeEnable || Number(res[0].pipeEnable) === 0) this.skip();
    let conn;
    try {
      conn = await base.createConnection({ socketPath: '\\\\.\\pipe\\' + res[0].soc });
    } catch (err) {
      // the server announces a pipe name but does not expose the pipe
      if (err.code === 'ENOENT') this.skip();
      throw err;
    }
    //ensure double connect execute callback immediately
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

  it('named pipe error', function (done) {
    if (process.platform !== 'win32') this.skip();
    const localSocket = process.env.LOCAL_SOCKET_AVAILABLE;
    if (localSocket !== undefined && localSocket) this.skip();
    if (Conf.baseConfig.host !== 'localhost' && Conf.baseConfig.host !== 'mariadb.example.com') this.skip();

    shareConn
      .query('select @@version_compile_os,@@socket soc')
      .then((res) => {
        base
          .createConnection({ socketPath: '\\\\.\\pipe\\wrong' + res[0].soc })
          .then(() => {
            done(new Error('must have thrown error'));
          })
          .catch((err) => {
            assert(err.message.includes('connect ENOENT \\\\.\\pipe\\'));
            done();
          });
      })
      .catch(done);
  });

  it('unix socket', function (done) {
    if (!process.env.LOCAL_SOCKET_AVAILABLE) this.skip();
    if (process.platform === 'win32') this.skip();
    if (
      Conf.baseConfig.host &&
      !(Conf.baseConfig.host === 'localhost' || Conf.baseConfig.host === 'mariadb.example.com')
    )
      this.skip();

    shareConn
      .query('select @@version_compile_os,@@socket soc')
      .then((res) => {
        base
          .createConnection({ socketPath: res[0].soc })
          .then((conn) => {
            conn
              .query('DO 1')
              .then(() => {
                return conn.end();
              })
              .then(() => {
                done();
              })
              .catch(done);
          })
          .catch(done);
      })
      .catch(done);
  });
});
