//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import { createConnection } from '../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';

describe.concurrent('initial connection commands', () => {
  describe.concurrent('session variables', () => {
    test('with empty session variables', async () => {
      const conn = await createConnection({ sessionVariables: {} });
      const rows = await conn.query("SELECT '1'");
      assert.deepEqual(rows, [{ 1: '1' }]);
      await conn.end();
    });

    test('with one session variables', async function () {
      const conn = await createConnection({ sessionVariables: { wait_timeout: 10000 } });
      const rows = await conn.query('SELECT @@wait_timeout');
      assert.deepEqual(rows, [{ '@@wait_timeout': BigInt(10000) }]);
      await conn.end();
    });

    test('with multiple session variables', async function () {
      const conn = await createConnection({
        sessionVariables: { wait_timeout: 10000, interactive_timeout: 2540 }
      });
      const rows = await conn.query('SELECT @@wait_timeout, @@interactive_timeout');
      assert.deepEqual(rows, [
        {
          '@@wait_timeout': BigInt(10000),
          '@@interactive_timeout': BigInt(2540)
        }
      ]);
      await conn.end();
    });

    test('error handling', async () => {
      try {
        await createConnection({ sessionVariables: { sql_mode: 'WRONG' } });
        throw new Error('must not have succeed');
      } catch (err) {
        assert(err.message.includes('Error setting session variable'));
        assert.equal(err.sqlState, '08S01');
        assert.equal(err.code, 'ER_SETTING_SESSION_ERROR');
      }
    });
  });

  describe.concurrent('initial SQL', function () {
    test('with empty initial SQL', async () => {
      const conn = await createConnection({ initSql: '' });
      const rows = await conn.query("SELECT '1'");
      assert.deepEqual(rows, [{ 1: '1' }]);
      await conn.end();
    });

    test('with one initial SQL', async function () {
      const conn = await createConnection({ initSql: 'SET @user_var=1' });
      const rows = await conn.query('SELECT @user_var');
      assert.deepEqual(rows, [{ '@user_var': BigInt(1) }]);
      await conn.end();
    });

    test('with multiple initial SQL', async function () {
      const conn = await createConnection({
        initSql: ['SET @user_var=1', 'SET @user_var2=2']
      });
      const rows = await conn.query('SELECT @user_var, @user_var2');
      assert.deepEqual(rows, [{ '@user_var': BigInt(1), '@user_var2': BigInt(2) }]);
      await conn.end();
    });

    test('error handling', async () => {
      try {
        await createConnection({ initSql: 'WRONG SQL' });
        throw new Error('must not have succeed');
      } catch (err) {
        assert(err.message.includes('Error executing initial sql command:'));
        assert.equal(err.sqlState, '08S01');
        assert.equal(err.code, 'ER_INITIAL_SQL_ERROR');
      }
    });
  });
});
