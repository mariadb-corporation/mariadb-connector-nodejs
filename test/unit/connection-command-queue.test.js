//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB Corporation Ab

'use strict';

import { assert, describe, test } from 'vitest';
import EventEmitter from 'node:events';

import Connection from '../../lib/connection.js';
import ConnOptions from '../../lib/config/connection-options.js';

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
