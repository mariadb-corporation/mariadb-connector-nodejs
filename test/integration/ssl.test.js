//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import fs from 'node:fs';
import tls from 'node:tls';
import crypto from 'node:crypto';

import Conf from '../conf.js';
import { isMaxscale, isMaxscaleMinVersion, getHostSuffix, getEnv, createConnection, utf8Collation } from '../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';

describe.concurrent('ssl', function () {
  let ca = Conf.baseConfig.ssl && Conf.baseConfig.ssl.ca ? Conf.baseConfig.ssl.ca : null;
  let clientKey = null;
  let clientCert = null;
  let clientKeystore = null;
  let sslEnable = false;
  let sslPort = Conf.baseConfig.port;
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
    if (getEnv('TEST_MAXSCALE_TLS_PORT')) sslPort = parseInt(getEnv('TEST_MAXSCALE_TLS_PORT'));
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

    let serverCaFile = Conf.baseConfig.ssl && Conf.baseConfig.ssl.ca ? null : getEnv('TEST_DB_SERVER_CERT');
    let clientKeyFileName = getEnv('TEST_DB_CLIENT_KEY');
    let clientCertFileName = getEnv('TEST_DB_CLIENT_CERT');
    let clientKeystoreFileName = getEnv('TEST_DB_CLIENT_PKCS');

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

    await shareConn.query("DROP USER IF EXISTS 'sslTestUser'" + getHostSuffix());
    await shareConn.query("DROP USER IF EXISTS 'X509testUser'" + getHostSuffix());
    await shareConn.query("DROP USER IF EXISTS 'nosslTestUser'" + getHostSuffix());

    await shareConn.query("CREATE USER 'sslTestUser'" + getHostSuffix() + " IDENTIFIED BY 'ytoKS@led5' REQUIRE SSL");
    await shareConn.query("CREATE USER 'nosslTestUser'" + getHostSuffix() + " IDENTIFIED BY 'ytoKS@led5'");
    await shareConn.query("GRANT SELECT ON *.* TO 'sslTestUser'" + getHostSuffix());
    await shareConn.query("GRANT SELECT ON *.* TO 'nosslTestUser'" + getHostSuffix());
    await shareConn.query(
      "CREATE USER 'X509testUser'" + getHostSuffix() + " IDENTIFIED BY 'éà@d684SQpl¨^' REQUIRE X509"
    );
    await shareConn.query("GRANT SELECT ON *.* TO 'X509testUser'" + getHostSuffix());

    await shareConn.query('FLUSH PRIVILEGES');
    const rows = await shareConn.query("SHOW VARIABLES LIKE 'have_ssl'");
    if (rows.length === 0 || rows[0].Value === 'YES') {
      sslEnable = true;
    }
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });

  test('error when server ssl is disable', async ({ skip }) => {
    if (sslEnable) {
      return skip();
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

  test('signed certificate error', async ({ skip }) => {
    if (!sslEnable) return skip();
    let conn = null;

    // skip for ephemeral, since will succeed
    if (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(11, 4, 0) && !shareConn.info.hasMinVersion(23, 0, 0))
      return skip();
    if (isMaxscale(shareConn) && isMaxscaleMinVersion(shareConn, 25, 8, 0)) return skip();
    try {
      conn = await createConnection({
        user: 'sslTestUser',
        password: 'ytoKS@led5',
        ssl: true,
        port: sslPort
      });
      await validConnection(conn);
      throw new Error('Must have thrown an exception !');
    } catch (err) {
      assert(
        err.message.includes('Self signed certificate') ||
          err.message.includes('self-signed certificate') ||
          err.message.includes('unable to get local issuer certificate') ||
          err.message.includes('unable to verify the first certificate'),
        err.message
      );
    } finally {
      if (conn != null) conn.end();
    }
  });

  test('signed certificate error with ephemeral', async ({ skip }) => {
    if (!sslEnable) return skip();
    let isMaxscaleEphemeral = false;
    if (isMaxscale(shareConn) && isMaxscaleMinVersion(shareConn, 25, 8, 0)) {
      // MaxScale implements this in the 25.08 release
      isMaxscaleEphemeral = true;
    } else if (
      !shareConn.info.isMariaDB() ||
      !shareConn.info.hasMinVersion(11, 4, 0) ||
      shareConn.info.hasMinVersion(23, 0, 0) ||
      (isMaxscale(shareConn) && !isMaxscaleMinVersion(shareConn, 25, 8, 0))
    )
      return skip();
    let conn = null;
    try {
      conn = await createConnection({
        user: 'sslTestUser',
        password: 'ytoKS@led5',
        ssl: true,
        port: sslPort
      });
      await validConnection(conn);
      // if not ephemeral certificate must throw an error
      if (
        !isMaxscaleEphemeral &&
        !shareConn.info.isMariaDB() &&
        (!shareConn.info.hasMinVersion(11, 4, 0) || shareConn.info.hasMinVersion(23, 0, 0))
      ) {
        throw new Error('Must have thrown an exception !');
      }
    } finally {
      if (conn != null) conn.end();
    }
  });

  test('signed certificate forcing', async ({ skip }) => {
    if (!sslEnable) return skip();
    const conn = await createConnection({ ssl: { rejectUnauthorized: false }, port: sslPort });
    await validConnection(conn);
    await conn.end();
  });

  test('self signed certificate server before ephemeral', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    if (!sslEnable) return skip();

    // test will work either because a server certificate chain is trusted (not done in tests)
    // or using mariadb ephemeral certificate validation
    if (
      !shareConn.info.isMariaDB() ||
      (shareConn.info.hasMinVersion(11, 4, 0) && !shareConn.info.hasMinVersion(23, 0, 0))
    )
      return skip();
    try {
      await createConnection({ ssl: true, port: sslPort });
      throw new Error('must have thrown error');
    } catch (err) {
      assert.equal(err.code, 'ER_SELF_SIGNED');
      assert.equal(err.errno, 45056);
    }
  });

  test('self signed certificate forcing no password', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    if (!sslEnable) return skip();

    // test will work either because a server certificate chain is trusted (not done in tests)
    // or using mariadb ephemeral certificate validation
    if (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(11, 4, 0) && !shareConn.info.hasMinVersion(23, 0, 0))
      return skip();
    if (Conf.baseConfig.password) return skip();
    try {
      await createConnection({ ssl: true, port: sslPort });
      throw new Error('must have thrown error');
    } catch (err) {
      assert.equal(err.code, 'ER_SELF_SIGNED');
      assert.equal(err.errno, 45056);
    }
  });

  test('self signed certificate forcing with password ssl:true', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    if (!sslEnable) return skip();

    // test will work either because a server certificate chain is trusted (not don in tests)
    // or using mariadb ephemeral certificate validation
    if (
      !shareConn.info.isMariaDB() ||
      !shareConn.info.hasMinVersion(11, 4, 0) ||
      shareConn.info.hasMinVersion(23, 0, 0)
    )
      return skip();
    if (!Conf.baseConfig.password) return skip();
    const conn = await createConnection({
      user: 'sslTestUser',
      password: 'ytoKS@led5',
      ssl: true,
      port: sslPort
    });
    await validConnection(conn);
    await conn.end();
  });

  test('self signed certificate forcing with password ssl: {rejectUnauthorized: true}', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    if (!sslEnable) return skip();

    // test will work either because a server certificate chain is trusted (not done in tests)
    // or using mariadb ephemeral certificate validation
    if (
      !shareConn.info.isMariaDB() ||
      !shareConn.info.hasMinVersion(11, 4, 0) ||
      shareConn.info.hasMinVersion(23, 0, 0)
    )
      return skip();
    if (!Conf.baseConfig.password) return skip();

    const conn = await createConnection({
      user: 'sslTestUser',
      password: 'ytoKS@led5',
      ssl: { rejectUnauthorized: true },
      port: sslPort
    });
    await validConnection(conn);
    await conn.end();
  });

  test('ensure connection use SSL ', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    if (!sslEnable) return skip();
    if (!utf8Collation()) return skip();
    const conn = await createConnection({
      user: 'sslTestUser',
      password: 'ytoKS@led5',
      ssl: { rejectUnauthorized: false, checkServerIdentity: () => {} },
      port: sslPort
    });
    await validConnection(conn);
    await conn.end();
  });

  test('ensure connection use NOT SSL ', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    if (!sslEnable) return skip();
    if (!utf8Collation()) return skip();
    const conn = await createConnection({
      user: 'nosslTestUser',
      password: 'ytoKS@led5',
      allowPublicKeyRetrieval: true
    });
    await validConnection(conn);
    await conn.end();
  });

  test('SSLv3 disable', async ({ skip }) => {
    if (!sslEnable) return skip();
    try {
      await createConnection({
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

  test('SSLv2 disable', async ({ skip }) => {
    if (!sslEnable) return skip();
    try {
      await createConnection({
        ssl: { rejectUnauthorized: false, secureProtocol: 'SSLv2_method' },
        port: sslPort
      });
      throw new Error('Must have thrown an exception !');
    } catch (err) {
      assert(err.message.includes('SSLv2 methods disabled'));
    }
  });

  test('TLSv1 working', async ({ skip }) => {
    if (
      !sslEnable ||
      (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 3, 0)) ||
      (!shareConn.info.isMariaDB() &&
        (shareConn.info.hasMinVersion(8, 0, 0) || shareConn.info.hasMinVersion(5, 7, 43))) ||
      shareConn.info.serverVersion.raw.includes('focal')
    ) {
      return skip();
    }
    const conn = await createConnection({
      ssl: { rejectUnauthorized: false, secureProtocol: 'TLSv1_method' },
      port: sslPort
    });
    checkProtocol(conn, 'TLSv1');
    await conn.end();
  });

  test('TLSv1.1 working', async ({ skip }) => {
    if (
      !sslEnable ||
      (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 3, 0)) ||
      (!shareConn.info.isMariaDB() &&
        (shareConn.info.hasMinVersion(8, 0, 0) || shareConn.info.hasMinVersion(5, 7, 43))) ||
      shareConn.info.serverVersion.raw.includes('focal')
    ) {
      return skip();
    }
    const conn = await createConnection({
      ssl: { rejectUnauthorized: false, secureProtocol: 'TLSv1_1_method' },
      port: sslPort
    });
    checkProtocol(conn, 'TLSv1.1');
    await conn.end();
  });

  test('TLSv1.1 with permit cipher', async ({ skip }) => {
    if (
      !sslEnable ||
      (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 4, 0)) ||
      (!shareConn.info.isMariaDB() &&
        (shareConn.info.hasMinVersion(8, 0, 0) || shareConn.info.hasMinVersion(5, 7, 43))) ||
      shareConn.info.serverVersion.raw.includes('focal')
    ) {
      return skip();
    }
    const conn = await createConnection({
      ssl: {
        rejectUnauthorized: false,
        secureProtocol: 'TLSv1_1_method',
        ciphers:
          'DHE-RSA-AES256-SHA:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256'
      },
      port: sslPort
    });
    checkProtocol(conn, 'TLSv1.1');
    await conn.end();
  });

  test('TLSv1.1 no common cipher', async ({ skip }) => {
    if (!sslEnable) return skip();
    if (
      !shareConn.info.isMariaDB() &&
      (!shareConn.info.hasMinVersion(5, 7, 10) || shareConn.info.hasMinVersion(8, 0, 0))
    ) {
      return skip();
    }
    try {
      await createConnection({
        ssl: {
          rejectUnauthorized: false,
          secureProtocol: 'TLSv1_1_method',
          ciphers: 'ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256'
        },
        port: sslPort
      });
      throw new Error('Must have thrown an exception !');
    } catch (err) {
      if (err.code !== 'ERR_SSL_NO_PROTOCOLS_AVAILABLE') {
        assert(err.message.includes('no ciphers available'), err);
      }
    }
  });

  test('TLSv1.1 wrong cipher', async ({ skip }) => {
    if (!sslEnable) return skip();
    if (
      !shareConn.info.isMariaDB() &&
      (!shareConn.info.hasMinVersion(5, 7, 10) || shareConn.info.hasMinVersion(8, 0, 0))
    ) {
      return skip();
    }

    try {
      await createConnection({
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

  test('TLSv1.2 working', async ({ skip }) => {
    if (!sslEnable) return skip();
    //MariaDB server doesn't permit TLSv1.2 on windows
    //MySQL community version doesn't support TLSv1.2
    const isWin = process.platform === 'win32';
    if (isWin || !shareConn.info.isMariaDB()) return skip();

    const conn = await createConnection({
      ssl: { rejectUnauthorized: false, secureProtocol: 'TLSv1_2_method' },
      port: sslPort
    });
    checkProtocol(conn, 'TLSv1.2');
    await conn.end();
  });

  test('TLSv1.2 with cipher working', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    if (!sslEnable) return skip();
    //MariaDB server doesn't permit TLSv1.2 on windows
    //MySQL community version doesn't support TLSv1.2
    const isWin = process.platform === 'win32';
    if (!shareConn.info.isMariaDB() || (isWin && !shareConn.info.hasMinVersion(10, 4, 2))) {
      return skip();
    }

    const conn = await createConnection({
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
    await conn.end();
  });

  test('CA provided ignoring name verification', async ({ skip }) => {
    if (!sslEnable) return skip();
    if (!ca) return skip();
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 7, 10)) return skip();
    if (Conf.baseConfig.host !== 'localhost') return skip();

    let conn = await createConnection({
      ssl: {
        ca: ca,
        checkServerIdentity: (servername, cert) => {}
      },
      port: sslPort
    });
    await validConnection(conn);
    await conn.end();

    let success = false;
    try {
      conn = await createConnection({
        ssl: {
          ca: ca,
          checkServerIdentity: (servername, cert) => {
            throw new Error('test identity');
          }
        },
        port: sslPort
      });
      await validConnection(conn);
      await conn.end();
      success = true;
    } catch (e) {
      // eat
    }
    if (success && (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(11, 4, 0))) {
      throw new Error('Must have thrown an exception, since server identity must not have been verified !');
    }
  });

  test('CA name verification error', async ({ skip }) => {
    if (!sslEnable) return skip();
    if (!ca) return skip();
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 7, 10)) return skip();
    if (Conf.baseConfig.host !== 'localhost') return skip();

    try {
      await createConnection({ host: '127.0.0.1', ssl: { ca: ca } });
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

  test('CA provided with matching cn', async ({ skip }) => {
    if (Conf.baseConfig.host !== 'localhost' && Conf.baseConfig.host !== 'mariadb.example.com') return skip();
    if (!sslEnable) return skip();
    if (!ca) return skip();
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 7, 10)) return skip();

    const conn = await createConnection({ host: 'mariadb.example.com', ssl: { ca: ca }, port: sslPort });
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

  test('Mutual authentication without providing client certificate', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    if (!sslEnable) return skip();
    if (!ca) return skip();
    let conn = null;
    try {
      conn = await createConnection({
        user: 'X509testUser',
        password: 'éà@d684SQpl¨^',
        host: '192.168.3.19',
        ssl: { ca: ca },
        port: sslPort
      });
    } catch (err) {
      // skip
    }
    if (conn) {
      await validConnection(conn);
      await conn.end();
      throw new Error('Must have thrown an exception !');
    }
  });

  test('Mutual authentication providing client certificate', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    if (!sslEnable) return skip();
    if (!ca || !clientKey || !clientCert) return skip();
    if (!utf8Collation()) return skip();
    const conn = await createConnection({
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
    await conn.end();
  });

  test('Mutual authentication providing client keystore', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    if (!sslEnable) return skip();
    if (!ca || !clientKeystore) return skip();
    if (!utf8Collation()) return skip();

    const ver = process.version.substring(1).split('.');
    //on node.js 17+ client keystore won't be supported until installing openssl 3.0
    if (parseInt(ver[0]) >= 17) return skip();

    const conn = await createConnection({
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
    await conn.end();
  });

  test('ssl change user', async ({ skip }) => {
    if (isMaxscale(shareConn)) return skip();
    if (!shareConn.info.isMariaDB()) return skip();
    if (!sslEnable) return skip();
    let currUser;
    const conn = await createConnection({
      ssl: { rejectUnauthorized: false },
      port: sslPort
    });
    conn.query('DROP USER ChangeUser' + getHostSuffix()).catch((err) => {});
    conn.query('FLUSH PRIVILEGES');
    conn.query('CREATE USER ChangeUser' + getHostSuffix() + " IDENTIFIED BY 'mySupPassw@rd2'");
    conn.query('GRANT SELECT ON *.* TO ChangeUser' + getHostSuffix() + ' with grant option');
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
    assert.equal(user, 'ChangeUser' + getHostSuffix().replaceAll("'", ''));
    assert(user !== currUser);
    conn.query('DROP USER ChangeUser' + getHostSuffix());
    await conn.end();
  });

  test('ssl dialog authentication plugin', async ({ skip }) => {
    if (!getEnv('TEST_PAM_USER')) return skip();
    if (isMaxscale(shareConn)) return skip();
    if (!shareConn.info.isMariaDB()) return skip();
    if (!sslEnable) return skip();

    try {
      await shareConn.query("INSTALL PLUGIN pam SONAME 'auth_pam'");
    } catch (error) {}
    try {
      await shareConn.query("DROP USER IF EXISTS '" + getEnv('TEST_PAM_USER') + "'" + getHostSuffix());
    } catch (error) {}

    await shareConn.query(
      "CREATE USER '" + getEnv('TEST_PAM_USER') + "'" + getHostSuffix() + " IDENTIFIED VIA pam USING 'mariadb'"
    );
    await shareConn.query(
      "GRANT SELECT ON *.* TO '" + getEnv('TEST_PAM_USER') + "'" + getHostSuffix() + ' IDENTIFIED VIA pam'
    );
    await shareConn.query('FLUSH PRIVILEGES');

    const conn = await createConnection({
      user: getEnv('TEST_PAM_USER'),
      password: getEnv('TEST_PAM_PWD'),
      ssl: { rejectUnauthorized: false },
      port: sslPort
    });
    await conn.end();
  }, 10000);
});

function checkProtocol(conn, protocol) {
  const ver = process.version.substring(1).split('.');
  const currentProtocol = conn.__tests.getSocket().getProtocol();

  if (ver[0] > 5 || (ver[0] === '5' && ver[1] === '7')) {
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
