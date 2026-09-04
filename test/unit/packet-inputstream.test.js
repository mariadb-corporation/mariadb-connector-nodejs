//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import PacketInputStream from '../../lib/io/packet-input-stream.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import Conf from '../conf.js';
import ConnOptions from '../../lib/config/connection-options.js';
import Queue from 'denque';
import Command from '../../lib/cmd/command.js';
import ConnectionInformation from '../../lib/misc/connection-information.js';
import EventEmitter from 'node:events';
import Collations from '../../lib/const/collations.js';
import * as base from '../base.js';

describe.concurrent('test PacketInputStream data', () => {
  let bigSize = 20 * 1024 * 1024 - 1;
  let buf;
  const info = new ConnectionInformation({});
  // the reader reports an unrecoverable packet through the connection information, which Connection
  // wires to its own fatalError: the connection is closed rather than left with a broken stream
  const infoWithFatalError = (onFatalError) => new ConnectionInformation({}, null, onFatalError);
  const unexpectedPacket = (packet) => {
    throw new Error('unexpected packet');
  };

  class EmptyCmd extends Command {
    constructor(callback) {
      super(new EventEmitter());
      this.callback = callback;
      this.onPacketReceive = this.skipResults;
    }

    skipResults(packet, out, opts, info) {
      this.callback(packet);
      return null;
    }
  }

  beforeAll(() => {
    buf = Buffer.alloc(bigSize);
    for (let i = 0; i < buf.length; i++) {
      buf[i] = 65 + (i % 26);
    }
  });

  test('small complete packet', () => {
    let buf = Buffer.from([5, 0, 0, 0, 1, 2, 3, 4, 5]);
    const queue = new Queue();
    queue.push(
      new EmptyCmd((packet) => {
        assert.deepEqual(Buffer.from([1, 2, 3, 4, 5]), packet.buf.subarray(packet.pos, packet.end));
      })
    );
    let pis = new PacketInputStream(
      unexpectedPacket,
      queue,
      null,
      Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig)),
      info
    );
    pis.onData(buf);
  });

  test('small packet multi part header', () => {
    const queue = new Queue();
    queue.push(
      new EmptyCmd((packet) => {
        assert.deepEqual(Buffer.from([1, 2, 3, 4, 5]), packet.buf.subarray(packet.pos, packet.end));
      })
    );
    let pis = new PacketInputStream(
      unexpectedPacket,
      queue,
      null,
      Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig)),
      info
    );
    pis.onData(Buffer.from([5]));
    pis.onData(Buffer.from([0, 0, 0, 1, 2, 3, 4, 5]));
  });

  test('small packet multi part header 2', () => {
    const queue = new Queue();
    queue.push(
      new EmptyCmd((packet) => {
        assert.deepEqual(Buffer.from([1, 2, 3, 4, 5]), packet.buf.subarray(packet.pos, packet.end));
      })
    );

    let pis = new PacketInputStream(
      unexpectedPacket,
      queue,
      null,
      Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig)),
      info
    );
    pis.onData(Buffer.from([5, 0]));
    pis.onData(Buffer.from([0, 0, 1, 2, 3, 4, 5]));
  });

  test('small packet multi part header 3', () => {
    const queue = new Queue();
    queue.push(
      new EmptyCmd((packet) => {
        assert.deepEqual(Buffer.from([1, 2, 3, 4, 5]), packet.buf.subarray(packet.pos, packet.end));
      })
    );

    let pis = new PacketInputStream(
      unexpectedPacket,
      queue,
      null,
      Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig)),
      info
    );
    pis.onData(Buffer.from([5, 0]));
    pis.onData(Buffer.from([0]));
    pis.onData(Buffer.from([0, 1, 2, 3, 4, 5]));
  });

  test('small packet multi part header 4', () => {
    const queue = new Queue();
    queue.push(
      new EmptyCmd((packet) => {
        assert.deepEqual(Buffer.from([1, 2, 3, 4, 5]), packet.buf.subarray(packet.pos, packet.end));
      })
    );

    let pis = new PacketInputStream(
      unexpectedPacket,
      queue,
      null,
      Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig)),
      info
    );
    pis.onData(Buffer.from([5, 0]));
    pis.onData(Buffer.from([0, 0]));
    pis.onData(Buffer.from([1, 2, 3, 4, 5]));
  });

  test('small packet multi part data', () => {
    const queue = new Queue();
    queue.push(
      new EmptyCmd((packet) => {
        assert.deepEqual(Buffer.from([1, 2, 3, 4, 5]), packet.buf);
      })
    );

    let pis = new PacketInputStream(
      unexpectedPacket,
      queue,
      null,
      Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig)),
      info
    );
    pis.onData(Buffer.from([5, 0, 0, 0, 1, 2]));
    pis.onData(Buffer.from([3, 4, 5]));
  });

  test('big packet multi part data', async (done) => {
    await new Promise((resolve, reject) => {
      const queue = new Queue();
      queue.push(
        new EmptyCmd((packet) => {
          assert.deepEqual(buf, packet.buf);
          resolve();
        })
      );

      let pis = new PacketInputStream(
        unexpectedPacket,
        queue,
        null,
        Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig)),
        info
      );
      // post-authentication: reassembly is bounded by the connection value
      pis.maxAllowedPacket = pis.opts.maxAllowedPacket;
      pis.onData(Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0x00]), buf.slice(0, 16777215)]));
      pis.onData(Buffer.concat([Buffer.from([0x00, 0x00, 0x40, 0x01]), buf.slice(16777215)]));
    });
  }, 300000);

  test('big packet multi part data with part', async () => {
    await new Promise((resolve, reject) => {
      const queue = new Queue();
      queue.push(
        new EmptyCmd((packet) => {
          assert.deepEqual(buf, packet.buf);
          resolve();
        })
      );

      let pis = new PacketInputStream(
        unexpectedPacket,
        queue,
        null,
        Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig)),
        info
      );
      // post-authentication: reassembly is bounded by the connection value
      pis.maxAllowedPacket = pis.opts.maxAllowedPacket;
      pis.onData(Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0x00]), buf.slice(0, 1000000)]));
      pis.onData(buf.slice(1000000, 2000000));
      pis.onData(buf.slice(2000000, 16777215));
      pis.onData(Buffer.concat([Buffer.from([0x00, 0x00, 0x40, 0x01]), buf.slice(16777215, 17777215)]));
      pis.onData(buf.slice(17777215));
    });
  }, 300000);

  test('packet size with byte > 128', () => {
    let buf = Buffer.alloc(140);
    buf[0] = 0x88;
    buf[4] = 1;
    buf[5] = 2;

    let bufRes = Buffer.alloc(136);
    buf[0] = 1;
    buf[1] = 2;

    const queue = new Queue();
    queue.push(
      new EmptyCmd((packet) => {
        assert.deepEqual(bufRes, packet.buf);
      })
    );
    let pis = new PacketInputStream(
      unexpectedPacket,
      queue,
      null,
      Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig)),
      info
    );
    pis.onData(buf);
  });

  // CONJS-358: multi-part packet reassembly must be refused before authentication completes,
  // otherwise a malicious/MitM server can stream endless 0xffffff fragments and exhaust memory.
  // Before authentication the connection is bounded to 1Mb, so a 0xffffff fragment is refused on its
  // announced size alone — none of its payload is ever buffered.
  test('rejects a multi-part packet reassembled before authentication', () => {
    const queue = new Queue();
    queue.push(new EmptyCmd(() => assert.fail('no packet must be dispatched from a rejected fragment')));
    let fatalErr = null;
    const pis = new PacketInputStream(
      unexpectedPacket,
      queue,
      null,
      Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig)),
      infoWithFatalError((err) => (fatalErr = err))
    );
    // handshake phase: the 0xffffff header announces 16Mb, past the 1Mb bound, so the connection is
    // torn down on the first data event without dispatching or buffering anything.
    pis.onData(Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0x00]), buf.subarray(0, 1000000)]));
    assert.isNotNull(fatalErr);
    assert.equal(fatalErr.errno, 45011); // ER_UNEXPECTED_PACKET
    assert.include(fatalErr.message, 'before authentication');
    assert.isNull(pis.parts); // nothing buffered
  });

  test('permits multi-part reassembly once authentication has completed', () => {
    const queue = new Queue();
    let received = null;
    queue.push(new EmptyCmd((packet) => (received = packet)));
    let fatalErr = null;
    const pis = new PacketInputStream(
      unexpectedPacket,
      queue,
      null,
      Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig)),
      infoWithFatalError((err) => (fatalErr = err))
    );
    // post-authentication: reassembly is bounded by the connection value
    pis.maxAllowedPacket = pis.opts.maxAllowedPacket;
    // a 0xffffff fragment followed by a terminating shorter fragment reassembles normally
    pis.onData(Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0x00]), Buffer.alloc(16777215, 7)]));
    pis.onData(Buffer.from([2, 0, 0, 1, 8, 8]));
    assert.isNull(fatalErr);
    assert.isNotNull(received);
  });

  test('refuses a packet announcing more than maxAllowedPacket once authenticated', () => {
    const queue = new Queue();
    queue.push(new EmptyCmd(() => assert.fail('no packet must be dispatched from a refused packet')));
    let fatalErr = null;
    const pis = new PacketInputStream(
      unexpectedPacket,
      queue,
      null,
      Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig)),
      infoWithFatalError((err) => (fatalErr = err))
    );
    pis.maxAllowedPacket = 1000;
    // header announces 2000 bytes, twice the permitted value: refused before the payload arrives
    pis.onData(Buffer.from([0xd0, 0x07, 0x00, 0x00]));
    assert.isNotNull(fatalErr);
    assert.equal(fatalErr.errno, 45011); // ER_UNEXPECTED_PACKET
    assert.include(fatalErr.message, 'exceeds maxAllowedPacket');
    assert.notInclude(fatalErr.message, 'before authentication');
    assert.isNull(pis.parts);
  });

  test('refuses multi-part reassembly growing past maxAllowedPacket', () => {
    const queue = new Queue();
    queue.push(new EmptyCmd(() => assert.fail('no packet must be dispatched from a refused packet')));
    let fatalErr = null;
    const pis = new PacketInputStream(
      unexpectedPacket,
      queue,
      null,
      Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig)),
      infoWithFatalError((err) => (fatalErr = err))
    );
    pis.maxAllowedPacket = 20 * 1024 * 1024; //20Mb: one full fragment fits, two do not
    pis.onData(Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0x00]), buf.subarray(0, 16777215)]));
    assert.isNull(fatalErr); // 16Mb reassembled so far, still within bounds
    // a second 0xffffff fragment would take the total to 32Mb: refused
    pis.onData(Buffer.from([0xff, 0xff, 0xff, 0x01]));
    assert.isNotNull(fatalErr);
    assert.include(fatalErr.message, 'exceeds maxAllowedPacket');
    assert.isNull(pis.parts); // reassembly buffer released
  });

  test('accepts a packet exactly at maxAllowedPacket', () => {
    const queue = new Queue();
    let received = null;
    queue.push(new EmptyCmd((packet) => (received = packet)));
    let fatalErr = null;
    const pis = new PacketInputStream(
      unexpectedPacket,
      queue,
      null,
      Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig)),
      infoWithFatalError((err) => (fatalErr = err))
    );
    pis.maxAllowedPacket = 5; // boundary is inclusive: a 5 byte packet must pass
    pis.onData(Buffer.from([5, 0, 0, 0, 1, 2, 3, 4, 5]));
    assert.isNull(fatalErr);
    assert.isNotNull(received);
  });

  // a command is only given its onPacketReceive when it starts, so a command queued behind a
  // big send has none at all. currentCmd() discarding it would lose its response for good: only
  // a command that ended, which sets onPacketReceive to null, may be dropped. Same bug and fix as
  // Connection.activeReceiveCmd() in 1d9ae05, which this stream does not share code with.
  describe.concurrent('currentCmd (mirrors 1d9ae05)', () => {
    const newStream = () =>
      new PacketInputStream(
        unexpectedPacket,
        new Queue(),
        null,
        Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig)),
        info
      );

    test('a command queued but not started yet is never discarded', () => {
      const pis = newStream();
      const notStarted = { onPacketReceive: undefined }; // as built by Query/Execute before start()
      pis.receiveQueue.push(notStarted);

      assert.equal(pis.currentCmd(), notStarted, 'a command not started yet is still pending');
      assert.equal(pis.receiveQueue.length, 1, 'it must stay queued');
    });

    test('an ended command queued ahead of a not started one is dropped, the other kept', () => {
      const pis = newStream();
      const ended = { onPacketReceive: null };
      const notStarted = { onPacketReceive: undefined };
      pis.receiveQueue.push(ended);
      pis.receiveQueue.push(notStarted);

      assert.equal(pis.currentCmd(), notStarted);
      assert.equal(pis.receiveQueue.length, 1);
      assert.equal(pis.receiveQueue.peek(), notStarted);
    });

    // currentCmd() now keeps a not-started command in the queue instead of discarding it, so
    // receivePacketBasic/Debug must not blindly call its (nonexistent) onPacketReceive if a
    // packet arrives while it is still the only thing queued: nothing was ever sent for it, so
    // no packet can legitimately be meant for it either.
    test('a packet arriving for a not-started command is reported unexpected, not dispatched', () => {
      const queue = new Queue();
      const notStarted = { onPacketReceive: undefined };
      queue.push(notStarted);
      let reported = null;
      const pis = new PacketInputStream(
        (packet) => (reported = packet),
        queue,
        null,
        Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig)),
        info
      );

      assert.doesNotThrow(() => pis.onData(Buffer.from([5, 0, 0, 0, 1, 2, 3, 4, 5])));
      assert.isNotNull(reported, 'unexpectedPacket must be called');
      assert.equal(queue.length, 1, 'the not-started command must remain queued');
    });
  });

  test('collation change', () => {
    const opts = Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig));
    const queue = new Queue();
    let pis = new PacketInputStream(unexpectedPacket, queue, null, opts, info);
    if (base.utf8Collation()) {
      assert.equal(pis.encoding, 'utf8');
    }
    opts.emit('collation', Collations.fromName('BIG5_CHINESE_CI'));
    assert.equal(pis.encoding, 'big5');
  });
});
