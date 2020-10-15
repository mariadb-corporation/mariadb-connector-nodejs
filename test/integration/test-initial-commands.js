'use strict';

const base = require('../base.js');
const { assert } = require('chai');

describe('initial connection commands', () => {
  describe('session variables', () => {
    it('with empty session variables', function (done) {
      base
        .createConnection({ sessionVariables: {} })
        .then((conn) => {
          conn
            .query('SELECT 1')
            .then((rows) => {
              assert.deepEqual(rows, [{ 1: 1 }]);
              conn.end();
              done();
            })
            .catch(done);
        })
        .catch(done);
    });

    it('with one session variables', function (done) {
      base
        .createConnection({ sessionVariables: { wait_timeout: 10000 } })
        .then((conn) => {
          conn
            .query('SELECT @@wait_timeout')
            .then((rows) => {
              assert.deepEqual(rows, [{ '@@wait_timeout': 10000 }]);
              conn.end();
              done();
            })
            .catch(done);
        })
        .catch(done);
    });

    it('with multiple session variables', function (done) {
      base
        .createConnection({
          sessionVariables: { wait_timeout: 10000, interactive_timeout: 2540 }
        })
        .then((conn) => {
          conn
            .query('SELECT @@wait_timeout, @@interactive_timeout')
            .then((rows) => {
              assert.deepEqual(rows, [{ '@@wait_timeout': 10000, '@@interactive_timeout': 2540 }]);
              conn.end();
              done();
            })
            .catch(done);
        })
        .catch(done);
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
            .query('SELECT 1')
            .then((rows) => {
              assert.deepEqual(rows, [{ 1: 1 }]);
              conn.end();
              done();
            })
            .catch(done);
        })
        .catch(done);
    });

    it('with one initial SQL', function (done) {
      base
        .createConnection({ initSql: 'SET @user_var=1' })
        .then((conn) => {
          conn
            .query('SELECT @user_var')
            .then((rows) => {
              assert.deepEqual(rows, [{ '@user_var': 1 }]);
              conn.end();
              done();
            })
            .catch(done);
        })
        .catch(done);
    });

    it('with multiple initial SQL', function (done) {
      base
        .createConnection({ initSql: ['SET @user_var=1', 'SET @user_var2=2'] })
        .then((conn) => {
          conn
            .query('SELECT @user_var, @user_var2')
            .then((rows) => {
              assert.deepEqual(rows, [{ '@user_var': 1, '@user_var2': 2 }]);
              conn.end();
              done();
            })
            .catch(done);
        })
        .catch(done);
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
