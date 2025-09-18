//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import * as ServerStatus from '../../lib/const/server-status.js';
import Conf from '../conf.js';
import { isMaxscale, getHostSuffix, createConnection, createCallbackConnection } from '../base.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';

import winston from 'winston';

describe.concurrent('change user', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
    await shareConn.query('DROP USER ChangeUser' + getHostSuffix()).catch((e) => {});
    await shareConn.query('DROP USER ChangeUser2' + getHostSuffix()).catch((e) => {});
    await shareConn.query('CREATE DATABASE IF NOT EXISTS test');
    await shareConn.query('CREATE USER ChangeUser' + getHostSuffix() + " IDENTIFIED BY 'm1P4ssw0@rd'");
    await shareConn.query(
      'GRANT SELECT,EXECUTE ON `' + Conf.baseConfig.database + '`.* TO ChangeUser' + getHostSuffix()
    );
    await shareConn.query('CREATE USER ChangeUser2' + getHostSuffix() + " IDENTIFIED BY 'm1SecondP@rd'");
    await shareConn.query(
      'GRANT SELECT,EXECUTE ON `' +
        Conf.baseConfig.database +
        '`.* TO ChangeUser2' +
        getHostSuffix() +
        ' with grant option'
    );
    await shareConn.query('FLUSH PRIVILEGES');
  });
  afterAll(async () => {
    await shareConn.query('DROP USER ChangeUser' + getHostSuffix()).catch((e) => {});
    await shareConn.query('DROP USER ChangeUser2' + getHostSuffix()).catch((e) => {});
    await shareConn.end();
    shareConn = null;
  });

  test('mysql change user error', async ({ skip }) => {
    if (shareConn.info.isMariaDB()) return skip();
    let logged = false;
    const conn = await createConnection({
      logger: {
        error: (msg) => {
          logged = true;
        }
      }
    });
    try {
      await conn.changeUser({ user: 'ChangeUser', password: 'm1P4ssw0@rd' });
      throw new Error('must have thrown error');
    } catch (err) {
      assert.isTrue(logged);
      assert.equal(err.errno, 45003);
      assert.equal(err.code, 'ER_MYSQL_CHANGE_USER_BUG');
      assert.isTrue(err.message.includes('method changeUser not available for MySQL server due to Bug #83472'));
      assert.equal(err.sqlState, '0A000');
    } finally {
      await conn.end();
    }

    const conn2 = await createConnection();
    try {
      await conn2.changeUser({ user: 'ChangeUser', password: 'm1P4ssw0@rd' });
      throw new Error('must have thrown error');
    } catch (err) {
      assert.isTrue(logged);
      assert.equal(err.errno, 45003);
      assert.equal(err.code, 'ER_MYSQL_CHANGE_USER_BUG');
      assert.isTrue(err.message.includes('method changeUser not available for MySQL server due to Bug #83472'));
      assert.equal(err.sqlState, '0A000');
    } finally {
      await conn2.end();
    }
  });

  test('basic change user using callback', async ({ skip }) => {
    if (!shareConn.info.isMariaDB()) return skip();
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) {
          reject(err);
          return;
        }

        conn.query('SELECT CURRENT_USER', (err, res) => {
          const currUser = res[0]['CURRENT_USER'];
          conn.changeUser({ user: 'ChangeUser', password: 'm1P4ssw0@rd' }, (err) => {
            if (err) {
              reject(err);
            } else {
              conn.query('SELECT CURRENT_USER', (err, res) => {
                const user = res[0]['CURRENT_USER'];
                assert.equal(user, 'ChangeUser' + getHostSuffix().replaceAll("'", ''));
                assert(user !== currUser);
                conn.end();
                resolve();
              });
            }
          });
        });
      });
    });
  });

  test('wrong charset', async ({ skip }) => {
    if (!shareConn.info.isMariaDB()) return skip();
    const conn = await createConnection();
    try {
      await conn.changeUser({
        user: 'ChangeUser',
        password: 'm1P4ssw0@rd',
        charset: 'wrong'
      });
      throw new Error('must have thrown error!');
    } catch (err) {
      assert(err.message.includes('Unknown charset'));
      await conn.end();
    }
  });

  test('wrong collation in charset', async ({ skip }) => {
    if (!shareConn.info.isMariaDB()) return skip();
    const tmpLogFile = path.join(os.tmpdir(), 'wrongCollation.txt');
    try {
      fs.unlinkSync(tmpLogFile);
    } catch (e) {}
    let logger = winston.createLogger({
      transports: [new winston.transports.File({ filename: tmpLogFile })]
    });
    const conn = await createConnection({
      logger: {
        warning: (msg) => logger.info(msg)
      }
    });
    await conn.changeUser({
      user: 'ChangeUser',
      password: 'm1P4ssw0@rd',
      charset: 'UTF8MB4_UNICODE_CI'
    });
    logger.end();
    //wait 100ms to ensure the stream has been written
    await new Promise((resolve, reject) => {
      setTimeout(() => {
        conn.end();
        const data = fs.readFileSync(tmpLogFile, 'utf8');
        assert.isTrue(
          data.includes(
            "warning: please use option 'collation' in replacement of 'charset' " +
              "when using a collation name ('UTF8MB4_UNICODE_CI')"
          ),
          data
        );
        try {
          fs.unlinkSync(tmpLogFile);
        } catch (e) {}
        resolve();
      }, 100);
    });
  });

  test('wrong collation', async ({ skip }) => {
    if (!shareConn.info.isMariaDB()) return skip();
    const conn = await createConnection();
    try {
      await conn.changeUser({
        user: 'ChangeUser',
        password: 'm1P4ssw0@rd',
        collation: 'wrong_collation'
      });
      throw new Error('must have thrown error!');
    } catch (err) {
      assert(err.message.includes("Unknown collation 'WRONG_COLLATION'"));
      conn.end();
    }
  });

  test('basic change user using callback no function', async ({ skip }) => {
    if (!shareConn.info.isMariaDB()) return skip();
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect((err) => {
        if (err) reject(err);
        conn.changeUser({
          user: 'ChangeUser',
          password: 'm1P4ssw0@rd'
        });

        conn.query('SELECT CURRENT_USER', (err, res) => {
          conn.changeUser({ user: 'ChangeUser', password: 'm1P4ssw0@rd' });
          conn.end(() => {
            resolve();
          });
        });
      });
    });
  });

  test('callback change user without option', async ({ skip }) => {
    if (!shareConn.info.isMariaDB()) return skip();
    await new Promise((resolve, reject) => {
      const conn = createCallbackConnection();
      conn.connect((err) => {
        if (err) {
          reject(err);
        } else {
          conn.changeUser((err) => {
            if (err) {
              reject(err);
            } else {
              conn.end();
              resolve();
            }
          });
        }
      });
    });
  });

  test('basic change user using promise', async ({ skip }) => {
    if (!shareConn.info.isMariaDB()) return skip();

    const conn = await createConnection();
    await conn.changeUser({
      user: 'ChangeUser',
      password: 'm1P4ssw0@rd',
      connectAttributes: { par1: 'bouh', par2: 'bla' }
    });
    let res = await conn.query('SELECT CURRENT_USER');
    let user = res[0]['CURRENT_USER'];
    assert.equal(user, 'ChangeUser' + getHostSuffix().replaceAll("'", ''));
    await conn.changeUser({
      user: 'ChangeUser2',
      password: 'm1SecondP@rd',
      connectAttributes: true
    });
    res = await conn.query('SELECT CURRENT_USER');
    user = res[0]['CURRENT_USER'];
    assert.equal(user, 'ChangeUser2' + getHostSuffix().replaceAll("'", ''));
    await conn.end();
  });

  test('change user using connection attributes', async ({ skip }) => {
    if (!shareConn.info.isMariaDB()) return skip();

    const conn = await createConnection({ connectAttributes: { param1: 'test' } });
    await conn.changeUser({
      user: 'ChangeUser',
      password: 'm1P4ssw0@rd',
      connectAttributes: { par1: 'bouh', par2: 'bla' }
    });
    let res = await conn.query('SELECT CURRENT_USER');
    let user = res[0]['CURRENT_USER'];
    assert.equal(user, 'ChangeUser' + getHostSuffix().replaceAll("'", ''));
    await conn.changeUser({
      user: 'ChangeUser2',
      password: 'm1SecondP@rd',
      connectAttributes: true
    });

    res = await conn.query('SELECT CURRENT_USER');
    user = res[0]['CURRENT_USER'];
    assert.equal(user, 'ChangeUser2' + getHostSuffix().replaceAll("'", ''));
    await conn.end();
  });

  test('basic change user using promise non node.js encoding', async ({ skip }) => {
    if (!shareConn.info.isMariaDB()) return skip();

    const conn = await createConnection();
    await conn.changeUser({
      user: 'ChangeUser',
      password: 'm1P4ssw0@rd',
      connectAttributes: { par1: 'bouh', par2: 'bla' },
      charset: 'big5'
    });
    let res = await conn.query('SELECT CURRENT_USER');
    let user = res[0]['CURRENT_USER'];
    assert.equal(user, 'ChangeUser' + getHostSuffix().replaceAll("'", ''));
    await conn.changeUser({
      user: 'ChangeUser2',
      password: 'm1SecondP@rd',
      connectAttributes: true
    });
    res = await conn.query('SELECT CURRENT_USER');
    user = res[0]['CURRENT_USER'];
    assert.equal(user, 'ChangeUser2' + getHostSuffix().replaceAll("'", ''));
    await conn.end();
  });

  test('change user with collation', async ({ skip }) => {
    if (!shareConn.info.isMariaDB()) return skip();
    const conn = await createConnection();
    await conn.changeUser({
      user: 'ChangeUser',
      password: 'm1P4ssw0@rd',
      collation: 'UTF8MB4_PERSIAN_CI'
    });
    const res = await conn.query('SELECT CURRENT_USER');
    const user = res[0]['CURRENT_USER'];
    assert.equal(user, 'ChangeUser' + getHostSuffix().replaceAll("'", ''));
    assert.equal(conn.__tests.getCollation().name, 'UTF8MB4_PERSIAN_CI');
    await conn.end();
  });

  test('MySQL change user disabled', async ({ skip }) => {
    if (shareConn.info.isMariaDB()) return skip();
    try {
      await shareConn.changeUser({ user: 'ChangeUser' });
      throw new Error('must have thrown an error');
    } catch (err) {
      assert(err.message.includes('method changeUser not available'));
    }
  });

  test('autocommit state after changing user', async ({ skip }) => {
    if (!shareConn.info.isMariaDB()) return skip();
    const conn = await createConnection();
    assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 2);
    await conn.query('SET autocommit=1');
    assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 2);
    await conn.query('SET autocommit=0');
    assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 0);
    assert.equal(conn.info.database, Conf.baseConfig.database);
    await conn.query('USE test');
    assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 0);
    if (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 2, 2) && !isMaxscale(shareConn)) {
      assert.equal(conn.info.database, 'test');
    }
    await conn.changeUser({
      user: 'ChangeUser',
      password: 'm1P4ssw0@rd'
    });
    assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 2);
    assert.equal(conn.info.database, Conf.baseConfig.database);
    await conn.end();
  });

  test('collation index > 255', async ({ skip }) => {
    if (!shareConn.info.isMariaDB()) return skip(); // requires mariadb 10.2+
    const conn = await createConnection();
    const res = await conn.query('SELECT @@COLLATION_CONNECTION as c');
    assert.notEqual(res[0].c, 'utf8mb4_unicode_520_nopad_ci');
    await conn.changeUser({
      user: 'ChangeUser',
      password: 'm1P4ssw0@rd',
      collation: 'UTF8MB4_UNICODE_520_NOPAD_CI'
    });
    const res2 = await conn.query('SELECT @@COLLATION_CONNECTION as c');
    assert.equal(res2[0].c, 'utf8mb4_unicode_520_nopad_ci');
    await conn.end();
  });
});
