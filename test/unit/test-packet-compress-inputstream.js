'use strict';

const CompressionInputStream = require('../../lib/io/compression-input-stream');
const PacketInputStream = require('../../lib/io/packet-input-stream');
const { assert } = require('chai');
const Conf = require('../conf');
const ConnOptions = require('../../lib/config/connection-options');
const Queue = require('denque');
const Command = require('../../lib/cmd/command');
const ConnectionInformation = require('../../lib/misc/connection-information');
const EventEmitter = require('events');
const ZLib = require('zlib');

describe('test compress PacketInputStream data', () => {
  let bigSize = 20 * 1024 * 1024 - 1;
  let buf;
  const info = new ConnectionInformation();
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

  before(() => {
    buf = Buffer.alloc(bigSize);
    for (let i = 0; i < buf.length; i++) {
      buf[i] = 65 + (i % 26);
    }
  });

  it('small complete packet', (done) => {
    const cis = createCompressObj(done, Buffer.from([1, 2, 3, 4, 5]));
    cis.onData(Buffer.from([9, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 1, 2, 3, 4, 5]));
  });

  it('small complete packet - 2 separate header packets', (done) => {
    const cis = createCompressObj(done, Buffer.from([1, 2, 3, 4, 5]));
    cis.onData(Buffer.from([9]));
    cis.onData(Buffer.from([0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 1, 2, 3, 4, 5]));
  });

  it('small complete packet - 2 other separate header packets', (done) => {
    const cis = createCompressObj(done, Buffer.from([1, 2, 3, 4, 5]));
    cis.onData(Buffer.from([9, 0, 0, 0]));
    cis.onData(Buffer.from([0, 0, 0, 5, 0, 0, 0, 1, 2, 3, 4, 5]));
  });

  it('small complete packet - many separate header packets', (done) => {
    const cis = createCompressObj(done, Buffer.from([1, 2, 3, 4, 5]));
    cis.onData(Buffer.from([9, 0]));
    cis.onData(Buffer.from([0, 0]));
    cis.onData(Buffer.from([0, 0]));
    cis.onData(Buffer.from([0, 5]));
    cis.onData(Buffer.from([0, 0]));
    cis.onData(Buffer.from([0, 1]));
    cis.onData(Buffer.from([2, 3]));
    cis.onData(Buffer.from([4, 5]));
  });

  it('big packet multi part data', (done) => {
    const cis = createCompressObj(done, buf);

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
  }).timeout(300000);

  function createCompressObj(done, expectedBuf) {
    const queue = new Queue();
    queue.push(
      new EmptyCmd((packet) => {
        assert.deepEqual(expectedBuf, packet.buf);
        done();
      })
    );
    const opts = Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig));
    const pis = new PacketInputStream(unexpectedPacket, queue, null, opts, info);

    const cis = new CompressionInputStream(pis, queue, opts, info);
    return cis;
  }
});
