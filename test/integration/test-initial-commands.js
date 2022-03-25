'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const { isXpand } = require('../base');

describe('initial connection commands', () => {
  describe('session variables', () => {
    it('with empty session variables', function (done) {
      base
        .createConnection({ sessionVariables: {} })
        .then((conn) => {
          conn
            .query("SELECT '1'")
            .then((rows) => {
              assert.deepEqual(rows, [{ 1: '1' }]);
              conn.end();
              done();
            })
            .catch(done);
        })
        .catch(done);
    });

    it('with one session variables', async function () {
      const conn = await base.createConnection({ sessionVariables: { wait_timeout: 10000 } });
      const rows = await conn.query('SELECT @@wait_timeout');
      assert.deepEqual(rows, [{ '@@wait_timeout': isXpand() ? 10000 : BigInt(10000) }]);
      conn.end();
    });

    it('with multiple session variables', async function () {
      const conn = await base.createConnection({
        sessionVariables: { wait_timeout: 10000, interactive_timeout: 2540 }
      });
      const rows = await conn.query('SELECT @@wait_timeout, @@interactive_timeout');
      assert.deepEqual(rows, [
        {
          '@@wait_timeout': isXpand() ? 10000 : BigInt(10000),
          '@@interactive_timeout': isXpand() ? 2540 : BigInt(2540)
        }
      ]);
      conn.end();
    });

    it('error handling', function (done) {
      base
        .createConnection({ sessionVariables: { sql_mode: 'WRONG' } })
        .then((conn) => {
          done(new Error('must not have succeed'));
        })
        .catch((err) => {
          assert(err.message.includes('Error setting session variable'));
          assert.equal(err.sqlState, '08S01');
          assert.equal(err.code, 'ER_SETTING_SESSION_ERROR');
          done();
        });
    });
  });
  describe('initial SQL', () => {
    it('with empty initial SQL', function (done) {
      base
        .createConnection({ initSql: '' })
        .then((conn) => {
          conn
            .query("SELECT '1'")
            .then((rows) => {
              assert.deepEqual(rows, [{ 1: '1' }]);
              conn.end();
              done();
            })
            .catch(done);
        })
        .catch(done);
    });

    it('with one initial SQL', async function () {
      const conn = await base.createConnection({ initSql: 'SET @user_var=1' });
      const rows = await conn.query('SELECT @user_var');
      assert.deepEqual(rows, [{ '@user_var': BigInt(1) }]);
      conn.end();
    });

    it('with multiple initial SQL', async function () {
      const conn = await base.createConnection({
        initSql: ['SET @user_var=1', 'SET @user_var2=2']
      });
      const rows = await conn.query('SELECT @user_var, @user_var2');
      assert.deepEqual(rows, [{ '@user_var': BigInt(1), '@user_var2': BigInt(2) }]);
      conn.end();
    });

    it('error handling', function (done) {
      base
        .createConnection({ initSql: 'WRONG SQL' })
        .then((conn) => {
          done(new Error('must not have succeed'));
        })
        .catch((err) => {
          assert(err.message.includes('Error executing initial sql command:'));
          assert.equal(err.sqlState, '08S01');
          assert.equal(err.code, 'ER_INITIAL_SQL_ERROR');
          done();
        });
    });
  });
});
