//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const fs = require('fs');
const Conf = require('../conf');
const tls = require('tls');
const { isXpand } = require('../base');
const crypto = require('crypto');
const errors = require('../../lib/misc/errors');

describe('ssl', function () {
  let ca = Conf.baseConfig.ssl && Conf.baseConfig.ssl.ca ? Conf.baseConfig.ssl.ca : null;
  let clientKey = null;
  let clientCert = null;
  let clientKeystore = null;
  let sslEnable = false;
  let sslPort = Conf.baseConfig.port;

  before(function (done) {
    if (isXpand()) this.skip();
    if (process.env.TEST_MAXSCALE_TLS_PORT) sslPort = parseInt(process.env.TEST_MAXSCALE_TLS_PORT);
    if (
      tls.DEFAULT_MIN_VERSION === 'TLSv1.2' &&
      ((process.platform === 'win32' && shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(10, 4, 0)) ||
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

    let serverCaFile = Conf.baseConfig.ssl && Conf.baseConfig.ssl.ca ? null : process.env.TEST_DB_SERVER_CERT;
    let clientKeyFileName = process.env.TEST_DB_CLIENT_KEY;
    let clientCertFileName = process.env.TEST_DB_CLIENT_CERT;
    let clientKeystoreFileName = process.env.TEST_DB_CLIENT_PKCS;

    if (!serverCaFile && (Conf.baseConfig.host === 'localhost' || Conf.baseConfig.host === 'mariadb.example.com')) {
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

    shareConn.query("DROP USER 'sslTestUser'@'%'").catch((e) => {});
    shareConn.query("DROP USER 'X509testUser'@'%'").catch((e) => {});
    shareConn
      .query(
        "CREATE USER 'sslTestUser'@'%' IDENTIFIED BY 'ytoKS@ç%ùed5' " +
          ((shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 2, 0)) ||
          (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(5, 7, 0))
            ? ' REQUIRE SSL'
            : '')
      )
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
        if (rows.length > 0 && rows[0].Value === 'YES') {
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

  it('error when server ssl is disable', async function () {
    if (sslEnable || process.env.srv === 'skysql-ha') {
      this.skip();
      return;
    }
    try {
      await base.createConnection({
        ssl: { rejectUnauthorized: false },
        port: sslPort
      });
      throw new Error('Must have thrown an exception !');
    } catch (err) {
      assert.equal(err.errno, 45023);
      assert.equal(err.code, 'ER_SERVER_SSL_DISABLED');
    }
  });

  it('signed certificate error', async function () {
    if (!sslEnable) this.skip();
    let conn = null;

    // skip for ephemeral, since will succeed
    if (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(11, 4, 0)) this.skip();
    try {
      conn = await base.createConnection({
        user: 'sslTestUser',
        password: 'ytoKS@ç%ùed5',
        ssl: true,
        port: sslPort
      });
      await validConnection(conn);
      throw new Error('Must have thrown an exception !');
    } catch (err) {
      assert(
        err.message.includes('self signed certificate') ||
          err.message.includes('self-signed certificate') ||
          err.message.includes('unable to get local issuer certificate') ||
          err.message.includes('unable to verify the first certificate'),
        err.message
      );
    } finally {
      if (conn != null) conn.end();
    }
  });

  it('signed certificate error with ephemeral', async function () {
    if (!sslEnable) this.skip();
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(11, 4, 0)) this.skip();
    let conn = null;
    try {
      conn = await base.createConnection({
        user: 'sslTestUser',
        password: 'ytoKS@ç%ùed5',
        ssl: true,
        port: sslPort
      });
      await validConnection(conn);
      // if not ephemeral certificate must throw error
      if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(11, 4, 0)) {
        throw new Error('Must have thrown an exception !');
      }
    } finally {
      if (conn != null) conn.end();
    }
  });

  it('signed certificate forcing', async function () {
    if (!sslEnable) this.skip();
    const conn = await base.createConnection({ ssl: { rejectUnauthorized: false }, port: sslPort });
    await validConnection(conn);
    await conn.end();
  });

  it('self signed certificate server before ephemeral', async function () {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha') this.skip();
    if (!sslEnable) this.skip();

    // test will work either because server certificate chain is trusted (not don in tests)
    // or using mariadb ephemeral certificate validation
    if (!shareConn.info.isMariaDB() || shareConn.info.hasMinVersion(11, 4, 0)) this.skip();
    try {
      await base.createConnection({ ssl: true, port: sslPort });
      throw new Error('must have thrown error');
    } catch (e) {
      assert.equal(e.errno, errors.ER_SELF_SIGNED);
    }
  });

  it('self signed certificate forcing no password', async function () {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha') this.skip();
    if (!sslEnable) this.skip();

    // test will work either because server certificate chain is trusted (not done in tests)
    // or using mariadb ephemeral certificate validation
    if (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(11, 4, 0)) this.skip();
    if (Conf.baseConfig.password) this.skip();
    try {
      await base.createConnection({ ssl: true, port: sslPort });
      throw new Error('must have thrown error');
    } catch (e) {
      assert.equal(e.errno, errors.ER_SELF_SIGNED);
    }
  });

  it('self signed certificate forcing with password ssl:true', async function () {
    if (
      process.env.srv === 'maxscale' ||
      process.env.srv === 'skysql-ha' ||
      process.env.srv === 'mariadb-es' ||
      process.env.srv === 'mariadb-es-test'
    )
      this.skip();
    if (!sslEnable) this.skip();

    // test will work either because server certificate chain is trusted (not don in tests)
    // or using mariadb ephemeral certificate validation
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(11, 4, 0)) this.skip();
    if (!Conf.baseConfig.password) this.skip();
    const conn = await base.createConnection({
      user: 'sslTestUser',
      password: 'ytoKS@ç%ùed5',
      ssl: true,
      port: sslPort
    });
    await validConnection(conn);
    await conn.end();
  });

  it('self signed certificate forcing with password ssl: {rejectUnauthorized: true}', async function () {
    if (
      process.env.srv === 'maxscale' ||
      process.env.srv === 'skysql-ha' ||
      process.env.srv === 'mariadb-es' ||
      process.env.srv === 'mariadb-es-test'
    )
      this.skip();
    if (!sslEnable) this.skip();

    // test will work either because server certificate chain is trusted (not done in tests)
    // or using mariadb ephemeral certificate validation
    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(11, 4, 0)) this.skip();
    if (!Conf.baseConfig.password) this.skip();

    const conn = await base.createConnection({
      user: 'sslTestUser',
      password: 'ytoKS@ç%ùed5',
      ssl: { rejectUnauthorized: true },
      port: sslPort
    });
    await validConnection(conn);
    await conn.end();
  });

  it('ensure connection use SSL ', async function () {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha') this.skip();
    if (!sslEnable) this.skip();
    if (!base.utf8Collation()) this.skip();
    const conn = await base.createConnection({
      user: 'sslTestUser',
      password: 'ytoKS@ç%ùed5',
      ssl: { rejectUnauthorized: false },
      port: sslPort
    });
    await validConnection(conn);
    conn.end();
  });

  it('SSLv3 disable', async function () {
    if (!sslEnable) this.skip();
    try {
      await base.createConnection({
        ssl: {
          rejectUnauthorized: false,
          secureProtocol: 'SSLv3_client_method'
        },
        port: sslPort
      });
      throw new Error('Must have thrown an exception !');
    } catch (err) {
      assert(err.message.includes('SSLv3 methods disabled'));
    }
  });

  it('SSLv2 disable', async function () {
    if (!sslEnable) this.skip();
    try {
      await base.createConnection({
        ssl: { rejectUnauthorized: false, secureProtocol: 'SSLv2_method' },
        port: sslPort
      });
      throw new Error('Must have thrown an exception !');
    } catch (err) {
      assert(err.message.includes('SSLv2 methods disabled'));
    }
  });

  it('TLSv1 working', async function () {
    if (
      !sslEnable ||
      (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 3, 0)) ||
      (!shareConn.info.isMariaDB() &&
        (shareConn.info.hasMinVersion(8, 0, 0) || shareConn.info.hasMinVersion(5, 7, 43))) ||
      shareConn.info.serverVersion.raw.includes('focal')
    ) {
      this.skip();
      return;
    }
    const conn = await base.createConnection({
      ssl: { rejectUnauthorized: false, secureProtocol: 'TLSv1_method' },
      port: sslPort
    });
    checkProtocol(conn, 'TLSv1');
    conn.end();
  });

  it('TLSv1.1 working', async function () {
    if (
      !sslEnable ||
      (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 3, 0)) ||
      (!shareConn.info.isMariaDB() &&
        (shareConn.info.hasMinVersion(8, 0, 0) || shareConn.info.hasMinVersion(5, 7, 43))) ||
      shareConn.info.serverVersion.raw.includes('focal')
    ) {
      this.skip();
      return;
    }
    const conn = await base.createConnection({
      ssl: { rejectUnauthorized: false, secureProtocol: 'TLSv1_1_method' },
      port: sslPort
    });
    checkProtocol(conn, 'TLSv1.1');
    conn.end();
  });

  it('TLSv1.1 with permit cipher', async function () {
    if (
      !sslEnable ||
      process.env.srv === 'skysql' ||
      process.env.srv === 'skysql-ha' ||
      (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 4, 0)) ||
      (!shareConn.info.isMariaDB() &&
        (shareConn.info.hasMinVersion(8, 0, 0) || shareConn.info.hasMinVersion(5, 7, 43))) ||
      shareConn.info.serverVersion.raw.includes('focal')
    ) {
      this.skip();
      return;
    }
    const conn = await base.createConnection({
      ssl: {
        rejectUnauthorized: false,
        secureProtocol: 'TLSv1_1_method',
        ciphers:
          'DHE-RSA-AES256-SHA:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256'
      },
      port: sslPort
    });
    checkProtocol(conn, 'TLSv1.1');
    conn.end();
  });

  it('TLSv1.1 no common cipher', async function () {
    if (!sslEnable) this.skip();
    if (
      !shareConn.info.isMariaDB() &&
      (!shareConn.info.hasMinVersion(5, 7, 10) || shareConn.info.hasMinVersion(8, 0, 0))
    ) {
      this.skip();
      return;
    }
    try {
      await base.createConnection({
        ssl: {
          rejectUnauthorized: false,
          secureProtocol: 'TLSv1_1_method',
          ciphers: 'ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256'
        },
        port: sslPort
      });
      throw new Error('Must have thrown an exception !');
    } catch (err) {
      assert(err.message.includes('no ciphers available'));
    }
  });

  it('TLSv1.1 wrong cipher', async function () {
    if (!sslEnable) this.skip();
    if (
      !shareConn.info.isMariaDB() &&
      (!shareConn.info.hasMinVersion(5, 7, 10) || shareConn.info.hasMinVersion(8, 0, 0))
    ) {
      this.skip();
      return;
    }

    try {
      await base.createConnection({
        ssl: {
          rejectUnauthorized: false,
          secureProtocol: 'TLSv1_1_method',
          ciphers: 'ECDHE-ECDSA-AES256-STRANGE'
        },
        port: sslPort
      });
      throw new Error('Must have thrown an exception !');
    } catch (err) {
      assert(err.message.includes('no ciphers available') || err.message.includes('no cipher match'));
    }
  });

  it('TLSv1.2 working', async function () {
    if (!sslEnable) this.skip();
    //MariaDB server doesn't permit TLSv1.2 on windows
    //MySQL community version doesn't support TLSv1.2
    const isWin = process.platform === 'win32';
    if (isWin || !shareConn.info.isMariaDB()) this.skip();

    const conn = await base.createConnection({
      ssl: { rejectUnauthorized: false, secureProtocol: 'TLSv1_2_method' },
      port: sslPort
    });
    checkProtocol(conn, 'TLSv1.2');
    await conn.end();
  });

  it('TLSv1.2 with cipher working', async function () {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha') this.skip();
    if (!sslEnable) this.skip();
    //MariaDB server doesn't permit TLSv1.2 on windows
    //MySQL community version doesn't support TLSv1.2
    const isWin = process.platform === 'win32';
    if (!shareConn.info.isMariaDB() || (isWin && !shareConn.info.hasMinVersion(10, 4, 2))) {
      this.skip();
    }

    const conn = await base.createConnection({
      ssl: {
        rejectUnauthorized: false,
        secureProtocol: 'TLSv1_2_method',
        secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
        ciphers:
          'DHE-RSA-AES256-SHA:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256'
      },
      port: sslPort
    });
    checkProtocol(conn, 'TLSv1.2');
    await validConnection(conn);
    conn.end();
  });

  it('CA provided ignoring name verification', async function () {
    if (!sslEnable) this.skip();
    if (!ca) this.skip();
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 7, 10)) this.skip();
    if (Conf.baseConfig.host !== 'localhost') this.skip();

    const conn = await base.createConnection({
      ssl: {
        ca: ca,
        checkServerIdentity: (servername, cert) => {
          return;
        }
      },
      port: sslPort
    });
    await validConnection(conn);
    conn.end();
  });

  it('CA name verification error', async function () {
    if (!sslEnable) this.skip();
    if (!ca) this.skip();
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 7, 10)) this.skip();
    if (Conf.baseConfig.host !== 'localhost') this.skip();

    try {
      await base.createConnection({ host: '127.0.0.1', ssl: { ca: ca } });
      throw new Error('Must have thrown an exception !');
    } catch (err) {
      assert(
        err.message.includes("Hostname/IP doesn't match certificate's altnames") ||
          err.message.includes("Hostname/IP does not match certificate's altnames"),
        'error was : ' + err.message
      );
      assert(err.message.includes("IP: 127.0.0.1 is not in the cert's list"), 'error was : ' + err.message);
    }
  });

  it('CA provided with matching cn', async function () {
    if (Conf.baseConfig.host !== 'localhost' && Conf.baseConfig.host !== 'mariadb.example.com') this.skip();
    if (!sslEnable) this.skip();
    if (!ca) this.skip();
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 7, 10)) this.skip();

    const conn = await base.createConnection({ host: 'mariadb.example.com', ssl: { ca: ca }, port: sslPort });
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
    await validConnection(conn);
    await conn.end();
  });

  it('Mutual authentication without providing client certificate', async function () {
    if (!sslEnable) this.skip();
    if (!ca) this.skip();
    let conn = null;
    try {
      conn = await base.createConnection({
        user: 'X509testUser',
        password: 'éà@d684SQpl¨^',
        host: 'mariadb.example.com',
        ssl: { ca: ca },
        port: sslPort
      });
    } catch (err) {
      // skip
    }
    if (conn) {
      await validConnection(conn);
      conn.end();
      if (process.env.srv !== 'maxscale' && process.env.srv !== 'skysql-ha') {
        throw new Error('Must have thrown an exception !');
      }
    }
  });

  it('Mutual authentication providing client certificate', async function () {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha') this.skip();
    if (!sslEnable) this.skip();
    if (!ca || !clientKey || !clientCert) this.skip();
    if (!base.utf8Collation()) this.skip();
    const conn = await base.createConnection({
      user: 'X509testUser',
      password: 'éà@d684SQpl¨^',
      host: 'mariadb.example.com',
      ssl: {
        ca: ca,
        cert: clientCert,
        key: clientKey
      },
      port: sslPort
    });
    await validConnection(conn);
    conn.end();
  });

  it('Mutual authentication providing client keystore', async function () {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha') this.skip();
    if (!sslEnable) this.skip();
    if (!ca || !clientKeystore) this.skip();
    if (!base.utf8Collation()) this.skip();

    const ver = process.version.substring(1).split('.');
    //on node.js 17+ client keystore won't be supported until installing openssl 3.0
    if (parseInt(ver[0]) >= 17) this.skip();

    const conn = await base.createConnection({
      user: 'X509testUser',
      password: 'éà@d684SQpl¨^',
      host: 'mariadb.example.com',
      ssl: {
        ca: ca,
        pfx: clientKeystore,
        passphrase: 'kspass'
      },
      port: sslPort
    });
    await validConnection(conn);
    conn.end();
  });

  it('ssl change user', async function () {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha') this.skip();
    if (!shareConn.info.isMariaDB()) this.skip();
    if (!sslEnable) this.skip();
    let currUser;
    const conn = await base.createConnection({
      ssl: { rejectUnauthorized: false },
      port: sslPort
    });
    conn.query("DROP USER ChangeUser@'%'").catch((err) => {});
    conn.query('FLUSH PRIVILEGES');
    conn.query("CREATE USER ChangeUser@'%' IDENTIFIED BY 'mySupPassw@rd2'");
    conn.query("GRANT SELECT ON *.* TO ChangeUser@'%' with grant option");
    await conn.query('FLUSH PRIVILEGES');
    let res = await conn.query('SELECT CURRENT_USER');
    currUser = res[0]['CURRENT_USER'];
    await conn.changeUser({
      user: 'ChangeUser',
      password: 'mySupPassw@rd2',
      connectAttributes: { par1: 'bouh', par2: 'bla' }
    });
    res = await conn.query('SELECT CURRENT_USER');
    const user = res[0]['CURRENT_USER'];
    assert.equal(user, 'ChangeUser@%');
    assert(user !== currUser);
    conn.query("DROP USER ChangeUser@'%'");
    conn.end();
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

async function validConnection(conn) {
  let rows = await conn.query("SELECT 'a' t");
  assert.deepEqual(rows, [{ t: 'a' }]);
}
