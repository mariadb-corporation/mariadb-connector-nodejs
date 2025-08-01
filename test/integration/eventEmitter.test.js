//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import { createCallbackConnection, createConnection } from '../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';

const basicListener = function basicListener(err) {
  console.log(err);
};
describe('EventEmitter', () => {
  test('event testing promise', async function () {
    const conn = await createConnection();
    testEvent(conn);
    await conn.end();
  });

  test('event testing callback', async () => {
    const conn = createCallbackConnection();
    await new Promise((resolve, reject) => {
      conn.connect(() => {
        testEvent(conn);
        conn.end(resolve);
      });
    });
  });

  function testEvent(conn) {
    assert.equal(0, conn.listeners('error').length);
    conn.on('error', basicListener);
    assert.equal(1, conn.listeners('error').length);
    conn.once('error', basicListener);
    assert.equal(2, conn.listeners('error').length);
    conn.off('error', basicListener);
    assert.equal(1, conn.listeners('error').length);
    conn.addListener('error', basicListener);
    assert.equal(2, conn.listeners('error').length);
    conn.addListener('other', basicListener);
    assert.equal(1, conn.listeners('other').length);
    conn.addListener('error', (err) => {});
    assert.equal(3, conn.listeners('error').length);
    // [ 'close_prepare', 'error', 'other' ]
    assert.equal(3, conn.eventNames().length);
    assert.isOk(conn.getMaxListeners() > 0);
    assert.equal(3, conn.listenerCount('error'));
    conn.prependListener('error', basicListener);
    assert.equal(4, conn.listenerCount('error'));
    conn.prependOnceListener('error', basicListener);
    assert.equal(5, conn.listenerCount('error'));
    assert.equal(1, conn.listenerCount('other'));
    conn.removeListener('error', basicListener);
    assert.equal(4, conn.listenerCount('error'));
    assert.equal(4, conn.rawListeners('error').length);
    conn.removeAllListeners('error');
    assert.equal(0, conn.listenerCount('error'));
    assert.equal(1, conn.listenerCount('other'));
    conn.removeAllListeners('other');
    assert.equal(0, conn.listenerCount('error'));
    assert.equal(0, conn.listenerCount('other'));
    conn.setMaxListeners(41);
    assert.equal(41, conn.getMaxListeners());
  }
});
