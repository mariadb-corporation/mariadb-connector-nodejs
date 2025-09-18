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
