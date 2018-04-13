"use strict";

const Packet = require("./Packet");
const Utils = require("../misc/utils");

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
  }

  logFullPacket(buf) {
    let cmd = this.currentCmd();
    if (this.opts.debug && !this.opts.debugCompress) {
      console.log(
        "<== conn:%d %s (%d,%d)\n%s",
        this.info.threadId ? this.info.threadId : -1,
        cmd
          ? cmd.onPacketReceive
            ? cmd.constructor.name + "." + cmd.onPacketReceive.name
            : cmd.constructor.name
          : "no command",
        0,
        buf.length,
        Utils.log(buf, 0, buf.length, this.header)
      );
    }
    if (cmd) cmd.checkSequenceNo(this.header[3]);
  }

  receivePacket(packet) {
    let cmd = this.currentCmd();
    if (this.opts.debug && !this.opts.debugCompress && packet) {
      console.log(
        "<== conn:%d %s (%d,%d)\n%s",
        this.info.threadId ? this.info.threadId : -1,
        cmd
          ? cmd.onPacketReceive
            ? cmd.constructor.name + "." + cmd.onPacketReceive.name
            : cmd.constructor.name
          : "no command",
        packet.pos,
        packet.end,
        Utils.log(packet.buf, packet.pos, packet.end, this.header)
      );
    }

    if (!cmd) {
      this.unexpectedPacket(packet);
      return;
    }

    cmd.checkSequenceNo(this.header[3]);
    if (!cmd.handle(packet, this.out, this.opts, this.info)) {
      this.receiveQueue.shift();
    }
  }

  resetHeader() {
    this.remainingLen = null;
    this.headerLen = 0;
  }

  /**
   * Read 4 bytes header.
   *
   * @param chunk     chunk
   * @param chunkLen  chunk length
   * @returns packet length if header is completely received
   * @private
   */
  readHeader(chunk, chunkLen) {
    if (this.remainingLen) return this.remainingLen;
    while (chunkLen - this.pos > 0) {
      this.header[this.headerLen++] = chunk[this.pos++];
      if (this.headerLen === 4) {
        this.packetLen = this.header[0] | (this.header[1] << 8) | (this.header[2] << 16);
        return this.packetLen;
      }
    }
    return null;
  }

  currentCmd() {
    let cmd;
    while ((cmd = this.receiveQueue.peek())) {
      if (cmd.onPacketReceive) return cmd;
      this.receiveQueue.shift();
    }
    return null;
  }

  onData(chunk) {
    this.pos = 0;
    let length;
    const chunkLen = chunk.length;

    do {
      if ((length = this.readHeader(chunk, chunkLen))) {
        if (chunkLen - this.pos >= length) {
          if (this.parts) {
            const buf = chunk.slice(this.pos, this.pos + length);
            this.parts.push(buf);
            this.partsTotalLen += length;

            if (this.packetLen < 0xffffff) {
              let buf = Buffer.concat(this.parts, this.partsTotalLen);
              this.parts = null;
              const packet = new Packet(buf, 0, this.partsTotalLen);
              this.receivePacket(packet);
            } else {
              this.logFullPacket(buf);
            }
          } else {
            if (this.packetLen < 0xffffff) {
              const packet = new Packet(chunk, this.pos, this.pos + length);
              this.receivePacket(packet);
            } else {
              const buf = chunk.slice(this.pos, this.pos + length);
              this.parts = [buf];
              this.partsTotalLen = length;
              this.logFullPacket(buf);
            }
          }
          this.resetHeader();
          this.pos += length;
        } else {
          const buf = chunk.slice(this.pos, chunkLen);
          if (!this.parts) {
            this.parts = [buf];
            this.partsTotalLen = chunkLen - this.pos;
          } else {
            this.parts.push(buf);
            this.partsTotalLen += chunkLen - this.pos;
          }
          this.remainingLen = length - (chunkLen - this.pos);
          return;
        }
      }
    } while (this.pos < chunkLen);
  }
}

module.exports = PacketInputStream;
