//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB Corporation Ab

'use strict';

import { assert, describe, test } from 'vitest';
import EventEmitter from 'node:events';

import Connection from '../../lib/connection.js';
import ConnOptions from '../../lib/config/connection-options.js';
import Query from '../../lib/cmd/query.js';

// CONJS-361: without pipelining a command is sent only while no other command is receiving packets.
// The packet reader drops a finished command from the receive queue when reading the *following*
// packet, so a command completing on the last packet of a chunk stays queued. Considering such a
// stale entry active deadlocks the connection: the queued command waits for an 'end' event that has
// already been emitted, and nothing is ever sent again.

// minimal command: `alive` mimics a command still expecting packets from the server
class FakeCmd extends EventEmitter {
  constructor(alive) {
    super();
    this.started = false;
    this.onPacketReceive = alive ? () => {} : null;
  }

  start() {
    this.started = true;
  }
}

const newConn = () => new Connection(new ConnOptions({ pipelining: false }));

describe.concurrent('command queue without pipelining (CONJS-361)', () => {
  test('sends immediately when nothing is in flight', () => {
    const conn = newConn();
    const cmd = new FakeCmd(true);
    conn.addCommandEnable(cmd, true);
    assert.isTrue(cmd.started);
    assert.equal(conn.sendQueue.length, 0);
  });

  test('a finished command left in the receive queue does not hold the next one back', () => {
    const conn = newConn();
    const ended = new FakeCmd(false); // completed on the last packet of a chunk, not yet dequeued
    conn.receiveQueue.push(ended);

    const cmd = new FakeCmd(true);
    conn.addCommandEnable(cmd, true);

    assert.isTrue(cmd.started, 'command must be sent, the queued one has ended');
    assert.equal(conn.sendQueue.length, 0, 'command must not wait in the send queue');
    assert.equal(conn.receiveQueue.length, 1, 'ended command must have been discarded');
    assert.equal(conn.receiveQueue.peekFront(), cmd);
  });

  // a command is only given its onPacketReceive when it starts, so a command queued behind a big
  // send has none at all. Discarding it would lose its response for good: only a command that ended,
  // which sets onPacketReceive to null, may be dropped.
  test('a command queued but not started yet is never discarded', () => {
    const conn = newConn();
    const notStarted = new FakeCmd(true);
    notStarted.onPacketReceive = undefined; // as built by Query/Execute before start()
    conn.receiveQueue.push(notStarted);

    assert.equal(conn.activeReceiveCmd(), notStarted, 'a command not started yet is still pending');
    assert.equal(conn.receiveQueue.length, 1, 'it must stay queued');

    const cmd = new FakeCmd(true);
    conn.addCommandEnable(cmd, true);
    assert.isFalse(cmd.started, 'nothing may be sent while it waits to start');
  });

  test('an ended command queued ahead of a not started one is dropped, the other kept', () => {
    const conn = newConn();
    const ended = new FakeCmd(false); // onPacketReceive === null
    const notStarted = new FakeCmd(true);
    notStarted.onPacketReceive = undefined;
    conn.receiveQueue.push(ended);
    conn.receiveQueue.push(notStarted);

    assert.equal(conn.activeReceiveCmd(), notStarted);
    assert.equal(conn.receiveQueue.length, 1);
    assert.equal(conn.receiveQueue.peekFront(), notStarted);
  });

  test('waits while a command is still receiving packets', () => {
    const conn = newConn();
    const active = new FakeCmd(true);
    conn.receiveQueue.push(active);

    const cmd = new FakeCmd(true);
    conn.addCommandEnable(cmd, true);

    assert.isFalse(cmd.started, 'a command is still active: nothing may be sent');
    assert.equal(conn.sendQueue.length, 1);
    assert.equal(conn.receiveQueue.peekFront(), active, 'active command must stay queued');
  });

  test('an ended command is not reported as running', () => {
    const conn = newConn();
    assert.isNull(conn.activeReceiveCmd(), 'nothing queued');

    conn.receiveQueue.push(new FakeCmd(false));
    conn.receiveQueue.push(new FakeCmd(false));
    assert.isNull(conn.activeReceiveCmd(), 'only ended commands queued');
    assert.equal(conn.receiveQueue.length, 0, 'ended commands are discarded');

    const active = new FakeCmd(true);
    conn.receiveQueue.push(new FakeCmd(false));
    conn.receiveQueue.push(active);
    assert.equal(conn.activeReceiveCmd(), active, 'command behind an ended one is found');
    assert.equal(conn.receiveQueue.length, 1);
  });

  test('waits when an ended command is queued ahead of an active one', () => {
    const conn = newConn();
    const ended = new FakeCmd(false);
    const active = new FakeCmd(true);
    conn.receiveQueue.push(ended);
    conn.receiveQueue.push(active);

    const cmd = new FakeCmd(true);
    conn.addCommandEnable(cmd, true);

    assert.isFalse(cmd.started, 'the active command behind the ended one must still be awaited');
    assert.equal(conn.sendQueue.length, 1);
    assert.equal(conn.receiveQueue.peekFront(), active);
  });
});

// A not-started command has onPacketReceive === undefined, not null: it is still waiting on a
// response the now-dead socket can no longer deliver, so a fatal socket error must reach it too,
// not just commands already mid-flight. Same bug and fix as activeReceiveCmd() above, in the
// error-dispatch path instead of the peek path. See 1d9ae05.
class ThrowSpyCmd extends EventEmitter {
  constructor(onPacketReceive) {
    super();
    this.onPacketReceive = onPacketReceive;
    this.thrownWith = null;
  }

  throwError(err) {
    this.onPacketReceive = null;
    this.thrownWith = err;
  }
}

const nextTick = () => new Promise((resolve) => setImmediate(resolve));

describe.concurrent('socketErrorDispatchToQueries (mirrors 1d9ae05)', () => {
  test('a real not-started command rejects when the socket fails', async () => {
    const conn = newConn();
    let rejectedWith = null;
    let ended = false;
    const cmd = new Query(
      () => {},
      (err) => (rejectedWith = err),
      new ConnOptions({ pipelining: false }),
      { sql: 'SELECT 1' }
    );
    cmd.once('end', () => (ended = true));
    conn.receiveQueue.push(cmd);
    const err = new Error('socket destroyed');

    assert.isUndefined(cmd.onPacketReceive, 'Query assigns its packet handler in start()');
    assert.isTrue(conn.socketErrorDispatchToQueries(err));
    await nextTick();

    assert.equal(rejectedWith, err);
    assert.isTrue(ended);
    assert.isNull(cmd.onPacketReceive);
  });

  test('a not started command is notified of a fatal socket error', async () => {
    const conn = newConn();
    const notStarted = new ThrowSpyCmd(undefined); // as built by Query/Execute before start()
    conn.receiveQueue.push(notStarted);
    const err = new Error('socket destroyed');

    const dispatched = conn.socketErrorDispatchToQueries(err);
    await nextTick();

    assert.isTrue(dispatched, 'a command was waiting and must be reported as notified');
    assert.equal(notStarted.thrownWith, err, 'the not-started command must receive the error');
  });

  test('an already ended command is not notified again', async () => {
    const conn = newConn();
    const ended = new ThrowSpyCmd(null);
    conn.receiveQueue.push(ended);

    const dispatched = conn.socketErrorDispatchToQueries(new Error('socket destroyed'));
    await nextTick();

    assert.isFalse(dispatched, 'nothing was actually waiting');
    assert.isNull(ended.thrownWith, 'an ended command must not be re-notified');
  });

  test('every non-ended command in the queue is notified, started or not', async () => {
    const conn = newConn();
    const active = new ThrowSpyCmd(() => {});
    const notStarted = new ThrowSpyCmd(undefined);
    conn.receiveQueue.push(active);
    conn.receiveQueue.push(notStarted);
    const err = new Error('socket destroyed');

    const dispatched = conn.socketErrorDispatchToQueries(err);
    await nextTick();

    assert.isTrue(dispatched);
    assert.equal(active.thrownWith, err);
    assert.equal(notStarted.thrownWith, err);
    assert.equal(conn.receiveQueue.length, 0, 'the queue is always drained');
  });
});
