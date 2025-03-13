//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const Conf = require('../conf');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isMaxscale } = require('../base');

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

    await shareConn.query("DROP USER IF EXISTS 'sha256User'@'%'").catch((e) => {});
    await shareConn.query("DROP USER IF EXISTS 'cachingSha256User'@'%'").catch((e) => {});
    await shareConn.query("DROP USER IF EXISTS 'cachingSha256User2'@'%'").catch((e) => {});
    await shareConn.query("DROP USER IF EXISTS 'cachingSha256User3'@'%'").catch((e) => {});
    await shareConn.query("DROP USER IF EXISTS 'cachingSha256User4'@'%'").catch((e) => {});

    if (!shareConn.info.isMariaDB()) {
      if (shareConn.info.hasMinVersion(8, 0, 0)) {
        await shareConn.query("CREATE USER 'sha256User'@'%' IDENTIFIED WITH sha256_password BY 'password'");
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
        await shareConn.query(
          "CREATE USER 'cachingSha256User4'@'%'  IDENTIFIED WITH caching_sha2_password BY 'password'"
        );
        await shareConn.query("GRANT ALL PRIVILEGES ON *.* TO 'cachingSha256User4'@'%'");
      } else {
        await shareConn.query("CREATE USER 'sha256User'@'%'");
        await shareConn.query(
          "GRANT ALL PRIVILEGES ON *.* TO 'sha256User'@'%' IDENTIFIED WITH sha256_password BY 'password'"
        );
      }
    }
  });

  it('ed25519 authentication plugin', async function () {
    if (isMaxscale()) this.skip();
    const self = this;
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 1, 22)) this.skip();

    const res = await shareConn.query('SELECT @@strict_password_validation as a');
    if (res[0].a === 1 && !shareConn.info.hasMinVersion(10, 4, 0)) self.skip();
    try {
      await shareConn.query("INSTALL SONAME 'auth_ed25519'");
      await shareConn.query("drop user IF EXISTS verificationEd25519AuthPlugin@'%'");
      if (shareConn.info.hasMinVersion(10, 4, 0)) {
        await shareConn.query(
          "CREATE USER verificationEd25519AuthPlugin@'%' IDENTIFIED " +
            "VIA ed25519 USING PASSWORD('MySup8%rPassw@ord')"
        );
      } else {
        await shareConn.query(
          "CREATE USER verificationEd25519AuthPlugin@'%' IDENTIFIED " +
            "VIA ed25519 USING '6aW9C7ENlasUfymtfMvMZZtnkCVlcb1ssxOLJ0kj/AA'"
        );
      }
      await shareConn.query(
        'GRANT SELECT on  `' + Conf.baseConfig.database + "`.* to verificationEd25519AuthPlugin@'%'"
      );
    } catch (e) {
      this.skip();
    }

    try {
      let conn = await base.createConnection({
        user: 'verificationEd25519AuthPlugin',
        password: 'MySup8%rPassw@ord'
      });
      await conn.changeUser({
        user: 'verificationEd25519AuthPlugin',
        password: 'MySup8%rPassw@ord'
      });
      conn.end();
      try {
        conn = await base.createConnection({
          user: 'verificationEd25519AuthPlugin',
          password: 'MySup8%rPassw@ord',
          restrictedAuth: ''
        });
        conn.end();
        throw new Error('must have thrown error');
      } catch (err) {
        assert.equal(err.text, 'Unsupported authentication plugin client_ed25519. Authorized plugin: ');
        assert.equal(err.errno, 45047);
        assert.equal(err.sqlState, '42000');
        assert.equal(err.code, 'ER_NOT_SUPPORTED_AUTH_PLUGIN');
        assert.isTrue(err.fatal);
      }
    } catch (err) {
      const expectedMsg = err.message.includes(
        "Client does not support authentication protocol 'client_ed25519' requested by server."
      );
      if (!expectedMsg) console.log(err);
      assert(expectedMsg);
    }
  });

  it('name pipe authentication plugin', function (done) {
    if (process.platform !== 'win32') this.skip();
    if (isMaxscale()) this.skip();
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 1, 11)) this.skip();
    if (Conf.baseConfig.host !== 'localhost' && Conf.baseConfig.host !== 'mariadb.example.com') this.skip();
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
    if (!process.env.LOCAL_SOCKET_AVAILABLE) this.skip();
    if (Conf.baseConfig.host !== 'localhost' && Conf.baseConfig.host !== 'mariadb.example.com') this.skip();

    shareConn
      .query('select @@version_compile_os,@@socket soc')
      .then((res) => {
        const unixUser = process.env.USER;
        if (!unixUser || unixUser === 'root') this.skip();
        console.log('unixUser:' + unixUser);
        shareConn.query("INSTALL PLUGIN unix_socket SONAME 'auth_socket'").catch((err) => {});
        shareConn.query('DROP USER IF EXISTS ' + unixUser);
        shareConn
          .query("CREATE USER '" + unixUser + "'@'" + Conf.baseConfig.host + "' IDENTIFIED VIA unix_socket")
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

  it('dialog authentication plugin', async function () {
    //pam is set using .travis/sql/pam.sh
    if (!process.env.TEST_PAM_USER) this.skip();

    if (!shareConn.info.isMariaDB()) this.skip();
    this.timeout(10000);
    try {
      await shareConn.query("INSTALL PLUGIN pam SONAME 'auth_pam'");
    } catch (error) {}
    try {
      await shareConn.query("DROP USER IF EXISTS '" + process.env.TEST_PAM_USER + "'@'%'");
    } catch (error) {}

    await shareConn.query("CREATE USER '" + process.env.TEST_PAM_USER + "'@'%' IDENTIFIED VIA pam USING 'mariadb'");
    await shareConn.query("GRANT SELECT ON *.* TO '" + process.env.TEST_PAM_USER + "'@'%' IDENTIFIED VIA pam");
    await shareConn.query('FLUSH PRIVILEGES');

    let testPort = Conf.baseConfig.port;
    if (process.env.TEST_PAM_PORT != null) {
      testPort = parseInt(process.env.TEST_PAM_PORT);
    }

    const conn = await base.createConnection({
      user: process.env.TEST_PAM_USER,
      password: process.env.TEST_PAM_PWD,
      port: testPort
    });
    await conn.end();
  });

  it('dialog authentication plugin multiple password', async function () {
    if (isMaxscale()) this.skip();
    //pam is set using .travis/sql/pam.sh
    if (!process.env.TEST_PAM_USER) this.skip();

    if (!shareConn.info.isMariaDB()) this.skip();
    this.timeout(10000);
    try {
      await shareConn.query("INSTALL PLUGIN pam SONAME 'auth_pam'");
    } catch (error) {}
    try {
      await shareConn.query("DROP USER IF EXISTS '" + process.env.TEST_PAM_USER + "'@'%'");
    } catch (error) {}
    try {
      await shareConn.query("DROP USER IF EXISTS '" + process.env.TEST_PAM_USER + "'@'localhost'");
    } catch (error) {}

    await shareConn.query("CREATE USER '" + process.env.TEST_PAM_USER + "'@'%' IDENTIFIED VIA pam USING 'mariadb'");
    await shareConn.query("GRANT SELECT ON *.* TO '" + process.env.TEST_PAM_USER + "'@'%' IDENTIFIED VIA pam");
    await shareConn.query(
      "CREATE USER '" + process.env.TEST_PAM_USER + "'@'localhost' IDENTIFIED VIA pam USING 'mariadb'"
    );
    await shareConn.query("GRANT SELECT ON *.* TO '" + process.env.TEST_PAM_USER + "'@'localhost' IDENTIFIED VIA pam");
    await shareConn.query('FLUSH PRIVILEGES');

    let testPort = Conf.baseConfig.port;
    if (process.env.TEST_PAM_PORT != null) {
      testPort = parseInt(process.env.TEST_PAM_PORT);
    }
    //password is unix password "myPwd"
    const conn = await base.createConnection({
      user: process.env.TEST_PAM_USER,
      password: [process.env.TEST_PAM_PWD, process.env.TEST_PAM_PWD],
      port: testPort
    });
    await conn.end();
  });

  it('multi authentication plugin', function (done) {
    if (isMaxscale()) this.skip();
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 4, 3)) this.skip();
    shareConn.query("drop user IF EXISTS mysqltest1@'%'").catch((err) => {});
    shareConn
      .query(
        "CREATE USER mysqltest1@'%' IDENTIFIED " +
          "VIA ed25519 as password('!Passw0rd3') " +
          " OR mysql_native_password as password('!Passw0rd3Works')"
      )
      .then(() => {
        return shareConn.query('grant SELECT on `' + Conf.baseConfig.database + "`.*  to mysqltest1@'%'");
      })
      .then(() => {
        return base.createConnection({
          user: 'mysqltest1',
          password: '!Passw0rd3'
        });
      })
      .then((conn) => {
        return conn.query("select '1'").then((res) => {
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
              .then(() => {
                conn.end();
                base
                  .createConnection({
                    user: 'mysqltest1',
                    password: '!Passw0rd3Wrong'
                  })
                  .then((conn) => {
                    conn.end();
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

  it('sha256 authentication plugin', async function () {
    if (!rsaPublicKey || shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(5, 7, 0)) this.skip();

    const self = this;
    try {
      const conn = await base.createConnection({
        user: 'sha256User',
        password: 'password',
        rsaPublicKey: rsaPublicKey
      });
      conn.end();
    } catch (err) {
      if (err.message.includes('sha256_password authentication plugin require node 11.6+')) self.skip();
      throw err;
    }

    try {
      const conn = await base.createConnection({
        user: 'sha256User',
        password: 'password',
        rsaPublicKey: '/wrongPath'
      });
      conn.end();
      throw new Error('must have thrown exception');
    } catch (err) {
      if (err.message.includes('sha256_password authentication plugin require node 11.6+')) self.skip();
      assert.isTrue(err.message.includes('wrongPath'));
    }

    const filePath = path.join(os.tmpdir(), 'RSA_tmp_file.txt');
    fs.writeFileSync(filePath, rsaPublicKey);
    try {
      const conn = await base.createConnection({
        user: 'sha256User',
        password: 'password',
        rsaPublicKey: filePath
      });
      conn.end();
    } catch (err) {
      if (err.message.includes('sha256_password authentication plugin require node 11.6+')) self.skip();
      throw err;
    }
    try {
      fs.unlinkSync(filePath);
    } catch (e) {}

    try {
      const conn = await base.createConnection({
        user: 'sha256User',
        rsaPublicKey: rsaPublicKey
      });
      conn.end();
      throw new Error('must have thrown exception');
    } catch (err) {
      if (err.message.includes('sha256_password authentication plugin require node 11.6+')) self.skip();
      assert.isTrue(err.message.includes('Access denied'));
    }
  });

  it('sha256 authentication plugin with public key retrieval', function (done) {
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
        if (err.message.includes('sha256_password authentication plugin require node 11.6+')) self.skip();
        done(err);
      });
  });

  it('sha256 authentication plugin without public key retrieval', function (done) {
    if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(5, 7, 0)) this.skip();

    base
      .createConnection({
        user: 'sha256User',
        password: 'password',
        allowPublicKeyRetrieval: false
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
    if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(5, 7, 0)) this.skip();

    const self = this;
    shareConn
      .query("SHOW VARIABLES LIKE 'have_ssl'")
      .then((rows) => {
        // console.log("ssl is not enable on database, skipping test :");
        if (rows.length === 0 || rows[0].Value === 'YES') {
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
              if (err.message.includes('sha256_password authentication plugin require node 11.6+')) self.skip();
              done(err);
            });
        } else {
          this.skip();
        }
      })
      .catch(done);
  });

  it('cachingsha256 authentication plugin', async function () {
    if (!rsaPublicKey || shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(8, 0, 0)) this.skip();

    const self = this;

    try {
      const conn = await base.createConnection({
        user: 'cachingSha256User4',
        password: 'password',
        cachingRsaPublicKey: '/wrongPath'
      });
      conn.end();
      throw new Error('must have thrown exception');
    } catch (err) {
      if (err.message.includes('sha256_password authentication plugin require node 11.6+')) self.skip();
      assert.isTrue(err.message.includes('wrongPath'));
    }

    const filePath = path.join(os.tmpdir(), 'RSA_tmp_file.txt');
    fs.writeFileSync(filePath, rsaPublicKey);
    try {
      const conn = await base.createConnection({
        user: 'cachingSha256User4',
        password: 'password',
        cachingRsaPublicKey: filePath
      });
      conn.end();
    } catch (err) {
      if (err.message.includes('sha256_password authentication plugin require node 11.6+')) self.skip();
      throw err;
    }
    try {
      fs.unlinkSync(filePath);
    } catch (e) {}

    try {
      const conn = await base.createConnection({
        user: 'cachingSha256User',
        cachingRsaPublicKey: rsaPublicKey
      });
      conn.end();
      throw new Error('must have thrown exception');
    } catch (err) {
      if (err.message.includes('sha256_password authentication plugin require node 11.6+')) self.skip();
      assert.isTrue(err.message.includes('Access denied'));
    }

    try {
      const conn = await base.createConnection({
        user: 'cachingSha256User',
        password: 'password',
        cachingRsaPublicKey: rsaPublicKey
      });
      conn.end();
    } catch (e) {
      throw e;
    }

    try {
      const conn = await base.createConnection({
        user: 'cachingSha256User',
        password: 'password',
        cachingRsaPublicKey: rsaPublicKey
      });
      conn.end();
    } catch (e) {
      throw e;
    }
  });

  it('cachingsha256 authentication plugin with public key retrieval', async function () {
    if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(8, 0, 0)) this.skip();
    // request files since 5.7.40 / 8.0.31 fails when requesting public key
    if (
      !shareConn.info.isMariaDB() &&
      ((!shareConn.info.hasMinVersion(8, 0, 0) && shareConn.info.hasMinVersion(5, 7, 40)) ||
        shareConn.info.hasMinVersion(8, 0, 31))
    )
      this.skip();

    const self = this;
    try {
      const conn = await base.createConnection({
        user: 'cachingSha256User2',
        password: 'password',
        allowPublicKeyRetrieval: true
      });
      conn.end();
    } catch (err) {
      if (err.message.includes('caching_sha2_password authentication plugin require node 11.6+')) self.skip();
      throw err;
    }
    const conn = await base.createConnection({
      user: 'cachingSha256User2',
      password: 'password'
    });
    conn.end();
  });

  it('cachingsha256 authentication plugin without public key retrieval', function (done) {
    if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(8, 0, 0)) this.skip();

    base
      .createConnection({
        user: 'cachingSha256User3',
        password: 'password',
        allowPublicKeyRetrieval: false
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
    if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(8, 0, 0)) this.skip();

    const self = this;
    shareConn
      .query("SHOW VARIABLES LIKE 'have_ssl'")
      .then((rows) => {
        // console.log("ssl is not enable on database, skipping test :");
        if (rows.length === 0 || rows[0].Value === 'YES') {
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
              if (err.message.includes('caching_sha2_password authentication plugin require node 11.6+')) self.skip();
              done();
            });
        } else {
          self.skip();
        }
      })
      .catch(done);
  });

  it('parsec authentication plugin', async function () {
    if (isMaxscale()) this.skip();
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(11, 6, 1)) this.skip();
    try {
      await shareConn.query("INSTALL SONAME 'auth_parsec'");
    } catch (e) {
      this.skip();
    }

    await shareConn.query("drop user verifParsec@'%'").catch(() => {});
    await shareConn.query("CREATE USER verifParsec@'%' IDENTIFIED VIA parsec USING PASSWORD('MySup8%rPassw@ord')");
    await shareConn.query('GRANT SELECT on `' + Conf.baseConfig.database + "`.* to verifParsec@'%'");

    await shareConn.query("drop user verifParsec2@'%'").catch(() => {});
    await shareConn.query("CREATE USER verifParsec2@'%' IDENTIFIED VIA parsec USING PASSWORD('')");
    await shareConn.query('GRANT SELECT on `' + Conf.baseConfig.database + "`.* to verifParsec2@'%'");

    let conn = await base.createConnection({
      user: 'verifParsec',
      password: 'MySup8%rPassw@ord'
    });
    await conn.changeUser({
      user: 'verifParsec',
      password: 'MySup8%rPassw@ord'
    });
    conn.end();

    // disable until https://jira.mariadb.org/browse/MDEV-34854
    // conn = await base.createConnection({
    //   user: 'verifParsec2',
    //   password: ''
    // });
    // conn.end();

    try {
      conn = await base.createConnection({
        user: 'verifParsec',
        password: 'MySup8%rPassw@ord',
        restrictedAuth: ''
      });
      conn.end();
      throw new Error('must have thrown error');
    } catch (err) {
      assert.equal(err.text, 'Unsupported authentication plugin parsec. Authorized plugin: ');
      assert.equal(err.errno, 45047);
      assert.equal(err.sqlState, '42000');
      assert.equal(err.code, 'ER_NOT_SUPPORTED_AUTH_PLUGIN');
      assert.isTrue(err.fatal);
    }

    // adding ssl test, since zero ssl must work automagically
    conn = await base.createConnection({
      user: 'verifParsec',
      password: 'MySup8%rPassw@ord',
      ssl: true
    });
    conn.end();
  });
});
