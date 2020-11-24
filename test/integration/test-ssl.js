'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const fs = require('fs');
const Conf = require('../conf');
const tls = require('tls');

describe('ssl', function () {
  let ca = Conf.baseConfig.ssl && Conf.baseConfig.ssl.ca ? Conf.baseConfig.ssl.ca : null;
  let clientKey = null;
  let clientCert = null;
  let clientKeystore = null;
  let sslEnable = false;
  let sslPort = Conf.baseConfig.port;

  before(function (done) {
    if (process.env.TEST_SSL_PORT) sslPort = parseInt(process.env.TEST_SSL_PORT);
    if (
      tls.DEFAULT_MIN_VERSION === 'TLSv1.2' &&
      ((process.platform === 'win32' &&
        shareConn.info.isMariaDB() &&
        !shareConn.info.hasMinVersion(10, 4, 0)) ||
        (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(8, 0, 0)))
    ) {
      //TLSv1.2 is supported on windows only since MariaDB 10.4
      //TLSv1.2 is supported in MySQL only since 8.0 (unix/windows)
      //so if testing with Node.js 12, force possible TLS1.1
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 7, 0)) {
        //MySQL 5.5 and MySQL 5.6 needs TLSv1
        tls.DEFAULT_MIN_VERSION = 'TLSv1';
      } else {
        tls.DEFAULT_MIN_VERSION = 'TLSv1.1';
      }
    }

    let serverCaFile =
      Conf.baseConfig.ssl && Conf.baseConfig.ssl.ca ? null : process.env.TEST_SSL_CA_FILE;
    let clientKeyFileName = process.env.TEST_SSL_CLIENT_KEY_FILE;
    let clientCertFileName = process.env.TEST_SSL_CLIENT_CERT_FILE;
    let clientKeystoreFileName = process.env.TEST_SSL_CLIENT_KEYSTORE_FILE;

    if (
      !serverCaFile &&
      (Conf.baseConfig.host === 'localhost' || Conf.baseConfig.host === 'mariadb.example.com')
    ) {
      try {
        if (fs.existsSync('../../ssl')) {
          serverCaFile = '../../ssl/server.crt';
          clientKeyFileName = '../../ssl/client.key';
          clientCertFileName = '../../ssl/client.crt';
          clientKeystoreFileName = '../../ssl/fullclient-keystore.p12';
        }
      } catch (err) {
        console.error(err);
      }
    }

    if (serverCaFile) ca = [fs.readFileSync(serverCaFile, 'utf8')];
    if (clientKeyFileName) clientKey = [fs.readFileSync(clientKeyFileName, 'utf8')];
    if (clientCertFileName) clientCert = [fs.readFileSync(clientCertFileName, 'utf8')];
    if (clientKeystoreFileName) clientKeystore = [fs.readFileSync(clientKeystoreFileName)];

    shareConn
      .query("DROP USER IF EXISTS 'sslTestUser'@'%'")
      .then(() => {
        return shareConn.query("DROP USER IF EXISTS 'X509testUser'@'%'");
      })
      .then(() => {
        return shareConn.query(
          "CREATE USER 'sslTestUser'@'%' IDENTIFIED BY 'ytoKS@ç%ùed5' " +
            ((shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 2, 0)) ||
            (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(5, 7, 0))
              ? ' REQUIRE SSL'
              : '')
        );
      })
      .then(() => {
        return shareConn.query(
          "GRANT SELECT ON *.* TO 'sslTestUser'@'%' " +
            ((shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(10, 2, 0)) ||
            (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 7, 0))
              ? ' REQUIRE SSL'
              : '')
        );
      })
      .then(() => {
        return shareConn.query(
          "CREATE USER 'X509testUser'@'%' IDENTIFIED BY 'éà@d684SQpl¨^' " +
            ((shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 2, 0)) ||
            (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(5, 7, 0))
              ? ' REQUIRE X509'
              : '')
        );
      })
      .then(() => {
        return shareConn.query(
          "GRANT SELECT ON *.* TO 'X509testUser'@'%' " +
            ((shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(10, 2, 0)) ||
            (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 7, 0))
              ? ' REQUIRE X509'
              : '')
        );
      })
      .then(() => {
        if (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8)) {
          return shareConn.query(
            "ALTER USER 'sslTestUser'@'%' IDENTIFIED WITH 'mysql_native_password' BY 'ytoKS@ç%ùed5'"
          );
        }
        return shareConn.query("SET PASSWORD FOR 'sslTestUser'@'%' = PASSWORD('ytoKS@ç%ùed5')");
      })
      .then(() => {
        if (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8)) {
          return shareConn.query(
            "ALTER USER 'X509testUser'@'%' IDENTIFIED WITH 'mysql_native_password' BY 'éà@d684SQpl¨^'"
          );
        }
        return shareConn.query("SET PASSWORD FOR 'X509testUser'@'%' = PASSWORD('éà@d684SQpl¨^')");
      })
      .then(() => {
        return shareConn.query('FLUSH PRIVILEGES');
      })
      .then(() => {
        return shareConn.query("SHOW VARIABLES LIKE 'have_ssl'");
      })
      .then((rows) => {
        if (rows[0].Value === 'YES') {
          sslEnable = true;
          done();
        } else {
          //ssl is not enable on database, skipping test.
          shareConn
            .query("SHOW VARIABLES LIKE '%ssl%'")
            .then((rows) => {
              // console.log("ssl is not enable on database, skipping test :");
              // for (let i = 0; i < rows.length; i++) {
              //   console.log(rows[0]["Variable_name"] + " = " + rows[0]["Value"]);
              // }
              done();
            })
            .catch(done);
        }
      })
      .catch(done);
  });

  it('signed certificate error ', function (done) {
    if (!sslEnable) this.skip();
    base
      .createConnection({
        user: 'sslTestUser',
        password: 'ytoKS@ç%ùed5',
        ssl: true,
        port: sslPort
      })
      .then((conn) => {
        conn.end();
        done(new Error('Must have thrown an exception !'));
      })
      .catch((err) => {
        assert(err.message.includes('self signed certificate'));
        done();
      });
  });

  it('signed certificate forcing', function (done) {
    if (!sslEnable) this.skip();
    base
      .createConnection({ ssl: { rejectUnauthorized: false }, port: sslPort })
      .then((conn) => {
        conn.end();
        done();
      })
      .catch(done);
  });

  it('ensure connection use SSL ', function (done) {
    if (!sslEnable) this.skip();
    if (!base.utf8Collation()) this.skip();
    base
      .createConnection({
        user: 'sslTestUser',
        password: 'ytoKS@ç%ùed5',
        ssl: { rejectUnauthorized: false },
        port: sslPort
      })
      .then((conn) => {
        conn.end();
        done();
      })
      .catch((err) => {
        console.log(err);
        done(err);
      });
  });

  it('SSLv3 disable', function (done) {
    if (!sslEnable) this.skip();
    base
      .createConnection({
        ssl: {
          rejectUnauthorized: false,
          secureProtocol: 'SSLv3_client_method'
        },
        port: sslPort
      })
      .then((conn) => {
        conn.end();
        done(new Error('Must have thrown an exception !'));
      })
      .catch((err) => {
        assert(err.message.includes('SSLv3 methods disabled'));
        done();
      });
  });

  it('SSLv2 disable', function (done) {
    if (!sslEnable) this.skip();
    base
      .createConnection({
        ssl: { rejectUnauthorized: false, secureProtocol: 'SSLv2_method' },
        port: sslPort
      })
      .then((conn) => {
        conn.end();
        done(new Error('Must have thrown an exception !'));
      })
      .catch((err) => {
        assert(err.message.includes('SSLv2 methods disabled'));
        done();
      });
  });

  it('TLSv1 working', function (done) {
    if (
      !sslEnable ||
      (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 3, 0)) ||
      (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0)) ||
      shareConn.info.serverVersion.raw.includes('focal')
    ) {
      this.skip();
      return;
    }
    base
      .createConnection({
        ssl: { rejectUnauthorized: false, secureProtocol: 'TLSv1_method' },
        port: sslPort
      })
      .then((conn) => {
        checkProtocol(conn, 'TLSv1');
        conn.end();
        done();
      })
      .catch(done);
  });

  it('TLSv1.1 working', function (done) {
    if (
      !sslEnable ||
      (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 3, 0)) ||
      (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0)) ||
      shareConn.info.serverVersion.raw.includes('focal')
    ) {
      this.skip();
      return;
    }
    base
      .createConnection({
        ssl: { rejectUnauthorized: false, secureProtocol: 'TLSv1_1_method' },
        port: sslPort
      })
      .then((conn) => {
        checkProtocol(conn, 'TLSv1.1');
        conn.end();
        done();
      })
      .catch(done);
  });

  it('TLSv1.1 with permit cipher', function (done) {
    if (
      !sslEnable ||
      process.env.SKYSQL ||
      process.env.SKYSQL_HA ||
      (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 4, 0)) ||
      (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0)) ||
      shareConn.info.serverVersion.raw.includes('focal')
    ) {
      this.skip();
      return;
    }
    base
      .createConnection({
        ssl: {
          rejectUnauthorized: false,
          secureProtocol: 'TLSv1_1_method',
          ciphers:
            'DHE-RSA-AES256-SHA:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256'
        },
        port: sslPort
      })
      .then((conn) => {
        checkProtocol(conn, 'TLSv1.1');
        conn.end();
        done();
      })
      .catch((err) => {
        console.log(err);
        done(err);
      });
  });

  it('TLSv1.1 no common cipher', function (done) {
    if (!sslEnable) this.skip();
    if (
      !shareConn.info.isMariaDB() &&
      (!shareConn.info.hasMinVersion(5, 7, 10) || shareConn.info.hasMinVersion(8, 0, 0))
    ) {
      this.skip();
      return;
    }
    base
      .createConnection({
        ssl: {
          rejectUnauthorized: false,
          secureProtocol: 'TLSv1_1_method',
          ciphers: 'ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256'
        },
        port: sslPort
      })
      .then((conn) => {
        conn.end();
        done(new Error('Must have thrown an exception !'));
      })
      .catch((err) => {
        assert(err.message.includes('no ciphers available'));
        done();
      });
  });

  it('TLSv1.1 wrong cipher', function (done) {
    if (!sslEnable) this.skip();
    if (
      !shareConn.info.isMariaDB() &&
      (!shareConn.info.hasMinVersion(5, 7, 10) || shareConn.info.hasMinVersion(8, 0, 0))
    ) {
      this.skip();
      return;
    }

    base
      .createConnection({
        ssl: {
          rejectUnauthorized: false,
          secureProtocol: 'TLSv1_1_method',
          ciphers: 'ECDHE-ECDSA-AES256-STRANGE'
        },
        port: sslPort
      })
      .then((conn) => {
        conn.end();
        done(new Error('Must have thrown an exception !'));
      })
      .catch((err) => {
        assert(
          err.message.includes('no ciphers available') || err.message.includes('no cipher match')
        );
        done();
      });
  });

  it('TLSv1.2 working', function (done) {
    if (!sslEnable) this.skip();
    //MariaDB server doesn't permit TLSv1.2 on windows
    //MySQL community version doesn't support TLSv1.2
    const isWin = process.platform === 'win32';
    if (isWin || !shareConn.info.isMariaDB()) this.skip();

    base
      .createConnection({
        ssl: { rejectUnauthorized: false, secureProtocol: 'TLSv1_2_method' },
        port: sslPort
      })
      .then((conn) => {
        checkProtocol(conn, 'TLSv1.2');
        conn.end();
        done();
      })
      .catch(done);
  });

  it('TLSv1.2 with cipher working', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE) this.skip();
    if (!sslEnable) this.skip();
    //MariaDB server doesn't permit TLSv1.2 on windows
    //MySQL community version doesn't support TLSv1.2
    const isWin = process.platform === 'win32';
    if (!shareConn.info.isMariaDB() || (isWin && !shareConn.info.hasMinVersion(10, 4, 2))) {
      this.skip();
    }

    base
      .createConnection({
        ssl: {
          rejectUnauthorized: false,
          secureProtocol: 'TLSv1_2_method',
          ciphers:
            'DHE-RSA-AES256-SHA:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256'
        },
        port: sslPort
      })
      .then((conn) => {
        checkProtocol(conn, 'TLSv1.2');
        conn.end();
        done();
      })
      .catch(done);
  });

  it('CA provided ignoring name verification', function (done) {
    if (!sslEnable) this.skip();
    if (!ca) this.skip();
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 7, 10)) this.skip();
    if (Conf.baseConfig.host !== 'localhost') this.skip();

    base
      .createConnection({
        ssl: {
          ca: ca,
          checkServerIdentity: (servername, cert) => {
            return;
          }
        },
        port: sslPort
      })
      .then((conn) => {
        conn.end();
        done();
      })
      .catch(done);
  });

  it('CA name verification error', function (done) {
    if (!sslEnable) this.skip();
    if (!ca) this.skip();
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 7, 10)) this.skip();
    if (Conf.baseConfig.host !== 'localhost') this.skip();

    base
      .createConnection({ host: '127.0.0.1', ssl: { ca: ca } })
      .then(() => {
        done(new Error('Must have thrown an exception !'));
      })
      .catch((err) => {
        assert(
          err.message.includes("Hostname/IP doesn't match certificate's altnames") ||
            err.message.includes("Hostname/IP does not match certificate's altnames"),
          'error was : ' + err.message
        );
        assert(
          err.message.includes("IP: 127.0.0.1 is not in the cert's list"),
          'error was : ' + err.message
        );

        done();
      });
  });

  it('CA provided with matching cn', function (done) {
    if (Conf.baseConfig.host !== 'localhost' && Conf.baseConfig.host !== 'mariadb.example.com')
      this.skip();
    if (!sslEnable) this.skip();
    if (!ca) this.skip();
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 7, 10)) this.skip();

    base
      .createConnection({ host: 'mariadb.example.com', ssl: { ca: ca }, port: sslPort })
      .then((conn) => {
        const isWin = process.platform === 'win32';
        let expectedProtocol = ['TLSv1.2', 'TLSv1.3'];
        if (shareConn.info.isMariaDB()) {
          if (isWin && !shareConn.info.hasMinVersion(10, 4, 0)) {
            expectedProtocol = 'TLSv1.1';
          }
        } else if (!shareConn.info.hasMinVersion(5, 7, 28)) {
          expectedProtocol = 'TLSv1.1';
        }
        checkProtocol(conn, expectedProtocol);
        conn.end();
        done();
      })
      .catch(done);
  });

  it('Mutual authentication without providing client certificate', function (done) {
    if (!sslEnable) this.skip();
    if (!ca) this.skip();

    base
      .createConnection({
        user: 'X509testUser',
        password: 'éà@d684SQpl¨^',
        host: 'mariadb.example.com',
        ssl: { ca: ca },
        port: sslPort
      })
      .then((conn) => {
        conn.end();
        if (!process.env.MAXSCALE_TEST_DISABLE) {
          done(new Error('Must have thrown an exception !'));
        } else {
          done();
        }
      })
      .catch((err) => {
        done();
      });
  });

  it('Mutual authentication providing client certificate', function (done) {
    if (process.env.SKYSQL || process.env.SKYSQL_HA) this.skip();
    if (!sslEnable) this.skip();
    if (!ca || !clientKey || !clientCert) this.skip();
    if (!base.utf8Collation()) this.skip();

    base
      .createConnection({
        user: 'X509testUser',
        password: 'éà@d684SQpl¨^',
        host: 'mariadb.example.com',
        ssl: {
          ca: ca,
          cert: clientCert,
          key: clientKey
        },
        port: sslPort
      })
      .then((conn) => {
        conn.end();
        done();
      })
      .catch(done);
  });

  it('Mutual authentication providing client keystore', function (done) {
    if (process.env.SKYSQL || process.env.SKYSQL_HA) this.skip();
    if (!sslEnable) this.skip();
    if (!ca || !clientKeystore) this.skip();
    if (!base.utf8Collation()) this.skip();

    base
      .createConnection({
        user: 'X509testUser',
        password: 'éà@d684SQpl¨^',
        host: 'mariadb.example.com',
        ssl: {
          ca: ca,
          pfx: clientKeystore,
          passphrase: 'kspass'
        },
        port: sslPort
      })
      .then((conn) => {
        conn.end();
        done();
      })
      .catch(done);
  });

  it('ssl change user', function (done) {
    if (process.env.MAXSCALE_TEST_DISABLE) this.skip();
    if (!shareConn.info.isMariaDB()) this.skip();
    if (!sslEnable) this.skip();
    let currUser;
    let conn;
    base
      .createConnection({
        ssl: { rejectUnauthorized: false },
        port: sslPort
      })
      .then((con) => {
        conn = con;
        conn.query("DROP USER IF EXISTS ChangeUser@'%'").catch((err) => {});
        conn.query('FLUSH PRIVILEGES');
        conn.query("CREATE USER ChangeUser@'%' IDENTIFIED BY 'mySupPassw@rd2'");
        conn.query("GRANT SELECT ON *.* TO ChangeUser@'%' with grant option");
        return conn.query('FLUSH PRIVILEGES');
      })
      .then(() => {
        conn
          .query('SELECT CURRENT_USER')
          .then((res) => {
            currUser = res[0]['CURRENT_USER'];
            return conn.changeUser({
              user: 'ChangeUser',
              password: 'mySupPassw@rd2',
              connectAttributes: { par1: 'bouh', par2: 'bla' }
            });
          })
          .then(() => {
            return conn.query('SELECT CURRENT_USER');
          })
          .then((res) => {
            const user = res[0]['CURRENT_USER'];
            assert.equal(user, 'ChangeUser@%');
            assert(user !== currUser);
            conn.query("DROP USER ChangeUser@'%'");
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });
});

function checkProtocol(conn, protocol) {
  const ver = process.version.substring(1).split('.');
  const currentProtocol = conn.__tests.getSocket().getProtocol();

  if (ver[0] > 5 || (ver[0] == 5 && ver[1] == 7)) {
    if (Array.isArray(protocol)) {
      for (let i = 0; i < protocol.length; i++) {
        if (currentProtocol === protocol[i]) return;
      }
      //throw error
      assert.equal(currentProtocol, protocol);
      return;
    }
    assert.equal(currentProtocol, protocol);
  }
}
