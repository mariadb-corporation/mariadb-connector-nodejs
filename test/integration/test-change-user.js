'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const ServerStatus = require('../../lib/const/server-status');
const Conf = require('../conf');

describe('change user', () => {
  before(done => {
    shareConn.query("CREATE USER ChangeUser@'%' IDENTIFIED BY 'mypassword'");
    shareConn.query(
      "GRANT ALL PRIVILEGES ON *.* TO ChangeUser@'%' with grant option"
    );
    shareConn
      .query('FLUSH PRIVILEGES')
      .then(() => done())
      .catch(err => done());
  });

  after(done => {
    shareConn.query("DROP USER ChangeUser@'%'");
    shareConn
      .query('FLUSH PRIVILEGES')
      .then(() => done())
      .catch(err => done());
  });

  it('basic change user using callback', function(done) {
    if (!shareConn.info.isMariaDB()) this.skip();
    const conn = base.createCallbackConnection();
    conn.connect(err => {
      if (err) done(err);

      conn.query('SELECT CURRENT_USER', (err, res) => {
        const currUser = res[0]['CURRENT_USER'];
        conn.changeUser({ user: 'ChangeUser', password: 'mypassword' }, err => {
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

  it('wrong charset', function(done) {
    if (!shareConn.info.isMariaDB()) this.skip();
    base.createConnection().then(conn => {
      conn
        .changeUser({
          user: 'ChangeUser',
          password: 'mypassword',
          charset: 'wrong'
        })
        .then(() => {
          done(new Error('must have thrown error!'));
        })
        .catch(err => {
          assert(err.message.includes('Unknown charset'));
          conn.end();
          done();
        });
    });
  });

  it('basic change user using callback no function', function(done) {
    if (process.env.MAXSCALE_VERSION) this.skip();
    if (!shareConn.info.isMariaDB()) this.skip();
    const conn = base.createCallbackConnection();
    conn.connect(err => {
      if (err) done(err);
      conn.changeUser();
      conn.changeUser(err => {});
      conn.query('SELECT CURRENT_USER', (err, res) => {
        conn.changeUser({ user: 'ChangeUser', password: 'mypassword' });
        conn.end(() => {
          done();
        });
      });
    });
  });

  it('basic change user using promise', function(done) {
    if (process.env.MAXSCALE_VERSION) this.skip();
    if (!shareConn.info.isMariaDB()) this.skip();
    const baseConf = Conf.baseConfig;

    let initialUser;
    base
      .createConnection()
      .then(conn => {
        conn
          .query('SELECT CURRENT_USER')
          .then(res => {
            initialUser = res[0]['CURRENT_USER'];
            return conn.changeUser({
              user: 'ChangeUser',
              password: 'mypassword',
              connectAttributes: { par1: 'bouh', par2: 'bla' }
            });
          })
          .then(() => {
            return conn.query('SELECT CURRENT_USER');
          })
          .then(res => {
            const user = res[0]['CURRENT_USER'];
            assert.equal(user, 'ChangeUser@%');
            assert(user !== initialUser);
            return conn.changeUser({
              user: baseConf.user,
              password: baseConf.password,
              connectAttributes: true
            });
          })
          .then(() => {
            return conn.query('SELECT CURRENT_USER');
          })
          .then(res => {
            const user = res[0]['CURRENT_USER'];
            assert.equal(user, initialUser);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('change user with collation', function(done) {
    if (!shareConn.info.isMariaDB()) this.skip();
    base
      .createConnection()
      .then(conn => {
        conn
          .changeUser({
            user: 'ChangeUser',
            password: 'mypassword',
            charset: 'UTF8_PERSIAN_CI'
          })
          .then(() => {
            return conn.query('SELECT CURRENT_USER');
          })
          .then(res => {
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

  it('MySQL change user disabled', function(done) {
    if (shareConn.info.isMariaDB()) this.skip();
    shareConn
      .changeUser({ user: 'ChangeUser' })
      .then(() => {
        done(new Error('must have thrown an error'));
      })
      .catch(err => {
        assert(err.message.includes('method changeUser not available'));
        done();
      });
  });

  it('autocommit state after changing user', function(done) {
    if (!shareConn.info.isMariaDB()) this.skip();
    base
      .createConnection()
      .then(conn => {
        assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 2);
        conn
          .query('SET autocommit=1')
          .then(() => {
            assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 2);
            return conn.query('SET autocommit=0');
          })
          .then(() => {
            assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 0);
            return conn.changeUser({
              user: 'ChangeUser',
              password: 'mypassword'
            });
          })
          .then(() => {
            assert.equal(conn.info.status & ServerStatus.STATUS_AUTOCOMMIT, 2);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });
});
