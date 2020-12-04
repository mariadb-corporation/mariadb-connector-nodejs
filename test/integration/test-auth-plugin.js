'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const Conf = require('../conf');

describe('authentication plugin', () => {
  let rsaPublicKey = process.env.TEST_RSA_PUBLIC_KEY;
  let cachingRsaPublicKey = process.env.TEST_CACHING_RSA_PUBLIC_KEY;

  before(async function () {
    if (!rsaPublicKey) {
      if (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(5, 7, 0)) {
        const res = await shareConn.query({
          sql: "SHOW STATUS LIKE 'Rsa_public_key'",
          rowsAsArray: true
        });
        rsaPublicKey = res[0][1];
      }
    }

    if (!cachingRsaPublicKey) {
      if (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0)) {
        const res = await shareConn.query({
          sql: "SHOW STATUS LIKE 'Caching_sha2_password_rsa_public_key'",
          rowsAsArray: true
        });
        cachingRsaPublicKey = res[0][1];
      }
    }

    await shareConn.query("DROP USER IF EXISTS 'sha256User'@'%'");
    await shareConn.query("DROP USER IF EXISTS 'cachingSha256User'@'%'");
    await shareConn.query("DROP USER IF EXISTS 'cachingSha256User2'@'%'");
    await shareConn.query("DROP USER IF EXISTS 'cachingSha256User3'@'%'");

    if (!shareConn.info.isMariaDB()) {
      if (shareConn.info.hasMinVersion(8, 0, 0)) {
        await shareConn.query(
          "CREATE USER 'sha256User'@'%' IDENTIFIED WITH sha256_password BY 'password'"
        );
        await shareConn.query("GRANT ALL PRIVILEGES ON *.* TO 'sha256User'@'%'");

        await shareConn.query(
          "CREATE USER 'cachingSha256User'@'%' IDENTIFIED WITH caching_sha2_password BY 'password'"
        );
        await shareConn.query("GRANT ALL PRIVILEGES ON *.* TO 'cachingSha256User'@'%'");
        await shareConn.query(
          "CREATE USER 'cachingSha256User2'@'%' IDENTIFIED WITH caching_sha2_password BY 'password'"
        );
        await shareConn.query("GRANT ALL PRIVILEGES ON *.* TO 'cachingSha256User2'@'%'");
        await shareConn.query(
          "CREATE USER 'cachingSha256User3'@'%'  IDENTIFIED WITH caching_sha2_password BY 'password'"
        );
        await shareConn.query("GRANT ALL PRIVILEGES ON *.* TO 'cachingSha256User3'@'%'");
      } else {
        await shareConn.query("CREATE USER 'sha256User'@'%'");
        await shareConn.query(
          "GRANT ALL PRIVILEGES ON *.* TO 'sha256User'@'%' IDENTIFIED WITH " +
            "sha256_password BY 'password'"
        );
      }
    }
  });

  it('ed25519 authentication plugin', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE) this.skip();
    const self = this;
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 1, 22)) this.skip();

    shareConn
      .query('SELECT @@strict_password_validation as a')
      .then((res) => {
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
                  return shareConn.query(
                    'GRANT SELECT on  `' +
                      Conf.baseConfig.database +
                      "`.* to verificationEd25519AuthPlugin@'%'"
                  );
                })
                .then(() => {
                  base
                    .createConnection({
                      user: 'verificationEd25519AuthPlugin',
                      password: 'MySup8%rPassw@ord'
                    })
                    .then((conn) => {
                      conn.end();
                      done();
                    })
                    .catch(done);
                })
                .catch((err) => {
                  const expectedMsg = err.message.includes(
                    "Client does not support authentication protocol 'client_ed25519' requested by server."
                  );
                  if (!expectedMsg) console.log(err);
                  assert(expectedMsg);
                  done();
                });
            },
            (err) => {
              //server wasn't build with this plugin, cancelling test
              self.skip();
            }
          )
          .catch(done);
      })
      .catch(done);
  });

  it('name pipe authentication plugin', function (done) {
    if (process.platform !== 'win32') this.skip();
    if (process.env.MAXSCALE_TEST_DISABLE) this.skip();
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 1, 11)) this.skip();
    if (Conf.baseConfig.host !== 'localhost' && Conf.baseConfig.host !== 'mariadb.example.com')
      this.skip();
    const windowsUser = process.env.USERNAME;
    if (windowsUser === 'root') this.skip();

    const self = this;
    shareConn
      .query('SELECT @@named_pipe as pipe')
      .then((res) => {
        if (res[0].pipe) {
          shareConn
            .query("INSTALL PLUGIN named_pipe SONAME 'auth_named_pipe'")
            .then(() => {})
            .catch((err) => {});
          shareConn
            .query('DROP USER ' + windowsUser)
            .then(() => {})
            .catch((err) => {});
          shareConn
            .query('CREATE USER ' + windowsUser + " IDENTIFIED VIA named_pipe using 'test'")
            .then(() => {
              return shareConn.query('GRANT SELECT on *.* to ' + windowsUser);
            })
            .then(() => {
              return shareConn.query('select @@version_compile_os,@@socket soc');
            })
            .then((res) => {
              return base.createConnection({
                user: null,
                socketPath: '\\\\.\\pipe\\' + res[0].soc
              });
            })
            .then((conn) => {
              return conn.end();
            })
            .then(done)
            .catch(done);
        } else {
          console.log('named pipe not enabled');
          self.skip();
        }
      })
      .catch((err) => {});
  });

  it('unix socket authentication plugin', function (done) {
    if (process.platform === 'win32') this.skip();
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 1, 11)) this.skip();
    if (process.env.MUST_USE_TCPIP) this.skip();
    if (Conf.baseConfig.host !== 'localhost' && Conf.baseConfig.host !== 'mariadb.example.com')
      this.skip();

    shareConn
      .query('select @@version_compile_os,@@socket soc')
      .then((res) => {
        const unixUser = process.env.USER;
        if (!unixUser || unixUser === 'root') this.skip();
        console.log('unixUser:' + unixUser);
        shareConn.query("INSTALL PLUGIN unix_socket SONAME 'auth_socket'").catch((err) => {});
        shareConn.query('DROP USER IF EXISTS ' + unixUser);
        shareConn
          .query(
            "CREATE USER '" +
              unixUser +
              "'@'" +
              Conf.baseConfig.host +
              "' IDENTIFIED VIA unix_socket"
          )
          .catch((err) => {});
        shareConn
          .query("GRANT SELECT on *.* to '" + unixUser + "'@'" + Conf.baseConfig.host + "'")
          .then(() => {
            base
              .createConnection({ user: null, socketPath: res[0].soc })
              .then((conn) => {
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

  it('dialog authentication plugin', function (done) {
    //pam is set using .travis/sql/pam.sh
    if (!process.env.TRAVIS || process.env.MAXSCALE_TEST_DISABLE) this.skip();

    if (!shareConn.info.isMariaDB()) this.skip();
    this.timeout(10000);
    shareConn.query("INSTALL PLUGIN pam SONAME 'auth_pam'").catch((err) => {});
    shareConn.query("DROP USER IF EXISTS 'testPam'@'%'").catch((err) => {});
    shareConn.query("CREATE USER 'testPam'@'%' IDENTIFIED VIA pam USING 'mariadb'");
    shareConn.query("GRANT SELECT ON *.* TO 'testPam'@'%' IDENTIFIED VIA pam");
    shareConn.query('FLUSH PRIVILEGES');

    //password is unix password "myPwd"
    base
      .createConnection({ user: 'testPam', password: 'myPwd' })
      .then((conn) => {
        return conn.end();
      })
      .then(() => {
        done();
      })
      .catch((err) => {
        if (err.errno === 1045 || err.errno === 1044) {
          done();
        } else {
          done(err);
        }
      });
  });

  it('dialog authentication plugin multiple password', function (done) {
    //pam is set using .travis/sql/pam.sh
    if (!process.env.TRAVIS || process.env.MAXSCALE_TEST_DISABLE) this.skip();

    if (!shareConn.info.isMariaDB()) this.skip();
    this.timeout(10000);
    shareConn.query("INSTALL PLUGIN pam SONAME 'auth_pam'").catch((err) => {});
    shareConn.query("DROP USER IF EXISTS 'testPam'@'%'").catch((err) => {});
    shareConn.query("CREATE USER 'testPam'@'%' IDENTIFIED VIA pam USING 'mariadb'");
    shareConn.query("GRANT SELECT ON *.* TO 'testPam'@'%' IDENTIFIED VIA pam");
    shareConn.query('FLUSH PRIVILEGES');

    //password is unix password "myPwd"
    base
      .createConnection({ user: 'testPam', password: ['myPwd', 'myPwd'] })
      .then((conn) => {
        return conn.end();
      })
      .then(() => {
        done();
      })
      .catch((err) => {
        if (err.errno === 1045 || err.errno === 1044) {
          done();
        } else {
          done(err);
        }
      });
  });

  it('multi authentication plugin', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE || process.env.SKYSQL || process.env.SKYSQL_HA)
      this.skip();
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 4, 3)) this.skip();
    shareConn.query("drop user IF EXISTS mysqltest1@'%'").catch((err) => {});
    shareConn
      .query(
        "CREATE USER mysqltest1@'%' IDENTIFIED " +
          "VIA ed25519 as password('!Passw0rd3') " +
          " OR mysql_native_password as password('!Passw0rd3Works')"
      )
      .then(() => {
        return shareConn.query(
          'grant SELECT on `' + Conf.baseConfig.database + "`.*  to mysqltest1@'%'"
        );
      })
      .then(() => {
        return base.createConnection({
          user: 'mysqltest1',
          password: '!Passw0rd3'
        });
      })
      .then((conn) => {
        return conn.query('select 1').then((res) => {
          return conn.end();
        });
      })
      .then(() => {
        base
          .createConnection({
            user: 'mysqltest1',
            password: '!Passw0rd3Works'
          })
          .then((conn) => {
            conn
              .query('select 1')
              .then((res) => {
                conn.end();
                base
                  .createConnection({
                    user: 'mysqltest1',
                    password: '!Passw0rd3Wrong'
                  })
                  .then((conn) => {
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

  it('sha256 authentication plugin', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE) this.skip();
    if (process.platform === 'win32') this.skip();
    if (!rsaPublicKey || shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(5, 7, 0))
      this.skip();

    const self = this;
    base
      .createConnection({
        user: 'sha256User',
        password: 'password',
        rsaPublicKey: rsaPublicKey
      })
      .then((conn) => {
        conn.end();
        done();
      })
      .catch((err) => {
        if (err.message.includes('sha256_password authentication plugin require node 11.6+'))
          self.skip();
        done(err);
      });
  });

  it('sha256 authentication plugin with public key retrieval', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE) this.skip();
    if (process.platform === 'win32') this.skip();
    if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(5, 7, 0)) this.skip();

    const self = this;
    base
      .createConnection({
        user: 'sha256User',
        password: 'password',
        allowPublicKeyRetrieval: true
      })
      .then((conn) => {
        conn.end();
        done();
      })
      .catch((err) => {
        if (err.message.includes('sha256_password authentication plugin require node 11.6+'))
          self.skip();
        done(err);
      });
  });

  it('sha256 authentication plugin without public key retrieval', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE) this.skip();
    if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(5, 7, 0)) this.skip();

    base
      .createConnection({
        user: 'sha256User',
        password: 'password'
      })
      .then((conn) => {
        conn.end();
        done(new Error('must have thrown error'));
      })
      .catch((err) => {
        assert.isTrue(
          err.message.includes('RSA public key is not available client side.') ||
            err.message.includes('sha256_password authentication plugin require node 11.6+')
        );
        done();
      });
  });

  it('sha256 authentication plugin with ssl', function (done) {
    if (
      process.env.MAXSCALE_TEST_DISABLE ||
      shareConn.info.isMariaDB() ||
      !shareConn.info.hasMinVersion(5, 7, 0)
    )
      this.skip();

    const self = this;
    shareConn
      .query("SHOW VARIABLES LIKE 'have_ssl'")
      .then((rows) => {
        // console.log("ssl is not enable on database, skipping test :");
        if (rows[0].Value === 'YES') {
          base
            .createConnection({
              user: 'sha256User',
              password: 'password',
              ssl: {
                rejectUnauthorized: false
              }
            })
            .then((conn) => {
              conn.end();
              done();
            })
            .catch((err) => {
              if (err.message.includes('sha256_password authentication plugin require node 11.6+'))
                self.skip();
              done(err);
            });
        } else {
          this.skip();
        }
      })
      .catch(done);
  });

  it('cachingsha256 authentication plugin', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE) this.skip();
    if (process.platform === 'win32') this.skip();
    if (!rsaPublicKey || shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(8, 0, 0))
      this.skip();

    const self = this;
    base
      .createConnection({
        user: 'cachingSha256User',
        password: 'password',
        cachingRsaPublicKey: rsaPublicKey
      })
      .then((conn) => {
        conn.end();
        //using fast auth
        base
          .createConnection({
            user: 'cachingSha256User',
            password: 'password',
            cachingRsaPublicKey: rsaPublicKey
          })
          .then((conn) => {
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch((err) => {
        if (err.message.includes('caching_sha2_password authentication plugin require node 11.6+'))
          self.skip();
        done(err);
      });
  });

  it('cachingsha256 authentication plugin with public key retrieval', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE) this.skip();
    if (process.platform === 'win32') this.skip();
    if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(8, 0, 0)) this.skip();

    const self = this;
    base
      .createConnection({
        user: 'cachingSha256User2',
        password: 'password',
        allowPublicKeyRetrieval: true
      })
      .then((conn) => {
        conn.end();
        done();
      })
      .catch((err) => {
        if (err.message.includes('caching_sha2_password authentication plugin require node 11.6+'))
          self.skip();
        done(err);
      });
  });

  it('cachingsha256 authentication plugin without public key retrieval', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE) this.skip();
    if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(8, 0, 0)) this.skip();

    base
      .createConnection({
        user: 'cachingSha256User3',
        password: 'password'
      })
      .then((conn) => {
        conn.end();
        done(new Error('must have thrown error'));
      })
      .catch((err) => {
        assert.isTrue(
          err.message.includes('RSA public key is not available client side.') ||
            err.message.includes('caching_sha2_password authentication plugin require node 11.6+')
        );
        done();
      });
  });

  it('cachingsha256 authentication plugin with ssl', function (done) {
    if (
      process.env.MAXSCALE_TEST_DISABLE ||
      shareConn.info.isMariaDB() ||
      !shareConn.info.hasMinVersion(8, 0, 0)
    )
      this.skip();

    const self = this;
    shareConn
      .query("SHOW VARIABLES LIKE 'have_ssl'")
      .then((rows) => {
        // console.log("ssl is not enable on database, skipping test :");
        if (rows[0].Value === 'YES') {
          base
            .createConnection({
              user: 'cachingSha256User3',
              password: 'password',
              ssl: {
                rejectUnauthorized: false
              }
            })
            .then((conn) => {
              conn.end();
              done();
            })
            .catch((err) => {
              if (
                err.message.includes(
                  'caching_sha2_password authentication plugin require node 11.6+'
                )
              )
                self.skip();
              done();
            });
        } else {
          self.skip();
        }
      })
      .catch(done);
  });
});
