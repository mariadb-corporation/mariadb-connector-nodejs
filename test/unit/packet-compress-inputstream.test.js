//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import CompressionInputStream from '../../lib/io/compression-input-stream.js';
import PacketInputStream from '../../lib/io/packet-input-stream.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import Conf from '../conf.js';
import ConnOptions from '../../lib/config/connection-options.js';
import Queue from 'denque';
import Command from '../../lib/cmd/command.js';
import ConnectionInformation from '../../lib/misc/connection-information.js';
import EventEmitter from 'node:events';
import ZLib from 'node:zlib';

describe.concurrent('test compress PacketInputStream data', () => {
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

  test('small complete packet', async () => {
    await new Promise((resolve, reject) => {
      const cis = createCompressObj(resolve, reject, Buffer.from([1, 2, 3, 4, 5]));
      cis.onData(Buffer.from([9, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 1, 2, 3, 4, 5]));
    });
  });

  test('small complete packet - 2 separate header packets', async () => {
    await new Promise((resolve, reject) => {
      const cis = createCompressObj(resolve, reject, Buffer.from([1, 2, 3, 4, 5]));
      cis.onData(Buffer.from([9]));
      cis.onData(Buffer.from([0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 1, 2, 3, 4, 5]));
    });
  });

  test('small complete packet - 2 other separate header packets', async () => {
    await new Promise((resolve, reject) => {
      const cis = createCompressObj(resolve, reject, Buffer.from([1, 2, 3, 4, 5]));
      cis.onData(Buffer.from([9, 0, 0, 0]));
      cis.onData(Buffer.from([0, 0, 0, 5, 0, 0, 0, 1, 2, 3, 4, 5]));
    });
  });

  test('small complete packet - many separate header packets', async () => {
    await new Promise((resolve, reject) => {
      const cis = createCompressObj(resolve, reject, Buffer.from([1, 2, 3, 4, 5]));
      cis.onData(Buffer.from([9, 0]));
      cis.onData(Buffer.from([0, 0]));
      cis.onData(Buffer.from([0, 0]));
      cis.onData(Buffer.from([0, 5]));
      cis.onData(Buffer.from([0, 0]));
      cis.onData(Buffer.from([0, 1]));
      cis.onData(Buffer.from([2, 3]));
      cis.onData(Buffer.from([4, 5]));
    });
  });

  test('big packet multi part data', async () => {
    await new Promise((resolve, reject) => {
      const cis = createCompressObj(resolve, reject, buf);

      const compressChunk1 = ZLib.deflateSync(
        Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0x00]), buf.slice(0, 16777211)])
      );
      const buf2 = Buffer.concat([
        buf.slice(16777211, 16777215),
        Buffer.from([0x00, 0x00, 0x40, 0x01]),
        buf.slice(16777215)
      ]);
      const compressChunk2 = ZLib.deflateSync(buf2);

      const header = Buffer.from([0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff]);
      header[0] = compressChunk1.length;
      header[1] = compressChunk1.length >>> 8;
      header[2] = compressChunk1.length >>> 16;

      cis.onData(Buffer.concat([header, compressChunk1]));

      const header2 = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

      header2[0] = compressChunk2.length;
      header2[1] = compressChunk2.length >>> 8;
      header2[2] = compressChunk2.length >>> 16;
      header2[3] = 1;
      header2[4] = buf2.length;
      header2[5] = buf2.length >>> 8;
      header2[6] = buf2.length >>> 16;

      cis.onData(Buffer.concat([header2, compressChunk2]));
    });
  }, 300000);

  function createCompressObj(resolve, reject, expectedBuf) {
    const queue = new Queue();
    queue.push(
      new EmptyCmd((packet) => {
        assert.deepEqual(expectedBuf, packet.buf.subarray(packet.pos, packet.end));
        resolve();
      })
    );
    const opts = Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig));
    const pis = new PacketInputStream(unexpectedPacket, queue, null, opts, info);
    // compression is only ever negotiated after authentication, so reassembly is bounded by the
    // connection value rather than the handshake one
    pis.maxAllowedPacket = opts.maxAllowedPacket;

    return new CompressionInputStream(pis, queue, opts, info);
  }
});

// a command is only given its onPacketReceive when it starts, so a command queued behind a big
// send has none at all. currentCmd() discarding it would lose its response for good: only a
// command that ended, which sets onPacketReceive to null, may be dropped. Same bug and fix as
// Connection.activeReceiveCmd() in 1d9ae05, which this stream does not share code with.
describe.concurrent('CompressionInputStream#currentCmd (mirrors 1d9ae05)', () => {
  const info = new ConnectionInformation({});
  const opts = Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig));

  const newStream = () => new CompressionInputStream(null, new Queue(), opts, info);

  test('a command queued but not started yet is never discarded', () => {
    const cis = newStream();
    const notStarted = { onPacketReceive: undefined }; // as built by Query/Execute before start()
    cis.receiveQueue.push(notStarted);

    assert.equal(cis.currentCmd(), notStarted, 'a command not started yet is still pending');
    assert.equal(cis.receiveQueue.length, 1, 'it must stay queued');
  });

  test('an ended command queued ahead of a not started one is dropped, the other kept', () => {
    const cis = newStream();
    const ended = { onPacketReceive: null };
    const notStarted = { onPacketReceive: undefined };
    cis.receiveQueue.push(ended);
    cis.receiveQueue.push(notStarted);

    assert.equal(cis.currentCmd(), notStarted);
    assert.equal(cis.receiveQueue.length, 1);
    assert.equal(cis.receiveQueue.peek(), notStarted);
  });
});
