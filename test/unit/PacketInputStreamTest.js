"use strict";

const PacketInputStream = require("../../src/io/packet_input_stream");
const assert = require("chai").assert;

describe("test PacketInputStream data", () => {
  let bigSize = 20 * 1024 * 1024 - 1;
  let buf;
  let longTest = process.env.TEST_LONG ? process.env.TEST_PORT : false;

  before(() => {
    buf = Buffer.alloc(bigSize);
    for (let i = 0; i < buf.length; i++) {
      buf[i] = 65 + i % 26;
    }
  });

  it("small complete packet", () => {
    let conn = {
      _dispatchPacket: packet => {
        assert.deepEqual(Buffer.from([1, 2, 3, 4, 5]), packet._toBuf());
      }
    };
    let buf = Buffer.from([5, 0, 0, 0, 1, 2, 3, 4, 5]);
    let pis = new PacketInputStream(conn._dispatchPacket.bind(conn));
    pis.onData(buf);
  });

  it("small packet multi part header", () => {
    let conn = {
      _dispatchPacket: packet => {
        assert.deepEqual(Buffer.from([1, 2, 3, 4, 5]), packet._toBuf());
      }
    };

    let pis = new PacketInputStream(conn._dispatchPacket.bind(conn));
    pis.onData(Buffer.from([5]));
    pis.onData(Buffer.from([0, 0, 0, 1, 2, 3, 4, 5]));
  });

  it("small packet multi part header 2", () => {
    let conn = {
      _dispatchPacket: packet => {
        assert.deepEqual(Buffer.from([1, 2, 3, 4, 5]), packet._toBuf());
      }
    };

    let pis = new PacketInputStream(conn._dispatchPacket.bind(conn));
    pis.onData(Buffer.from([5, 0]));
    pis.onData(Buffer.from([0, 0, 1, 2, 3, 4, 5]));
  });

  it("small packet multi part header 3", () => {
    let conn = {
      _dispatchPacket: packet => {
        assert.deepEqual(Buffer.from([1, 2, 3, 4, 5]), packet._toBuf());
      }
    };

    let pis = new PacketInputStream(conn._dispatchPacket.bind(conn));
    pis.onData(Buffer.from([5, 0]));
    pis.onData(Buffer.from([0]));
    pis.onData(Buffer.from([0, 1, 2, 3, 4, 5]));
  });

  it("small packet multi part header 4", () => {
    let conn = {
      _dispatchPacket: packet => {
        assert.deepEqual(Buffer.from([1, 2, 3, 4, 5]), packet._toBuf());
      }
    };

    let pis = new PacketInputStream(conn._dispatchPacket.bind(conn));
    pis.onData(Buffer.from([5, 0]));
    pis.onData(Buffer.from([0, 0]));
    pis.onData(Buffer.from([1, 2, 3, 4, 5]));
  });

  it("small packet multi part data", () => {
    let conn = {
      _dispatchPacket: packet => {
        assert.deepEqual(Buffer.from([1, 2, 3, 4, 5]), packet._toBuf());
      }
    };

    let pis = new PacketInputStream(conn._dispatchPacket.bind(conn));
    pis.onData(Buffer.from([5, 0, 0, 0, 1, 2]));
    pis.onData(Buffer.from([3, 4, 5]));
  });

  it("big packet multi part data", () => {
    let beenDispatch = false;
    let conn = {
      _dispatchPacket: packet => {
        const received = packet._toBuf();
        assert.lengthOf(received, bigSize);
        if (longTest) {
          for (var i = 0; i < received.length; i++) {
            assert.equal(65 + i % 26, received[i], "difference at i=" + i);
          }
        }
        beenDispatch = true;
      }
    };

    let pis = new PacketInputStream(conn._dispatchPacket.bind(conn));
    pis.onData(Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0x00]), buf.slice(0, 16777215)]));
    pis.onData(Buffer.concat([Buffer.from([0x00, 0x00, 0x40, 0x01]), buf.slice(16777215)]));
    assert.ok(beenDispatch);
  }).timeout(90000);

  it("big packet multi part data with part", () => {
    let beenDispatch = false;
    let conn = {
      _dispatchPacket: packet => {
        const received = packet._toBuf();
        assert.lengthOf(received, bigSize);
        if (longTest) {
          for (let i = 0; i < received.length; i++) {
            assert.equal(65 + i % 26, received[i], "difference at i=" + i);
          }
        }
        beenDispatch = true;
      }
    };

    let pis = new PacketInputStream(conn._dispatchPacket.bind(conn));
    pis.onData(Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0x00]), buf.slice(0, 1000000)]));
    pis.onData(buf.slice(1000000, 2000000));
    pis.onData(buf.slice(2000000, 16777215));
    pis.onData(
      Buffer.concat([Buffer.from([0x00, 0x00, 0x40, 0x01]), buf.slice(16777215, 17777215)])
    );
    pis.onData(buf.slice(17777215));
    assert.ok(beenDispatch);
  }).timeout(90000);
});
