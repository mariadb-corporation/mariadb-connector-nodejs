//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB Corporation Ab

'use strict';

import { assert, describe, test } from 'vitest';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import Conf from '../conf.js';
import { createCallbackConnection, isDeno } from '../base.js';

// CONJS-329: the callback API bridges promises to node-style callbacks. When the callback is invoked
// from a then() handler, an exception it throws rejects that promise and is handed to the chain's
// catch() - the same callback - so an application bug is reported as a database error, and the
// callback runs twice. Exceptions thrown by a callback belong to the application: they must
// propagate, exactly as they do from a `conn.query()` callback.

const callbackApi = pathToFileURL(path.resolve('callback.js')).href;
const MARKER = 'BOOM_FROM_CALLBACK';

/**
 * Run a snippet in its own process, so an exception escaping a callback can terminate it.
 * `body` runs with `conn` connected, and must throw {@link MARKER} from a driver callback.
 *
 * Node only: the child is spawned through `process.execPath` with node's own CLI flags, which deno -
 * where that path is the deno binary - rejects. The behaviour under test is the shape of the promise
 * chain the callback is invoked from, so it does not depend on the runtime.
 */
const runChild = (body) =>
  new Promise((resolve) => {
    const script = `
      import * as mariadb from ${JSON.stringify(callbackApi)};
      const conn = mariadb.createConnection(${JSON.stringify(Conf.baseConfig)});
      conn.connect((err) => {
        if (err) { console.error('CONNECT_FAILED ' + err.message); process.exit(3); }
        ${body}
      });
      // the exception must kill this process well before that
      setTimeout(() => { console.error('NO_EXCEPTION'); process.exit(4); }, 10000).unref();
    `;
    execFile(process.execPath, ['--input-type=module', '-e', script], { timeout: 30000 }, (err, stdout, stderr) =>
      resolve({ code: err ? err.code : 0, stdout, stderr })
    );
  });

const assertPropagated = (res) => {
  assert.notInclude(res.stderr, 'CONNECT_FAILED', 'child could not connect');
  assert.notInclude(res.stderr, 'NO_EXCEPTION', 'exception was swallowed: nothing happened');
  assert.notInclude(res.stdout, 'REPORTED_AS_DB_ERROR', 'exception was reported to the callback as a database error');
  assert.include(res.stderr, MARKER, 'exception must reach the process as an uncaught exception');
  assert.notEqual(res.code, 0, 'process must terminate on the uncaught exception');
};

describe.concurrent('callback exception propagation (CONJS-329)', () => {
  // `err` is only ever a database error: a callback re-entered with its own exception prints this
  const guard = `if (err) { console.log('REPORTED_AS_DB_ERROR ' + err.message); process.exit(5); }`;

  test.skipIf(isDeno())(
    'conn.query callback',
    async () => {
      assertPropagated(await runChild(`conn.query('SELECT 1', (err) => { ${guard} throw new Error('${MARKER}'); });`));
    },
    60000
  );

  test.skipIf(isDeno())(
    'conn.prepare callback',
    async () => {
      assertPropagated(
        await runChild(`conn.prepare('SELECT ? as a', (err) => { ${guard} throw new Error('${MARKER}'); });`)
      );
    },
    60000
  );

  test.skipIf(isDeno())(
    'prepare.execute callback',
    async () => {
      assertPropagated(
        await runChild(`
        conn.prepare('SELECT ? as a', (err, stmt) => {
          ${guard}
          stmt.execute([1], (err) => { ${guard} throw new Error('${MARKER}'); });
        });`)
      );
    },
    60000
  );

  test.skipIf(isDeno())(
    'conn.execute callback',
    async () => {
      assertPropagated(
        await runChild(`conn.execute('SELECT ? as a', [1], (err) => { ${guard} throw new Error('${MARKER}'); });`)
      );
    },
    60000
  );

  test.skipIf(isDeno())(
    'conn.ping callback',
    async () => {
      assertPropagated(await runChild(`conn.ping((err) => { ${guard} throw new Error('${MARKER}'); });`));
    },
    60000
  );

  test.skipIf(isDeno())(
    'conn.end callback',
    async () => {
      assertPropagated(await runChild(`conn.end((err) => { ${guard} throw new Error('${MARKER}'); });`));
    },
    60000
  );

  // the other half of the contract: a real error still reaches the callback, once
  test('database errors are still delivered exactly once', async () => {
    const conn = createCallbackConnection();
    try {
      await new Promise((resolve, reject) => conn.connect((err) => (err ? reject(err) : resolve())));
      for (const run of [
        (cb) => conn.query('SELECT * FROM tbl_that_does_not_exist', cb),
        (cb) => conn.prepare('SELECT * FROM tbl_that_does_not_exist', cb)
      ]) {
        const calls = [];
        await new Promise((resolve) => {
          run((err) => {
            calls.push(err);
            setTimeout(resolve, 250); // leave time for a second, unwanted, call
          });
        });
        assert.lengthOf(calls, 1, 'callback must be called once');
        assert.equal(calls[0].code, 'ER_NO_SUCH_TABLE');
      }
    } finally {
      conn.end(() => {});
    }
  }, 60000);
});
