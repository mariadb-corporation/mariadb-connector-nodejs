//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import * as base from '../base.js';
import Conf from '../conf.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isMaxscale, getHostSuffix, getEnv, createConnection, isLocalDb } from '../base.js';

describe('authentication plugin', () => {
  let rsaPublicKey = getEnv('TEST_RSA_PUBLIC_KEY');
  let cachingRsaPublicKey = getEnv('TEST_CACHING_RSA_PUBLIC_KEY');
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
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

    await shareConn.query("DROP USER IF EXISTS 'sha256User'" + getHostSuffix()).catch((e) => {});
    await shareConn.query("DROP USER IF EXISTS 'cachingSha256User'" + getHostSuffix()).catch((e) => {});
    await shareConn.query("DROP USER IF EXISTS 'cachingSha256User2'" + getHostSuffix()).catch((e) => {});
    await shareConn.query("DROP USER IF EXISTS 'cachingSha256User3'" + getHostSuffix()).catch((e) => {});
    await shareConn.query("DROP USER IF EXISTS 'cachingSha256User4'" + getHostSuffix()).catch((e) => {});

    if (!shareConn.info.isMariaDB()) {
      if (shareConn.info.hasMinVersion(8, 0, 0)) {
        await shareConn.query(
          "CREATE USER 'sha256User'" + getHostSuffix() + " IDENTIFIED WITH sha256_password BY 'password'"
        );
        await shareConn.query("GRANT ALL PRIVILEGES ON *.* TO 'sha256User'" + getHostSuffix());

        await shareConn.query(
          "CREATE USER 'cachingSha256User'" + getHostSuffix() + " IDENTIFIED WITH caching_sha2_password BY 'password'"
        );
        await shareConn.query("GRANT ALL PRIVILEGES ON *.* TO 'cachingSha256User'" + getHostSuffix());
        await shareConn.query(
          "CREATE USER 'cachingSha256User2'" + getHostSuffix() + " IDENTIFIED WITH caching_sha2_password BY 'password'"
        );
        await shareConn.query("GRANT ALL PRIVILEGES ON *.* TO 'cachingSha256User2'" + getHostSuffix());
        await shareConn.query(
          "CREATE USER 'cachingSha256User3'" + getHostSuffix() + "  IDENTIFIED WITH caching_sha2_password BY 'password'"
        );
        await shareConn.query("GRANT ALL PRIVILEGES ON *.* TO 'cachingSha256User3'" + getHostSuffix());
        await shareConn.query(
          "CREATE USER 'cachingSha256User4'" + getHostSuffix() + "  IDENTIFIED WITH caching_sha2_password BY 'password'"
        );
        await shareConn.query("GRANT ALL PRIVILEGES ON *.* TO 'cachingSha256User4'" + getHostSuffix());
      } else {
        await shareConn.query("CREATE USER 'sha256User'" + getHostSuffix());
        await shareConn.query(
          "GRANT ALL PRIVILEGES ON *.* TO 'sha256User'" +
            getHostSuffix() +
            " IDENTIFIED WITH sha256_password BY 'password'"
        );
      }
    }
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });

  test('ed25519 authentication plugin', async ({ skip }) => {
    if (isMaxscale(shareConn)) {
      skip();
      return;
    }

    if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 1, 22)) return skip();

    const res = await shareConn.query('SELECT @@strict_password_validation as a');
    if (res[0].a === 1 && !shareConn.info.hasMinVersion(10, 4, 0)) {
      skip();
      return;
    }
    try {
      await shareConn.query("INSTALL SONAME 'auth_ed25519'").catch(() => {});
      await shareConn.query('drop user IF EXISTS verificationEd25519AuthPlugin' + getHostSuffix());
      if (shareConn.info.hasMinVersion(10, 4, 0)) {
        await shareConn.query(
          'CREATE USER verificationEd25519AuthPlugin' +
            getHostSuffix() +
            ' IDENTIFIED ' +
            "VIA ed25519 USING PASSWORD('MySup8%rPassw@ord')"
        );
      } else {
        await shareConn.query(
          'CREATE USER verificationEd25519AuthPlugin' +
            getHostSuffix() +
            ' IDENTIFIED ' +
            "VIA ed25519 USING '6aW9C7ENlasUfymtfMvMZZtnkCVlcb1ssxOLJ0kj/AA'"
        );
      }
      await shareConn.query(
        'GRANT SELECT on  `' + Conf.baseConfig.database + '`.* to verificationEd25519AuthPlugin' + getHostSuffix()
      );
    } catch (e) {
      console.log(e);
      skip();
      return;
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

  test('name pipe authentication plugin', async ({ skip }) => {
    if (
      process.platform !== 'win32' ||
      isMaxscale(shareConn) ||
      !shareConn.info.isMariaDB() ||
      !shareConn.info.hasMinVersion(10, 1, 11) ||
      (Conf.baseConfig.host !== 'localhost' && Conf.baseConfig.host !== 'mariadb.example.com')
    )
      return skip();

    const windowsUser = getEnv('USERNAME');
    if (windowsUser === 'root') return skip();
    let res;
    try {
      res = await shareConn.query('SELECT @@named_pipe as pipe');
    } catch (e) {
      return;
    }
    if (res[0].pipe) {
      await shareConn.query("INSTALL PLUGIN named_pipe SONAME 'auth_named_pipe'").catch((err) => {});
      await shareConn.query('DROP USER ' + windowsUser).catch((err) => {});
      await shareConn.query('CREATE USER ' + windowsUser + " IDENTIFIED VIA named_pipe using 'test'");
      await shareConn.query('GRANT SELECT on *.* to ' + windowsUser);
      res = await shareConn.query('select @@version_compile_os,@@socket soc');
      const conn = await base.createConnection({
        user: null,
        socketPath: '\\\\.\\pipe\\' + res[0].soc
      });
      conn.end();
    } else {
      console.log('named pipe not enabled');
      skip();
    }
  });

  test('unix socket authentication plugin', async ({ skip }) => {
    if (
      isMaxscale(shareConn) ||
      process.platform === 'win32' ||
      !shareConn.info.isMariaDB() ||
      !shareConn.info.hasMinVersion(10, 1, 11) ||
      !isLocalDb() ||
      (Conf.baseConfig.host !== 'localhost' && Conf.baseConfig.host !== 'mariadb.example.com')
    ) {
      skip();
      return;
    }

    const unixUser = getEnv('USER');
    if (!unixUser || unixUser === 'root') {
      skip();
      return;
    }
    const res = await shareConn.query('select @@version_compile_os,@@socket soc');
    await shareConn.query("INSTALL PLUGIN unix_socket SONAME 'auth_socket'").catch(() => {});
    await shareConn.query('DROP USER IF EXISTS ' + unixUser);
    await shareConn
      .query("CREATE USER '" + unixUser + "'@'" + Conf.baseConfig.host + "' IDENTIFIED VIA unix_socket")
      .catch(() => {});
    await shareConn.query("GRANT SELECT on *.* to '" + unixUser + "'@'" + Conf.baseConfig.host + "'");
    const conn = await base.createConnection({ user: null, socketPath: res[0].soc });
    await conn.end();
  });

  test('dialog authentication plugin', async ({ skip }) => {
    //pam is set using .travis/sql/pam.sh
    if (!getEnv('TEST_PAM_USER') || !shareConn.info.isMariaDB()) {
      skip();
      return;
    }
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
      "GRANT SELECT ON *.* TO '" + getEnv('TEST_PAM_USER') + "'" + +getHostSuffix() + ' IDENTIFIED VIA pam'
    );
    await shareConn.query('FLUSH PRIVILEGES');

    let testPort = Conf.baseConfig.port;
    if (getEnv('TEST_PAM_PORT') != null) {
      testPort = parseInt(getEnv('TEST_PAM_PORT'));
    }

    const conn = await base.createConnection({
      user: getEnv('TEST_PAM_USER'),
      password: getEnv('TEST_PAM_PWD'),
      port: testPort
    });
    await conn.end();
  }, 10000);

  test('dialog authentication plugin multiple password', async ({ skip }) => {
    if (isMaxscale(shareConn) || !getEnv('TEST_PAM_USER') || !shareConn.info.isMariaDB()) {
      skip();
      return;
    }

    try {
      await shareConn.query("INSTALL PLUGIN pam SONAME 'auth_pam'");
    } catch (error) {}
    try {
      await shareConn.query("DROP USER IF EXISTS '" + getEnv('TEST_PAM_USER') + "'" + getHostSuffix());
    } catch (error) {}

    await shareConn.query(
      "CREATE USER '" + getEnv('TEST_PAM_USER') + "'" + +getHostSuffix() + " IDENTIFIED VIA pam USING 'mariadb'"
    );
    await shareConn.query(
      "GRANT SELECT ON *.* TO '" + getEnv('TEST_PAM_USER') + "'" + +getHostSuffix() + ' IDENTIFIED VIA pam'
    );
    await shareConn.query('FLUSH PRIVILEGES');

    let testPort = Conf.baseConfig.port;
    if (getEnv('TEST_PAM_PORT') != null) {
      testPort = parseInt(getEnv('TEST_PAM_PORT'));
    }
    //password is unix password "myPwd"
    const conn = await base.createConnection({
      user: getEnv('TEST_PAM_USER'),
      password: [getEnv('TEST_PAM_PWD'), getEnv('TEST_PAM_PWD')],
      port: testPort
    });
    await conn.end();
  }, 10000);

  test('multi authentication plugin', async ({ skip }) => {
    if (isMaxscale(shareConn) || !shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 4, 3)) {
      skip();
      return;
    }
    await shareConn.query("drop user IF EXISTS mysqltest1@'%'").catch((err) => {});
    await shareConn.query(
      'CREATE USER mysqltest1' +
        getHostSuffix() +
        ' IDENTIFIED ' +
        "VIA ed25519 as password('!Passw0rd3') " +
        " OR mysql_native_password as password('!Passw0rd3Works')"
    );

    await shareConn.query('grant SELECT on `' + Conf.baseConfig.database + '`.*  to mysqltest1' + getHostSuffix());
    let conn = await base.createConnection({
      user: 'mysqltest1',
      password: '!Passw0rd3'
    });
    const res = await conn.query("select '1'");
    await conn.end();
    conn = await base.createConnection({
      user: 'mysqltest1',
      password: '!Passw0rd3Works'
    });
    await conn.query('select 1');
    await conn.end();
    try {
      conn = await base.createConnection({
        user: 'mysqltest1',
        password: '!Passw0rd3Wrong'
      });
      await conn.end();
      throw new Error('must have throw Error!');
    } catch (e) {
      assert.isTrue(e.message.includes('Access denied'));
    }
  });

  test('sha256 authentication plugin', async ({ skip }) => {
    if (!rsaPublicKey || shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(5, 7, 0)) {
      skip();
      return;
    }

    const self = this;
    try {
      const conn = await base.createConnection({
        user: 'sha256User',
        password: 'password',
        rsaPublicKey: rsaPublicKey
      });
      await conn.end();
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
      await conn.end();
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
      await conn.end();
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
      await conn.end();
      throw new Error('must have thrown exception');
    } catch (err) {
      if (err.message.includes('sha256_password authentication plugin require node 11.6+')) self.skip();
      assert.isTrue(err.message.includes('Access denied'));
    }
  });

  test('sha256 authentication plugin with public key retrieval', async ({ skip }) => {
    if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(5, 7, 0)) {
      skip();
      return;
    }

    try {
      const conn = await base.createConnection({
        user: 'sha256User',
        password: 'password',
        allowPublicKeyRetrieval: true
      });
      await conn.end();
    } catch (e) {
      if (err.message.includes('sha256_password authentication plugin require node 11.6+')) {
        skip();
        return;
      }
      throw e;
    }
  });

  test('sha256 authentication plugin without public key retrieval', async ({ skip }) => {
    if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(5, 7, 0)) {
      skip();
      return;
    }

    try {
      const conn = await base.createConnection({
        user: 'sha256User',
        password: 'password',
        allowPublicKeyRetrieval: false
      });
      await conn.end();
      throw new Error('must have thrown error');
    } catch (err) {
      assert.isTrue(
        err.message.includes('RSA public key is not available client side.') ||
          err.message.includes('sha256_password authentication plugin require node 11.6+')
      );
    }
  });

  test('sha256 authentication plugin with ssl', async ({ skip }) => {
    if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(5, 7, 0)) {
      skip();
      return;
    }

    const rows = await shareConn.query("SHOW VARIABLES LIKE 'have_ssl'");
    if (rows.length === 0 || rows[0].Value === 'YES') {
      try {
        const conn = await base.createConnection({
          user: 'sha256User',
          password: 'password',
          ssl: {
            rejectUnauthorized: false
          }
        });
        await conn.end();
      } catch (err) {
        if (err.message.includes('sha256_password authentication plugin require node 11.6+')) {
          skip();
          return;
        }
        throw err;
      }
    } else {
      skip();
    }
  });

  test('cachingsha256 authentication plugin', async ({ skip }) => {
    if (!rsaPublicKey || shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(8, 0, 0)) {
      skip();
      return;
    }

    try {
      const conn = await base.createConnection({
        user: 'cachingSha256User4',
        password: 'password',
        cachingRsaPublicKey: '/wrongPath'
      });
      await conn.end();
      throw new Error('must have thrown exception');
    } catch (err) {
      if (err.message.includes('sha256_password authentication plugin require node 11.6+')) {
        skip();
        return;
      }
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
      await conn.end();
    } catch (err) {
      if (err.message.includes('sha256_password authentication plugin require node 11.6+')) {
        skip();
        return;
      }
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
      await conn.end();
      throw new Error('must have thrown exception');
    } catch (err) {
      if (err.message.includes('sha256_password authentication plugin require node 11.6+')) {
        skip();
        return;
      }
      assert.isTrue(err.message.includes('Access denied'));
    }

    try {
      const conn = await base.createConnection({
        user: 'cachingSha256User',
        password: 'password',
        cachingRsaPublicKey: rsaPublicKey
      });
      await conn.end();
    } catch (e) {
      throw e;
    }

    try {
      const conn = await base.createConnection({
        user: 'cachingSha256User',
        password: 'password',
        cachingRsaPublicKey: rsaPublicKey
      });
      await conn.end();
    } catch (e) {
      throw e;
    }
  });

  test('cachingsha256 authentication plugin with public key retrieval', async ({ skip }) => {
    if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(8, 0, 0)) {
      skip();
      return;
    }
    // request files since 5.7.40 / 8.0.31 fails when requesting public key
    if (
      !shareConn.info.isMariaDB() &&
      ((!shareConn.info.hasMinVersion(8, 0, 0) && shareConn.info.hasMinVersion(5, 7, 40)) ||
        shareConn.info.hasMinVersion(8, 0, 31))
    ) {
      skip();
      return;
    }

    try {
      const conn = await base.createConnection({
        user: 'cachingSha256User2',
        password: 'password',
        allowPublicKeyRetrieval: true
      });
      await conn.end();
    } catch (err) {
      if (err.message.includes('caching_sha2_password authentication plugin require node 11.6+')) {
        skip();
        return;
      }
      throw err;
    }
    const conn = await base.createConnection({
      user: 'cachingSha256User2',
      password: 'password'
    });
    await conn.end();
  });

  test('cachingsha256 authentication plugin without public key retrieval', async ({ skip }) => {
    if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(8, 0, 0)) {
      skip();
      return;
    }

    try {
      const conn = await base.createConnection({
        user: 'cachingSha256User3',
        password: 'password',
        allowPublicKeyRetrieval: false
      });
      await conn.end();
      throw new Error('must have thrown error');
    } catch (err) {
      assert.isTrue(
        err.message.includes('RSA public key is not available client side.') ||
          err.message.includes('caching_sha2_password authentication plugin require node 11.6+')
      );
    }
  });

  test('cachingsha256 authentication plugin with ssl', async ({ skip }) => {
    if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(8, 0, 0)) {
      skip();
      return;
    }

    const rows = await shareConn.query("SHOW VARIABLES LIKE 'have_ssl'");
    if (rows.length === 0 || rows[0].Value === 'YES') {
      try {
        const conn = await base.createConnection({
          user: 'cachingSha256User3',
          password: 'password',
          ssl: {
            rejectUnauthorized: false
          }
        });
        await conn.end();
      } catch (err) {
        if (err.message.includes('caching_sha2_password authentication plugin require node 11.6+')) {
          skip();
          return;
        }
        throw err;
      }
    } else {
      skip();
    }
  });

  test('parsec authentication plugin', async ({ skip }) => {
    if (isMaxscale(shareConn) || !shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(11, 6, 1)) {
      skip();
      return;
    }

    try {
      await shareConn.query("INSTALL SONAME 'auth_parsec'");
    } catch (e) {
      skip();
      return;
    }

    await shareConn.query('drop user verifParsec' + getHostSuffix()).catch(() => {});
    await shareConn.query(
      'CREATE USER verifParsec' + getHostSuffix() + " IDENTIFIED VIA parsec USING PASSWORD('MySup8%rPassw@ord')"
    );
    await shareConn.query('GRANT SELECT on `' + Conf.baseConfig.database + '`.* to verifParsec' + getHostSuffix());

    await shareConn.query('drop user verifParsec2' + getHostSuffix()).catch(() => {});
    await shareConn.query('CREATE USER verifParsec2' + getHostSuffix() + " IDENTIFIED VIA parsec USING PASSWORD('')");
    await shareConn.query('GRANT SELECT on `' + Conf.baseConfig.database + '`.* to verifParsec2' + getHostSuffix());

    let conn = await base.createConnection({
      user: 'verifParsec',
      password: 'MySup8%rPassw@ord'
    });
    await conn.changeUser({
      user: 'verifParsec',
      password: 'MySup8%rPassw@ord'
    });
    await conn.end();

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
      await conn.end();
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
    await conn.end();
  });
});
