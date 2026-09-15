//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import PacketNodeEncoded from './packet-node-encoded.js';
import PacketIconvEncoded from './packet-node-iconv.js';
import Collations from '../const/collations.js';
import { log } from '../misc/utils.js';
import * as Errors from '../misc/errors.js';

const HANDSHAKE_MAX_ALLOWED_PACKET = 1024 * 1024; //1Mb

/**
 * MySQL packet parser
 * see : https://mariadb.com/kb/en/library/0-packet/
 */
class PacketInputStream {
  constructor(unexpectedPacket, receiveQueue, out, opts, info) {
    this.unexpectedPacket = unexpectedPacket;
    this.opts = opts;
    this.receiveQueue = receiveQueue;
    this.info = info;
    this.out = out;

    //in case packet is not complete
    this.header = Buffer.allocUnsafe(4);
    this.headerLen = 0;
    this.packetLen = null;
    this.remainingLen = null;

    this.parts = null;
    this.partsTotalLen = 0;
    this._cmd = null;
    this.maxAllowedPacket = HANDSHAKE_MAX_ALLOWED_PACKET;
    this.changeEncoding(this.opts.collation ? this.opts.collation : Collations.fromIndex(224));
    this.changeDebug(this.opts.debug);
    this.opts.on('collation', this.changeEncoding.bind(this));
    this.opts.on('debug', this.changeDebug.bind(this));
  }

  changeEncoding(collation) {
    this.encoding = collation.charset;
    this.packet = Buffer.isEncoding(this.encoding)
      ? new PacketNodeEncoded(this.encoding)
      : new PacketIconvEncoded(this.encoding);
  }

  changeDebug(debug) {
    this._debug = debug;
    this.receivePacket = debug ? this.receivePacketDebug : this.receivePacketBasic;
  }

  receivePacketDebug(packet) {
    let cmd = this._cmd;
    if (!cmd || !cmd.onPacketReceive) {
      cmd = this.currentCmd();
    }
    this.header[0] = this.packetLen;
    this.header[1] = this.packetLen >> 8;
    this.header[2] = this.packetLen >> 16;
    this.header[3] = this.sequenceNo;
    if (packet) {
      this.opts.logger.network(
        `<== conn:${this.info.threadId ? this.info.threadId : -1} ${
          cmd
            ? cmd.onPacketReceive
              ? cmd.constructor.name + '.' + cmd.onPacketReceive.name
              : cmd.constructor.name
            : 'no command'
        } (${packet.pos},${packet.end})\n${log(this.opts, packet.buf, packet.pos, packet.end, this.header)}`
      );
    }

    if (!cmd || !cmd.onPacketReceive) {
      // A queued command without a packet handler has not sent a request yet.
      this.unexpectedPacket(packet);
      return;
    }

    cmd.sequenceNo = this.sequenceNo;
    cmd.onPacketReceive(packet, this.out, this.opts, this.info);
    if (!cmd.onPacketReceive) {
      this._cmd = null;
      this.receiveQueue.shift();
    }
  }

  receivePacketBasic(packet) {
    let cmd = this._cmd;
    if (!cmd || !cmd.onPacketReceive) {
      cmd = this.currentCmd();
      if (!cmd || !cmd.onPacketReceive) {
        // A queued command without a packet handler has not sent a request yet.
        this.unexpectedPacket(packet);
        return;
      }
    }
    cmd.sequenceNo = this.sequenceNo;
    cmd.onPacketReceive(packet, this.out, this.opts, this.info);
    if (!cmd.onPacketReceive) {
      this._cmd = null;
      this.receiveQueue.shift();
    }
  }

  resetHeader() {
    this.remainingLen = null;
    this.headerLen = 0;
  }

  currentCmd() {
    let cmd;
    while ((cmd = this.receiveQueue.peek())) {
      // Keep commands that are queued but have not started yet.
      if (cmd.onPacketReceive !== null) {
        this._cmd = cmd;
        return cmd;
      }
      this.receiveQueue.shift();
    }
    this._cmd = null;
    return null;
  }

  /**
   * A packet announcing more bytes than the connection permits, which a multi-part packet
   * (0xffffff fragments, more following) is the only way to reach past 16Mb. Refused before the
   * payload is buffered, so reassembly cannot grow past maxAllowedPacket whatever the server sends.
   * Until authentication completes that bound is {@link HANDSHAKE_MAX_ALLOWED_PACKET}, a malicious
   * or MitM server being the only thing that sends a large packet at that point (CONJS-358).
   *
   * @param size announced total packet size
   */
  rejectOversizedPacket(size) {
    this.parts = null;
    this.partsTotalLen = 0;
    const handshakePhase = this.maxAllowedPacket === HANDSHAKE_MAX_ALLOWED_PACKET;
    this.info.fatalError(
      Errors.createFatalError(
        `Packet size ${size} exceeds maxAllowedPacket (${this.maxAllowedPacket})` +
          `${handshakePhase ? ' permitted before authentication completed' : ''}, and is refused ` +
          'to prevent unbounded memory reassembly.',
        Errors.client.ER_UNEXPECTED_PACKET,
        this.info
      ),
      true
    );
  }

  onData(chunk) {
    let pos = 0;
    let length;
    const chunkLen = chunk.length;

    do {
      //read header
      if (this.remainingLen) {
        length = this.remainingLen;
      } else if (this.headerLen === 0 && chunkLen - pos >= 4) {
        this.packetLen = chunk[pos] + (chunk[pos + 1] << 8) + (chunk[pos + 2] << 16);
        this.sequenceNo = chunk[pos + 3];
        pos += 4;
        length = this.packetLen;
      } else {
        length = null;
        while (chunkLen - pos > 0) {
          this.header[this.headerLen++] = chunk[pos++];
          if (this.headerLen === 4) {
            this.packetLen = this.header[0] + (this.header[1] << 8) + (this.header[2] << 16);
            this.sequenceNo = this.header[3];
            length = this.packetLen;
            break;
          }
        }
      }

      const bufferedLen = this.parts === null ? 0 : this.partsTotalLen;
      if (length && bufferedLen + length > this.maxAllowedPacket) {
        return this.rejectOversizedPacket(bufferedLen + length);
      }

      if (length) {
        if (chunkLen - pos >= length) {
          pos += length;
          if (!this.parts) {
            if (this.packetLen < 0xffffff) {
              this.receivePacket(this.packet.update(chunk, pos - length, pos));
              // fast path, knowing there is no parts
              // loop can be simplified until reaching the end of the packet.
              // cache cmd + packet refs to avoid repeated lookups in tight row loop
              let cmd = this._cmd;
              const pkt = this.packet;
              while (pos + 4 < chunkLen) {
                this.packetLen = chunk[pos] + (chunk[pos + 1] << 8) + (chunk[pos + 2] << 16);
                this.sequenceNo = chunk[pos + 3];
                pos += 4;
                if (chunkLen - pos >= this.packetLen) {
                  pos += this.packetLen;
                  if (this.packetLen < 0xffffff) {
                    // row fast-path: if first byte < 0xfe, it's a data row — dispatch directly
                    // skip fast-path in debug mode so all packets get logged
                    if (!this._debug && cmd && cmd.onPacketReceive && chunk[pos - this.packetLen] < 0xfe) {
                      cmd.sequenceNo = this.sequenceNo;
                      cmd.onPacketReceive(pkt.update(chunk, pos - this.packetLen, pos), this.out, this.opts, this.info);
                    } else {
                      this.receivePacket(pkt.update(chunk, pos - this.packetLen, pos));
                      cmd = this._cmd;
                    }
                  } else {
                    this.parts = [chunk.subarray(pos - this.packetLen, pos)];
                    this.partsTotalLen = this.packetLen;
                    break;
                  }
                } else {
                  const buf = chunk.subarray(pos, chunkLen);
                  if (!this.parts) {
                    this.parts = [buf];
                    this.partsTotalLen = chunkLen - pos;
                  } else {
                    this.parts.push(buf);
                    this.partsTotalLen += chunkLen - pos;
                  }
                  this.remainingLen = this.packetLen - (chunkLen - pos);
                  return;
                }
              }
            } else {
              this.parts = [chunk.subarray(pos - length, pos)];
              this.partsTotalLen = length;
            }
          } else {
            this.parts.push(chunk.subarray(pos - length, pos));
            this.partsTotalLen += length;

            if (this.packetLen < 0xffffff) {
              let buf = Buffer.concat(this.parts, this.partsTotalLen);
              this.parts = null;
              this.receivePacket(this.packet.update(buf, 0, this.partsTotalLen));
            }
          }
          this.resetHeader();
        } else {
          const buf = chunk.subarray(pos, chunkLen);
          if (!this.parts) {
            this.parts = [buf];
            this.partsTotalLen = chunkLen - pos;
          } else {
            this.parts.push(buf);
            this.partsTotalLen += chunkLen - pos;
          }
          this.remainingLen = length - (chunkLen - pos);
          return;
        }
      } else if (length === 0 && this.parts) {
        // ending empty packet
        this.parts.push(chunk.subarray(pos - length, pos));
        let buf = Buffer.concat(this.parts, this.partsTotalLen);
        this.receivePacket(this.packet.update(buf, 0, this.partsTotalLen));
        this.parts = null;
        this.resetHeader();
      }
    } while (pos < chunkLen);
  }
}

export default PacketInputStream;
