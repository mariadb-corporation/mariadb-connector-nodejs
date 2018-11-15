"use strict";

const Utils = require("../../../lib/misc/utils");
const { assert } = require("chai");
const BulkPacket = require("../../../lib/io/bulk-packet");
const ConnOptions = require("../../../lib/config/connection-options");
const Conf = require("../../conf");
const PacketOutputStream = require("../../../lib/io/packet-output-stream");
describe("packet", () => {
  const baseOpts = Conf.baseConfig;
  const head = Buffer.from([0xaa, 0xbb, 0xcc, 0x33]);
  const buf = Buffer.from([0xf0, 0x9f, 0xa4, 0x98, 0xf0, 0x9f, 0x92, 0xaa]); // 🤘💪
  const longbuf = Buffer.from([
    0x00,
    0x01,
    0x02,
    0x03,
    0x04,
    0x05,
    0x06,
    0x07,
    0x08,
    0x09,
    0x0a,
    0x0b,
    0x0c,
    0x0d,
    0x0e,
    0x0f,
    0x10
  ]);

  it("datatypeChanged", () => {
    const conOpts = new ConnOptions(baseOpts);
    const out = new PacketOutputStream(conOpts, null);
    const packet = new BulkPacket(conOpts, out, [
      true,
      1,
      new Date(),
      buf,
      {
        type: "Point",
        coordinates: [10, 10]
      },
      {
        blabla: "bouh",
        tt: 10
      }
    ]);
    assert.isFalse(
      packet.datatypeChanged([
        true,
        1,
        new Date(),
        buf,
        {
          type: "Point",
          coordinates: [10, 10]
        },
        {
          blabla: "bouh",
          tt: 10
        }
      ])
    );

    assert.isTrue(packet.datatypeChanged([true]));
    assert.isTrue(
      packet.datatypeChanged([
        "true",
        1,
        new Date(),
        buf,
        {
          type: "Point",
          coordinates: [10, 10]
        },
        {
          blabla: "bouh",
          tt: 10
        }
      ])
    );
    assert.isTrue(
      packet.datatypeChanged([
        true,
        true,
        new Date(),
        buf,
        {
          type: "Point",
          coordinates: [10, 10]
        },
        {
          blabla: "bouh",
          tt: 10
        }
      ])
    );

    assert.isTrue(
      packet.datatypeChanged([
        true,
        new Date(),
        true,
        buf,
        {
          type: "Point",
          coordinates: [10, 10]
        },
        {
          blabla: "bouh",
          tt: 10
        }
      ])
    );
    assert.isTrue(
      packet.datatypeChanged([
        true,
        1,
        buf,
        {
          type: "Point",
          coordinates: [10, 10]
        },
        new Date(),

        {
          blabla: "bouh",
          tt: 10
        }
      ])
    );
    assert.isTrue(
      packet.datatypeChanged([
        true,
        1,
        new Date(),
        buf,
        {
          blabla: "bouh",
          tt: 10
        },
        {
          type: "Point",
          coordinates: [10, 10]
        }
      ])
    );
  });

  it("writeLengthStringAscii", () => {
    const conOpts = new ConnOptions(baseOpts);
    const out = new PacketOutputStream(conOpts, null);
    let packet = new BulkPacket(conOpts, out, [true]);

    let prevPos = packet.pos;

    packet.writeLengthStringAscii("hello basic ascii");
    assert.equal(packet.pos, prevPos + 18);
    assert.equal(packet.buf[prevPos], 17);
    assert.deepEqual(packet.buf.slice(prevPos + 1, prevPos + 18), Buffer.from("hello basic ascii"));

    //BIG ASCII
    packet = new BulkPacket(conOpts, out, [true]);
    prevPos = packet.pos;

    let str = "abcdefghij";
    for (let i = 0; i < 8; i++) {
      str += str;
    }
    packet.writeLengthStringAscii(str);
    assert.equal(packet.pos, prevPos + 2560 + 3);
    assert.equal(packet.buf[prevPos], 0xfc);
    assert.equal(packet.buf[prevPos + 1], 0);
    assert.equal(packet.buf[prevPos + 2], 10);
    assert.deepEqual(packet.buf.slice(prevPos + 3, prevPos + 2560 + 3), Buffer.from(str));
  });

  it("writeLength", () => {
    const conOpts = new ConnOptions(baseOpts);
    const out = new PacketOutputStream(conOpts, null);
    let packet = new BulkPacket(conOpts, out, [true]);

    let prevPos = packet.pos;

    packet.writeLength(20);
    assert.equal(packet.pos, prevPos + 1);
    assert.equal(packet.buf[prevPos++], 20);

    packet.writeLength(2000);
    assert.equal(packet.pos, prevPos + 3);
    assert.equal(packet.buf[prevPos], 0xfc);
    assert.equal(packet.buf[prevPos + 1], 208);
    assert.equal(packet.buf[prevPos + 2], 7);
    prevPos += 3;

    packet.writeLength(1000000);
    assert.equal(packet.pos, prevPos + 4);
    assert.equal(packet.buf[prevPos], 0xfd);
    assert.equal(packet.buf[prevPos + 1], 64);
    assert.equal(packet.buf[prevPos + 2], 66);
    assert.equal(packet.buf[prevPos + 3], 15);

    packet.pos = packet.buf.length;
    prevPos = packet.pos;
    packet.writeLength(20);
    assert.equal(packet.pos, prevPos + 1);
    assert.equal(packet.buf[prevPos], 20);

    packet.pos = packet.buf.length;
    prevPos = packet.pos;
    packet.writeLength(2000);
    assert.equal(packet.pos, prevPos + 3);
    assert.equal(packet.buf[prevPos], 0xfc);
    assert.equal(packet.buf[prevPos + 1], 208);
    assert.equal(packet.buf[prevPos + 2], 7);

    packet.pos = packet.buf.length;
    prevPos = packet.pos;
    packet.writeLength(1000000);
    assert.equal(packet.pos, prevPos + 4);
    assert.equal(packet.buf[prevPos], 0xfd);
    assert.equal(packet.buf[prevPos + 1], 64);
    assert.equal(packet.buf[prevPos + 2], 66);
    assert.equal(packet.buf[prevPos + 3], 15);

  });

});
