'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const Conf = require('../conf');

describe('test socket', () => {
  it('named pipe', function (done) {
    if (process.platform !== 'win32') this.skip();
    if (process.env.MUST_USE_TCPIP || process.env.MAXSCALE_TEST_DISABLE) this.skip();
    if (Conf.baseConfig.host !== 'localhost' && Conf.baseConfig.host !== 'mariadb.example.com')
      this.skip();
    const test = this;
    shareConn
      .query('select @@version_compile_os,@@socket soc, @@named_pipe pipeEnable')
      .then((res) => {
        if (res[0].pipeEnable === 0) {
          test.skip();
        }
        base
          .createConnection({ socketPath: '\\\\.\\pipe\\' + res[0].soc })
          .then((conn) => {
            //ensure double connect execute callback immediately
            conn
              .connect()
              .then(() => {
                return conn.query('DO 1');
              })
              .then(() => {
                return conn.end();
              })
              .then(() => {
                conn
                  .connect()
                  .then(() => {
                    done(new Error('must have thrown error'));
                  })
                  .catch((err) => {
                    assert(err.message.includes('Connection closed'));
                    done();
                  });
              })
              .catch(done);
          })
          .catch(done);
      })
      .catch(done);
  });

  it('named pipe error', function (done) {
    if (process.platform !== 'win32') this.skip();
    if (process.env.MUST_USE_TCPIP) this.skip();
    if (Conf.baseConfig.host !== 'localhost' && Conf.baseConfig.host !== 'mariadb.example.com')
      this.skip();

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
    if (process.env.MUST_USE_TCPIP) this.skip();
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
