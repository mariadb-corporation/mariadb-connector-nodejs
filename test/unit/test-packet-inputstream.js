//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2023 MariaDB Corporation Ab

'use strict';

const PacketInputStream = require('../../lib/io/packet-input-stream');
const { assert } = require('chai');
const Conf = require('../conf');
const ConnOptions = require('../../lib/config/connection-options');
const Queue = require('denque');
const Command = require('../../lib/cmd/command');
const ConnectionInformation = require('../../lib/misc/connection-information');
const EventEmitter = require('events');
const Collations = require('../../lib/const/collations');
const base = require('../base.js');

describe('test PacketInputStream data', () => {
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

  before(() => {
    buf = Buffer.alloc(bigSize);
    for (let i = 0; i < buf.length; i++) {
      buf[i] = 65 + (i % 26);
    }
  });

  it('small complete packet', () => {
    let buf = Buffer.from([5, 0, 0, 0, 1, 2, 3, 4, 5]);
    const queue = new Queue();
    queue.push(
      new EmptyCmd((packet) => {
        assert.deepEqual(Buffer.from([1, 2, 3, 4, 5]), packet.buf.slice(packet.pos, packet.end));
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

  it('small packet multi part header', () => {
    const queue = new Queue();
    queue.push(
      new EmptyCmd((packet) => {
        assert.deepEqual(Buffer.from([1, 2, 3, 4, 5]), packet.buf.slice(packet.pos, packet.end));
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

  it('small packet multi part header 2', () => {
    const queue = new Queue();
    queue.push(
      new EmptyCmd((packet) => {
        assert.deepEqual(Buffer.from([1, 2, 3, 4, 5]), packet.buf.slice(packet.pos, packet.end));
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

  it('small packet multi part header 3', () => {
    const queue = new Queue();
    queue.push(
      new EmptyCmd((packet) => {
        assert.deepEqual(Buffer.from([1, 2, 3, 4, 5]), packet.buf.slice(packet.pos, packet.end));
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

  it('small packet multi part header 4', () => {
    const queue = new Queue();
    queue.push(
      new EmptyCmd((packet) => {
        assert.deepEqual(Buffer.from([1, 2, 3, 4, 5]), packet.buf.slice(packet.pos, packet.end));
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

  it('small packet multi part data', () => {
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

  it('big packet multi part data', (done) => {
    const queue = new Queue();
    queue.push(
      new EmptyCmd((packet) => {
        assert.deepEqual(buf, packet.buf);
        done();
      })
    );

    let pis = new PacketInputStream(
      unexpectedPacket,
      queue,
      null,
      Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig)),
      info
    );
    pis.multiPacketAllowed = true; // post-authentication: multi-part reassembly is permitted
    pis.onData(Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0x00]), buf.slice(0, 16777215)]));
    pis.onData(Buffer.concat([Buffer.from([0x00, 0x00, 0x40, 0x01]), buf.slice(16777215)]));
  }).timeout(300000);

  it('big packet multi part data with part', (done) => {
    const queue = new Queue();
    queue.push(
      new EmptyCmd((packet) => {
        assert.deepEqual(buf, packet.buf);
        done();
      })
    );

    let pis = new PacketInputStream(
      unexpectedPacket,
      queue,
      null,
      Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig)),
      info
    );
    pis.multiPacketAllowed = true; // post-authentication: multi-part reassembly is permitted
    pis.onData(Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0x00]), buf.slice(0, 1000000)]));
    pis.onData(buf.slice(1000000, 2000000));
    pis.onData(buf.slice(2000000, 16777215));
    pis.onData(Buffer.concat([Buffer.from([0x00, 0x00, 0x40, 0x01]), buf.slice(16777215, 17777215)]));
    pis.onData(buf.slice(17777215));
    assert.ok(beenDispatch);
  }).timeout(300000);

  // CONJS-358: multi-part packet reassembly must be refused before authentication completes,
  // otherwise a malicious/MitM server can stream endless 0xffffff fragments and exhaust memory.
  // The refusal fires as soon as a 0xffffff fragment finishes reassembling, so at most one is held.
  it('rejects a multi-part packet reassembled before authentication', () => {
    const queue = new Queue();
    queue.push(new EmptyCmd(() => assert.fail('no packet must be dispatched from a rejected fragment')));
    let fatalErr = null;
    const pis = new PacketInputStream(
      unexpectedPacket,
      queue,
      null,
      Object.assign(new EventEmitter(), new ConnOptions(Conf.baseConfig)),
      info,
      (err) => (fatalErr = err)
    );
    // multiPacketAllowed defaults to false (handshake phase). Feed one full 0xffffff fragment split
    // across two data events; nothing is dispatched and the connection is torn down on completion.
    pis.onData(Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0x00]), buf.slice(0, 1000000)]));
    assert.isNull(fatalErr); // fragment still incomplete — no decision yet
    pis.onData(buf.slice(1000000, 16777215));
    assert.isNotNull(fatalErr);
    assert.equal(fatalErr.errno, 45011); // ER_UNEXPECTED_PACKET
    assert.include(fatalErr.message, 'before authentication');
    assert.isNull(pis.parts); // buffered fragment released
  }).timeout(300000);

  it('packet size with byte > 128', () => {
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

  it('collation change', () => {
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
