'use strict';

const { assert } = require('chai');
const BulkPacket = require('../../../lib/io/bulk-packet');
const ConnOptions = require('../../../lib/config/connection-options');
const Conf = require('../../conf');
const PacketOutputStream = require('../../../lib/io/packet-output-stream');
const ConnectionInformation = require('../../../lib/misc/connection-information');
const EventEmitter = require('events');
const base = require('../../base.js');

const MAX_BUFFER_SIZE = 16777219;

describe('bulk packet', () => {
  const baseOpts = Conf.baseConfig;
  const buf = Buffer.from([0xf0, 0x9f, 0xa4, 0x98, 0xf0, 0x9f, 0x92, 0xaa]); // 🤘💪

  const getStream = () => {
    const stream = new Object();
    stream.bufs = [];
    stream.writeBuf = (buf) => {
      stream.bufs.push(buf);
    };
    stream.reset = () => {
      stream.bufs = [];
    };
    return stream;
  };

  it('datatypeChanged', () => {
    const conOpts = Object.assign(new EventEmitter(), new ConnOptions(baseOpts));
    const out = new PacketOutputStream(conOpts, new ConnectionInformation());
    const packet = new BulkPacket(conOpts, out, [
      true,
      1,
      new Date(),
      buf,
      {
        type: 'Point',
        coordinates: [10, 10]
      },
      {
        blabla: 'bouh',
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
          type: 'Point',
          coordinates: [10, 10]
        },
        {
          blabla: 'bouh',
          tt: 10
        }
      ])
    );

    assert.isTrue(packet.datatypeChanged([true]));
    assert.isTrue(
      packet.datatypeChanged([
        'true',
        1,
        new Date(),
        buf,
        {
          type: 'Point',
          coordinates: [10, 10]
        },
        {
          blabla: 'bouh',
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
          type: 'Point',
          coordinates: [10, 10]
        },
        {
          blabla: 'bouh',
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
          type: 'Point',
          coordinates: [10, 10]
        },
        {
          blabla: 'bouh',
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
          type: 'Point',
          coordinates: [10, 10]
        },
        new Date(),

        {
          blabla: 'bouh',
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
          blabla: 'bouh',
          tt: 10
        },
        {
          type: 'Point',
          coordinates: [10, 10]
        }
      ])
    );
  });

  it('writeLengthStringAscii', () => {
    const conOpts = Object.assign(new EventEmitter(), new ConnOptions(baseOpts));
    const out = new PacketOutputStream(conOpts, new ConnectionInformation());
    let packet = new BulkPacket(conOpts, out, [true]);

    let prevPos = packet.pos;

    packet.writeLengthStringAscii('hello basic ascii');
    assert.equal(packet.pos, prevPos + 18);
    assert.equal(packet.buf[prevPos], 17);
    assert.deepEqual(packet.buf.slice(prevPos + 1, prevPos + 18), Buffer.from('hello basic ascii'));

    //BIG ASCII
    packet = new BulkPacket(conOpts, out, [true]);
    prevPos = packet.pos;

    let str = 'abcdefghij';
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

  it('writeLength', () => {
    const conOpts = Object.assign(new EventEmitter(), new ConnOptions(baseOpts));
    const out = new PacketOutputStream(conOpts, new ConnectionInformation());
    const stream = getStream();
    out.setStream(stream);
    let packet = new BulkPacket(conOpts, out, [true]);
    out.startPacket(this);
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
    prevPos += 4;

    packet.writeLength(20000000);
    assert.equal(packet.pos, prevPos + 9);
    assert.equal(packet.buf[prevPos], 0xfe);
    assert.equal(packet.buf[prevPos + 1], 0);
    assert.equal(packet.buf[prevPos + 2], 45);
    assert.equal(packet.buf[prevPos + 3], 0x31);
    assert.equal(packet.buf[prevPos + 4], 0x01);
    assert.equal(packet.buf[prevPos + 5], 0);
    assert.equal(packet.buf[prevPos + 6], 0);
    assert.equal(packet.buf[prevPos + 7], 0);
    assert.equal(packet.buf[prevPos + 8], 0);

    //test with buffer growing
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

    prevPos = packet.pos;
    packet.writeLength(20000000);
    assert.equal(packet.pos, prevPos + 9);
    assert.equal(packet.buf[prevPos], 0xfe);
    assert.equal(packet.buf[prevPos + 1], 0);
    assert.equal(packet.buf[prevPos + 2], 45);
    assert.equal(packet.buf[prevPos + 3], 0x31);
    assert.equal(packet.buf[prevPos + 4], 0x01);
    assert.equal(packet.buf[prevPos + 5], 0);
    assert.equal(packet.buf[prevPos + 6], 0);
    assert.equal(packet.buf[prevPos + 7], 0);
    assert.equal(packet.buf[prevPos + 8], 0);

    //test with flushing
    packet.writeBuffer(Buffer.allocUnsafe(MAX_BUFFER_SIZE - packet.pos));
    stream.reset();
    assert.equal(stream.bufs.length, 0);

    packet.writeLength(20);
    assert.equal(packet.pos, 5);
    assert.equal(packet.buf[4], 20);
    assert.equal(stream.bufs.length, 1);

    packet.writeBuffer(Buffer.allocUnsafe(MAX_BUFFER_SIZE - (packet.pos + 1)));
    stream.reset();
    assert.equal(stream.bufs.length, 0);
    packet.writeLength(2000);
    assert.equal(stream.bufs.length, 1);
    assert.equal(stream.bufs[0][MAX_BUFFER_SIZE - 1], 0xfc);
    assert.equal(packet.pos, 6);
    assert.equal(packet.buf[4], 208);
    assert.equal(packet.buf[5], 7);

    packet.writeBuffer(Buffer.allocUnsafe(MAX_BUFFER_SIZE - (packet.pos + 1)));
    stream.reset();
    assert.equal(stream.bufs.length, 0);
    packet.writeLength(1000000);
    assert.equal(stream.bufs.length, 1);
    assert.equal(stream.bufs[0][MAX_BUFFER_SIZE - 1], 0xfd);
    assert.equal(packet.pos, 7);
    assert.equal(packet.buf[4], 64);
    assert.equal(packet.buf[5], 66);
    assert.equal(packet.buf[6], 15);
    assert.equal(stream.bufs.length, 1);

    packet.writeBuffer(Buffer.allocUnsafe(MAX_BUFFER_SIZE - (packet.pos + 1)));
    stream.reset();
    assert.equal(stream.bufs.length, 0);
    packet.writeLength(20000000);
    assert.equal(packet.pos, 12);
    assert.equal(stream.bufs.length, 1);
    assert.equal(stream.bufs[0][MAX_BUFFER_SIZE - 1], 0xfe);
    assert.equal(packet.buf[4], 0);
    assert.equal(packet.buf[5], 45);
    assert.equal(packet.buf[6], 0x31);
    assert.equal(packet.buf[7], 0x01);
    assert.equal(packet.buf[8], 0);
    assert.equal(packet.buf[9], 0);
    assert.equal(packet.buf[10], 0);
    assert.equal(packet.buf[11], 0);
  });

  const baseSt = 'abcdefghij';
  const generateString = (len) => {
    let str = '';
    for (let i = 0; i < len / 10; i++) str += baseSt;
    return str;
  };

  it('writeDefaultLengthEncodedString', function () {
    if (!base.utf8Collation()) this.skip();
    const conOpts = Object.assign(new EventEmitter(), new ConnOptions(baseOpts));
    let out = new PacketOutputStream(conOpts, new ConnectionInformation());
    let stream = getStream();
    out.setStream(stream);
    let packet = new BulkPacket(conOpts, out, [true]);
    out.startPacket(this);
    let prevPos = packet.pos;

    let str = generateString(20);
    packet.writeDefaultLengthEncodedString(str);
    assert.equal(packet.pos, prevPos + 21);
    assert.equal(packet.buf[prevPos++], 20);
    assert.isTrue(packet.buf.slice(prevPos, prevPos + 20).equals(Buffer.from(str)));
    prevPos += 20;

    str = generateString(2000);
    packet.writeDefaultLengthEncodedString(str);
    assert.equal(packet.pos, prevPos + 2003);
    assert.equal(packet.buf[prevPos], 0xfc);
    assert.equal(packet.buf[prevPos + 1], 208);
    assert.equal(packet.buf[prevPos + 2], 7);
    assert.isTrue(packet.buf.slice(prevPos + 3, prevPos + 2003).equals(Buffer.from(str)));
    prevPos += 2003;

    str = generateString(1000000);
    packet.writeDefaultLengthEncodedString(str);
    assert.equal(packet.pos, prevPos + 1000004);
    assert.equal(packet.buf[prevPos], 0xfd);
    assert.equal(packet.buf[prevPos + 1], 64);
    assert.equal(packet.buf[prevPos + 2], 66);
    assert.equal(packet.buf[prevPos + 3], 15);
    assert.isTrue(packet.buf.slice(prevPos + 4, prevPos + 1000004).equals(Buffer.from(str)));
    prevPos += 1000004;

    str = generateString(20000000);
    packet.writeDefaultLengthEncodedString(str);
    assert.equal(packet.pos, 4224835);
    assert.equal(stream.bufs[0][prevPos], 0xfe);
    assert.equal(stream.bufs[0][prevPos + 1], 0);
    assert.equal(stream.bufs[0][prevPos + 2], 45);
    assert.equal(stream.bufs[0][prevPos + 3], 0x31);
    assert.equal(stream.bufs[0][prevPos + 4], 0x01);
    assert.equal(stream.bufs[0][prevPos + 5], 0);
    assert.equal(stream.bufs[0][prevPos + 6], 0);
    assert.equal(stream.bufs[0][prevPos + 7], 0);
    assert.equal(stream.bufs[0][prevPos + 8], 0);

    assert.isTrue(
      stream.bufs[0]
        .slice(prevPos + 9, MAX_BUFFER_SIZE)
        .equals(Buffer.from(str.substring(0, MAX_BUFFER_SIZE - (prevPos + 9))))
    );
    assert.isTrue(
      packet.buf
        .slice(4, packet.pos)
        .equals(Buffer.from(str.substring(MAX_BUFFER_SIZE - (prevPos + 9))))
    );

    stream.reset();
    assert.equal(stream.bufs.length, 0);

    prevPos = packet.pos;
    str = generateString(2000);
    packet.writeDefaultLengthEncodedString(str);
    assert.equal(packet.pos, prevPos + 2003);
    assert.equal(packet.buf[prevPos], 0xfc);
    assert.equal(packet.buf[prevPos + 1], 208);
    assert.equal(packet.buf[prevPos + 2], 7);
    assert.isTrue(packet.buf.slice(prevPos + 3, prevPos + 2003).equals(Buffer.from(str)));
    prevPos += 2003;

    str = generateString(1000000);
    packet.writeDefaultLengthEncodedString(str);
    assert.equal(packet.pos, prevPos + 1000004);
    assert.equal(packet.buf[prevPos], 0xfd);
    assert.equal(packet.buf[prevPos + 1], 64);
    assert.equal(packet.buf[prevPos + 2], 66);
    assert.equal(packet.buf[prevPos + 3], 15);
    assert.isTrue(packet.buf.slice(prevPos + 4, prevPos + 1000004).equals(Buffer.from(str)));
  });

  it('writeBinaryLocalDate', () => {
    const conOpts = Object.assign(new EventEmitter(), new ConnOptions(baseOpts));
    let out = new PacketOutputStream(conOpts, new ConnectionInformation());
    let stream = getStream();
    out.setStream(stream);
    let packet = new BulkPacket(conOpts, out, [true]);
    out.startPacket(this);
    let prevPos = packet.pos;

    // normal

    packet.writeBinaryLocalDate(new Date('2020-12-31 23:58:59'));
    assert.equal(packet.pos, prevPos + 8);
    assert.equal(packet.buf[prevPos++], 7);
    assert.equal(packet.buf[prevPos++], 228);
    assert.equal(packet.buf[prevPos++], 7);
    assert.equal(packet.buf[prevPos++], 12);
    assert.equal(packet.buf[prevPos++], 31);
    assert.equal(packet.buf[prevPos++], 23);
    assert.equal(packet.buf[prevPos++], 58);
    assert.equal(packet.buf[prevPos++], 59);
    packet.writeBinaryLocalDate(new Date('2020-12-31 23:58:59.123456'));
    assert.equal(packet.pos, prevPos + 12);
    assert.equal(packet.buf[prevPos++], 11);
    assert.equal(packet.buf[prevPos++], 228);
    assert.equal(packet.buf[prevPos++], 7);
    assert.equal(packet.buf[prevPos++], 12);
    assert.equal(packet.buf[prevPos++], 31);
    assert.equal(packet.buf[prevPos++], 23);
    assert.equal(packet.buf[prevPos++], 58);
    assert.equal(packet.buf[prevPos++], 59);
    assert.equal(packet.buf[prevPos++], 120);
    assert.equal(packet.buf[prevPos++], 224);
    assert.equal(packet.buf[prevPos++], 1);
    assert.equal(packet.buf[prevPos], 0);

    packet.pos = packet.buf.length - 2;
    prevPos = packet.pos;
    packet.writeBinaryLocalDate(new Date('2020-12-31 23:58:59.123456'));
    assert.equal(packet.pos, prevPos + 12);
    assert.equal(packet.buf[prevPos++], 11);
    assert.equal(packet.buf[prevPos++], 228);
    assert.equal(packet.buf[prevPos++], 7);
    assert.equal(packet.buf[prevPos++], 12);
    assert.equal(packet.buf[prevPos++], 31);
    assert.equal(packet.buf[prevPos++], 23);
    assert.equal(packet.buf[prevPos++], 58);
    assert.equal(packet.buf[prevPos++], 59);
    assert.equal(packet.buf[prevPos++], 120);
    assert.equal(packet.buf[prevPos++], 224);
    assert.equal(packet.buf[prevPos++], 1);
    assert.equal(packet.buf[prevPos], 0);
  });

  it('writeBinaryTimezoneDate', () => {
    const conOpts = Object.assign(
      new EventEmitter(),
      new ConnOptions(Object.assign({}, baseOpts, { timezone: '+07:00' }))
    );

    let out = new PacketOutputStream(conOpts, new ConnectionInformation());
    let stream = getStream();
    out.setStream(stream);
    let packet = new BulkPacket(conOpts, out, [true]);
    out.startPacket(this);
    let prevPos = packet.pos;

    // normal

    packet.writeBinaryTimezoneDate(new Date('2020-12-31 23:58:59 GMT+07:00'), conOpts);
    assert.equal(packet.pos, prevPos + 8);
    assert.equal(packet.buf[prevPos++], 7);
    assert.equal(packet.buf[prevPos++], 228);
    assert.equal(packet.buf[prevPos++], 7);
    assert.equal(packet.buf[prevPos++], 12);
    assert.equal(packet.buf[prevPos++], 31);
    assert.equal(packet.buf[prevPos++], 23);
    assert.equal(packet.buf[prevPos++], 58);
    assert.equal(packet.buf[prevPos++], 59);
    packet.writeBinaryTimezoneDate(new Date('2020-12-31 23:58:59.123456 GMT+07:00'), conOpts);
    assert.equal(packet.pos, prevPos + 12);
    assert.equal(packet.buf[prevPos++], 11);
    assert.equal(packet.buf[prevPos++], 228);
    assert.equal(packet.buf[prevPos++], 7);
    assert.equal(packet.buf[prevPos++], 12);
    assert.equal(packet.buf[prevPos++], 31);
    assert.equal(packet.buf[prevPos++], 23);
    assert.equal(packet.buf[prevPos++], 58);
    assert.equal(packet.buf[prevPos++], 59);
    assert.equal(packet.buf[prevPos++], 120);
    assert.equal(packet.buf[prevPos++], 224);
    assert.equal(packet.buf[prevPos++], 1);
    assert.equal(packet.buf[prevPos], 0);

    packet.pos = packet.buf.length - 2;
    prevPos = packet.pos;
    packet.writeBinaryTimezoneDate(new Date('2020-12-31 23:58:59.123456 GMT+07:00'), conOpts);
    assert.equal(packet.pos, prevPos + 12);
    assert.equal(packet.buf[prevPos++], 11);
    assert.equal(packet.buf[prevPos++], 228);
    assert.equal(packet.buf[prevPos++], 7);
    assert.equal(packet.buf[prevPos++], 12);
    assert.equal(packet.buf[prevPos++], 31);
    assert.equal(packet.buf[prevPos++], 23);
    assert.equal(packet.buf[prevPos++], 58);
    assert.equal(packet.buf[prevPos++], 59);
    assert.equal(packet.buf[prevPos++], 120);
    assert.equal(packet.buf[prevPos++], 224);
    assert.equal(packet.buf[prevPos++], 1);
    assert.equal(packet.buf[prevPos], 0);
  });
});
