//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2023 MariaDB Corporation Ab

'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const ServerStatus = require('../../lib/const/server-status');
const Conf = require('../conf');
const { isXpand } = require('../base');
const path = require('path');
const os = require('os');
const fs = require('fs');
const winston = require('winston');

describe('change user', () => {
  before(async () => {
    if (process.env.srv !== 'maxscale' && process.env.srv !== 'skysql-ha') {
      await shareConn.query("DROP USER ChangeUser@'%'").catch((e) => {});
      await shareConn.query("DROP USER ChangeUser2@'%'").catch((e) => {});
      await shareConn.query('CREATE DATABASE IF NOT EXISTS test');
      await shareConn.query("CREATE USER ChangeUser@'%' IDENTIFIED BY 'm1P4ssw0@rd'");
      await shareConn.query('GRANT SELECT,EXECUTE ON `' + Conf.baseConfig.database + "`.* TO ChangeUser@'%'");
      await shareConn.query("CREATE USER ChangeUser2@'%' IDENTIFIED BY 'm1SecondP@rd'");
      await shareConn.query(
        'GRANT SELECT,EXECUTE ON `' + Conf.baseConfig.database + "`.* TO ChangeUser2@'%' with grant option"
      );
      await shareConn.query('FLUSH PRIVILEGES');
    }
  });

  after(async () => {
    if (process.env.srv !== 'maxscale' && process.env.srv !== 'skysql-ha') {
      await shareConn.query("DROP USER ChangeUser@'%'").catch((e) => {});
      await shareConn.query("DROP USER ChangeUser2@'%'").catch((e) => {});
    }
  });

  it('basic change user using callback', function (done) {
    if (process.env.srv == 'maxscale' || process.env.srv === 'skysql-ha' || isXpand()) this.skip();
    if (!shareConn.info.isMariaDB()) this.skip();
    const conn = base.createCallbackConnection();
    conn.connect((err) => {
      if (err) done(err);

      conn.query('SELECT CURRENT_USER', (err, res) => {
        const currUser = res[0]['CURRENT_USER'];
        conn.changeUser({ user: 'ChangeUser', password: 'm1P4ssw0@rd' }, (err) => {
          if (err) {
            done(err);
          } else {
            conn.query('SELECT CURRENT_USER', (err, res) => {
              const user = res[0]['CURRENT_USER'];
              assert.equal(user, 'ChangeUser@%');
              assert(user !== currUser);
              conn.end();
              done();
            });
          }
        });
      });
    });
  });

  it('wrong charset', function (done) {
    if (process.env.srv == 'maxscale' || process.env.srv === 'skysql-ha' || isXpand()) this.skip();
    if (!shareConn.info.isMariaDB()) this.skip();
    base.createConnection().then((conn) => {
      conn
        .changeUser({
          user: 'ChangeUser',
          password: 'm1P4ssw0@rd',
          charset: 'wrong'
        })
        .then(() => {
          done(new Error('must have thrown error!'));
        })
        .catch((err) => {
          assert(err.message.includes('Unknown charset'));
          conn.end();
          done();
        });
    });
  });

  it('wrong collation in charset', function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha' || isXpand()) this.skip();
    if (!shareConn.info.isMariaDB()) this.skip();
    const tmpLogFile = path.join(os.tmpdir(), 'wrongCollation.txt');
    try {
      fs.unlinkSync(tmpLogFile);
    } catch (e) {}
    let logger = winston.createLogger({
      transports: [new winston.transports.File({ filename: tmpLogFile })]
    });
    base
      .createConnection({
        logger: {
          warning: (msg) => logger.info(msg)
        }
      })
      .then((conn) => {
        conn
          .changeUser({
            user: 'ChangeUser',
            password: 'm1P4ssw0@rd',
            charset: 'UTF8MB4_UNICODE_CI'
          })
          .then(() => {
            logger.end();
            //wait 100ms to ensure stream has been written
            setTimeout(() => {
              conn.end();
              const data = fs.readFileSync(tmpLogFile, 'utf8');
              assert.isTrue(
                data.includes(
                  "warning: please use option 'collation' in replacement of 'charset' when using a collation name ('UTF8MB4_UNICODE_CI')"
                ),
                data
              );
              try {
                fs.unlinkSync(tmpLogFile);
              } catch (e) {}
              done();
            }, 100);
          })
          .catch(done);
      });
  });

  it('wrong collation', function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha' || isXpand()) this.skip();
    if (!shareConn.info.isMariaDB()) this.skip();
    base.createConnection().then((conn) => {
      conn
        .changeUser({
          user: 'ChangeUser',
          password: 'm1P4ssw0@rd',
          collation: 'wrong_collation'
        })
        .then(() => {
          done(new Error('must have thrown error!'));
        })
        .catch((err) => {
          assert(err.message.includes("Unknown collation 'WRONG_COLLATION'"));
          conn.end();
          done();
        });
    });
  });

  it('basic change user using callback no function', function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha' || isXpand()) this.skip();
    if (!shareConn.info.isMariaDB()) this.skip();
    const conn = base.createCallbackConnection();
    conn.connect((err) => {
      if (err) done(err);
      conn.changeUser({
        user: 'ChangeUser',
        password: 'm1P4ssw0@rd'
      });

      conn.query('SELECT CURRENT_USER', (err, res) => {
        conn.changeUser({ user: 'ChangeUser', password: 'm1P4ssw0@rd' });
        conn.end(() => {
          done();
        });
      });
    });
  });

  it('callback change user without option', function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha' || isXpand()) this.skip();
    if (!shareConn.info.isMariaDB()) this.skip();
    const conn = base.createCallbackConnection();
    conn.connect((err) => {
      if (err) {
        done(err);
      } else {
        conn.changeUser((err) => {
          if (err) {
            done(err);
          } else {
            conn.end();
            done();
          }
        });
      }
    });
  });

  it('basic change user using promise', function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha' || isXpand()) this.skip();
    if (!shareConn.info.isMariaDB()) this.skip();

    base
      .createConnection()
      .then((conn) => {
        return conn
          .changeUser({
            user: 'ChangeUser',
            password: 'm1P4ssw0@rd',
            connectAttributes: { par1: 'bouh', par2: 'bla' }
          })
          .then(() => {
            return conn.query('SELECT CURRENT_USER');
          })
          .then((res) => {
            const user = res[0]['CURRENT_USER'];
            assert.equal(user, 'ChangeUser@%');
            return conn.changeUser({
              user: 'ChangeUser2',
              password: 'm1SecondP@rd',
              connectAttributes: true
            });
          })
          .then(() => {
            return conn.query('SELECT CURRENT_USER');
          })
          .then((res) => {
            const user = res[0]['CURRENT_USER'];
            assert.equal(user, 'ChangeUser2@%');
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('change user using connection attributes', function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha' || isXpand()) this.skip();
    if (!shareConn.info.isMariaDB()) this.skip();

    base
      .createConnection({ connectAttributes: { param1: 'test' } })
      .then((conn) => {
        return conn
          .changeUser({
            user: 'ChangeUser',
            password: 'm1P4ssw0@rd',
            connectAttributes: { par1: 'bouh', par2: 'bla' }
          })
          .then(() => {
            return conn.query('SELECT CURRENT_USER');
          })
          .then((res) => {
            const user = res[0]['CURRENT_USER'];
            assert.equal(user, 'ChangeUser@%');
            return conn.changeUser({
              user: 'ChangeUser2',
              password: 'm1SecondP@rd',
              connectAttributes: true
            });
          })
          .then(() => {
            return conn.query('SELECT CURRENT_USER');
          })
          .then((res) => {
            const user = res[0]['CURRENT_USER'];
            assert.equal(user, 'ChangeUser2@%');
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('basic change user using promise non node.js encoding', function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha' || isXpand()) this.skip();
    if (!shareConn.info.isMariaDB()) this.skip();

    base
      .createConnection()
      .then((conn) => {
        return conn
          .changeUser({
            user: 'ChangeUser',
            password: 'm1P4ssw0@rd',
            connectAttributes: { par1: 'bouh', par2: 'bla' },
            charset: 'big5'
          })
          .then(() => {
            return conn.query('SELECT CURRENT_USER');
          })
          .then((res) => {
            const user = res[0]['CURRENT_USER'];
            assert.equal(user, 'ChangeUser@%');
            return conn.changeUser({
              user: 'ChangeUser2',
              password: 'm1SecondP@rd',
              connectAttributes: true
            });
          })
          .then(() => {
            return conn.query('SELECT CURRENT_USER');
          })
          .then((res) => {
            const user = res[0]['CURRENT_USER'];
            assert.equal(user, 'ChangeUser2@%');
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('change user with collation', function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha' || isXpand()) this.skip();
    if (!shareConn.info.isMariaDB()) this.skip();
    base
      .createConnection()
      .then((conn) => {
        conn
          .changeUser({
            user: 'ChangeUser',
            password: 'm1P4ssw0@rd',
            collation: 'UTF8_PERSIAN_CI'
          })
          .then(() => {
            return conn.query('SELECT CURRENT_USER');
          })
          .then((res) => {
            const user = res[0]['CURRENT_USER'];
            assert.equal(user, 'ChangeUser@%');
            assert.equal(conn.__tests.getCollation().name, 'UTF8_PERSIAN_CI');
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('MySQL change user disabled', function (done) {
    if (shareConn.info.isMariaDB()) this.skip();
    shareConn
      .changeUser({ user: 'ChangeUser' })
      .then(() => {
        done(new Error('must have thrown an error'));
      })
      .catch((err) => {
        assert(err.message.includes('method changeUser not available'));
        done();
      });
  });

  it('autocommit state after changing user', function (done) {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha' || isXpand()) this.skip();
    if (!shareConn.info.isMariaDB()) this.skip();
    base
      .createConnection()
      .then((conn) => {
        assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 2);
        conn
          .query('SET autocommit=1')
          .then(() => {
            assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 2);
            return conn.query('SET autocommit=0');
          })
          .then(() => {
            assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 0);
            assert.equal(conn.info.database, Conf.baseConfig.database);
            return conn.query('USE test');
          })
          .then(() => {
            assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 0);
            if (
              shareConn.info.isMariaDB() &&
              shareConn.info.hasMinVersion(10, 2, 2) &&
              process.env.srv !== 'maxscale' &&
              process.env.srv !== 'skysql-ha'
            ) {
              assert.equal(conn.info.database, 'test');
            }
            return conn.changeUser({
              user: 'ChangeUser',
              password: 'm1P4ssw0@rd'
            });
          })
          .then(() => {
            assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 2);
            assert.equal(conn.info.database, Conf.baseConfig.database);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('collation index > 255', async function () {
    if (process.env.srv === 'maxscale' || process.env.srv === 'skysql-ha' || isXpand()) this.skip();
    if (!shareConn.info.isMariaDB()) this.skip(); // requires mariadb 10.2+
    const conn = await base.createConnection();
    const res = await conn.query('SELECT @@COLLATION_CONNECTION as c');
    assert.notEqual(res[0].c, 'utf8mb4_unicode_520_nopad_ci');
    await conn.changeUser({
      user: 'ChangeUser',
      password: 'm1P4ssw0@rd',
      collation: 'UTF8MB4_UNICODE_520_NOPAD_CI'
    });
    const res2 = await conn.query('SELECT @@COLLATION_CONNECTION as c');
    assert.equal(res2[0].c, 'utf8mb4_unicode_520_nopad_ci');
    conn.end();
  });
});
