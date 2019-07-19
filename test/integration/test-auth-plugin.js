'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const Conf = require('../conf');

describe('authentication plugin', () => {
  it('ed25519 authentication plugin', function(done) {
    if (process.env.MAXSCALE_VERSION) this.skip();
    const self = this;
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 1, 22)) this.skip();

    shareConn
      .query('SELECT @@strict_password_validation as a')
      .then(res => {
        if (res[0].a === 1 && !shareConn.info.hasMinVersion(10, 4, 0)) self.skip();
        shareConn
          .query("INSTALL SONAME 'auth_ed25519'")
          .then(
            () => {
              shareConn
                .query("drop user IF EXISTS verificationEd25519AuthPlugin@'%'")
                .then(() => {
                  if (shareConn.info.hasMinVersion(10, 4, 0)) {
                    return shareConn.query(
                      "CREATE USER verificationEd25519AuthPlugin@'%' IDENTIFIED " +
                        "VIA ed25519 USING PASSWORD('MySup8%rPassw@ord')"
                    );
                  }
                  return shareConn.query(
                    "CREATE USER verificationEd25519AuthPlugin@'%' IDENTIFIED " +
                      "VIA ed25519 USING '6aW9C7ENlasUfymtfMvMZZtnkCVlcb1ssxOLJ0kj/AA'"
                  );
                })
                .then(() => {
                  return shareConn.query("GRANT ALL on *.* to verificationEd25519AuthPlugin@'%'");
                })
                .then(() => {
                  base
                    .createConnection({
                      user: 'verificationEd25519AuthPlugin',
                      password: 'MySup8%rPassw@ord'
                    })
                    .then(conn => {
                      conn.end();
                      done();
                    })
                    .catch(done);
                })
                .catch(err => {
                  const expectedMsg = err.message.includes(
                    "Client does not support authentication protocol 'client_ed25519' requested by server."
                  );
                  if (!expectedMsg) console.log(err);
                  assert(expectedMsg);
                  done();
                });
            },
            err => {
              //server wasn't build with this plugin, cancelling test
              self.skip();
            }
          )
          .catch(done);
      })
      .catch(done);
  });

  it('name pipe authentication plugin', function(done) {
    if (process.platform !== 'win32') this.skip();
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 1, 11)) this.skip();
    if (Conf.baseConfig.host !== 'localhost' && Conf.baseConfig.host !== 'mariadb.example.com')
      this.skip();
    const windowsUser = process.env.USERNAME;
    if (windowsUser === 'root') this.skip();

    const self = this;
    shareConn
      .query('SELECT @@named_pipe as pipe')
      .then(res => {
        if (res[0].pipe) {
          shareConn
            .query("INSTALL PLUGIN named_pipe SONAME 'auth_named_pipe'")
            .then(() => {})
            .catch(err => {});
          shareConn
            .query('DROP USER ' + windowsUser)
            .then(() => {})
            .catch(err => {});
          shareConn
            .query('CREATE USER ' + windowsUser + " IDENTIFIED VIA named_pipe using 'test'")
            .then(() => {
              return shareConn.query('GRANT ALL on *.* to ' + windowsUser);
            })
            .then(() => {
              return shareConn.query('select @@version_compile_os,@@socket soc');
            })
            .then(res => {
              return base.createConnection({
                user: null,
                socketPath: '\\\\.\\pipe\\' + res[0].soc
              });
            })
            .then(conn => {
              return conn.end();
            })
            .then(done)
            .catch(done);
        } else {
          console.log('named pipe not enabled');
          self.skip();
        }
      })
      .catch(err => {});
  });

  it('unix socket authentication plugin', function(done) {
    if (process.platform === 'win32') this.skip();
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 1, 11)) this.skip();
    if (process.env.MUST_USE_TCPIP) this.skip();
    if (Conf.baseConfig.host !== 'localhost' && Conf.baseConfig.host !== 'mariadb.example.com')
      this.skip();

    shareConn
      .query('select @@version_compile_os,@@socket soc')
      .then(res => {
        const unixUser = process.env.USER;
        if (!unixUser || unixUser === 'root') this.skip();
        console.log('unixUser:' + unixUser);
        shareConn.query("INSTALL PLUGIN unix_socket SONAME 'auth_socket'").catch(err => {});
        shareConn.query('DROP USER IF EXISTS ' + unixUser);
        shareConn.query(
          "CREATE USER '" + unixUser + "'@'" + Conf.baseConfig.host + "' IDENTIFIED VIA unix_socket"
        );
        shareConn
          .query("GRANT ALL on *.* to '" + unixUser + "'@'" + Conf.baseConfig.host + "'")
          .then(() => {
            base
              .createConnection({ user: null, socketPath: res[0].soc })
              .then(conn => {
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

  it('dialog authentication plugin', function(done) {
    //pam is set using .travis/entrypoint/pam.sh
    if (!process.env.TRAVIS || process.env.MAXSCALE_VERSION) this.skip();

    if (!shareConn.info.isMariaDB()) this.skip();
    this.timeout(10000);
    shareConn.query("INSTALL PLUGIN pam SONAME 'auth_pam'").catch(err => {});
    shareConn.query("DROP USER IF EXISTS 'testPam'@'%'").catch(err => {});
    shareConn.query("CREATE USER 'testPam'@'%' IDENTIFIED VIA pam USING 'mariadb'");
    shareConn.query("GRANT ALL ON *.* TO 'testPam'@'%' IDENTIFIED VIA pam");
    shareConn.query('FLUSH PRIVILEGES');

    //password is unix password "myPwd"
    base
      .createConnection({ user: 'testPam', password: 'myPwd' })
      .then(conn => {
        return conn.end();
      })
      .then(() => {
        done();
      })
      .catch(err => {
        if (err.errno === 1045 || err.errno === 1044) {
          done();
        } else {
          done(err);
        }
      });
  });

  it('multi authentication plugin', function(done) {
    if (process.env.MAXSCALE_VERSION) this.skip();
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 4, 3)) this.skip();
    shareConn.query("drop user IF EXISTS mysqltest1@'%'");
    shareConn
      .query(
        "CREATE USER mysqltest1@'%' IDENTIFIED " +
          "VIA ed25519 as password('!Passw0rd3') " +
          " OR mysql_native_password as password('!Passw0rd3Works')"
      )
      .then(() => {
        return shareConn.query("grant all on *.* to mysqltest1@'%'");
      })
      .then(() => {
        return base.createConnection({
          user: 'mysqltest1',
          password: '!Passw0rd3'
        });
      })
      .then(conn => {
        return conn.query('select 1').then(res => {
          return conn.end();
        });
      })
      .then(() => {
        base
          .createConnection({
            user: 'mysqltest1',
            password: '!Passw0rd3Works'
          })
          .then(conn => {
            conn
              .query('select 1')
              .then(res => {
                conn.end();
                base
                  .createConnection({
                    user: 'mysqltest1',
                    password: '!Passw0rd3Wrong'
                  })
                  .then(conn => {
                    done(new Error('must have throw Error!'));
                  })
                  .catch(() => {
                    done();
                  });
              })
              .catch(done);
          })
          .catch(done);
      })
      .catch(done);
  });
});
