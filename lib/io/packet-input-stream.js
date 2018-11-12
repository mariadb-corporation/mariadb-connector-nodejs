"use strict";

const Packet = require("./packet");
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

  receivePacket(packet) {
    let cmd = this.currentCmd();

    if (packet && (this.opts.logPackets || this.opts.debug)) {
      const packetStr = Utils.log(this.opts, packet.buf, packet.pos, packet.end, this.header);
      if (this.opts.logPackets) {
        this.info.addPacket(
          "<== conn:" +
            (this.info.threadId ? this.info.threadId : -1) +
            " " +
            (cmd
              ? cmd.onPacketReceive
                ? cmd.constructor.name + "." + cmd.onPacketReceive.name
                : cmd.constructor.name
              : "no command") +
            " (" +
            packet.pos +
            "," +
            packet.end +
            "))\n" +
            packetStr
        );
      }
      if (this.opts.debug) {
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
          packetStr
        );
      }
    }

    if (!cmd) {
      this.unexpectedPacket(packet);
      return;
    }

    cmd.sequenceNo = this.header[3];
    cmd.onPacketReceive(packet, this.out, this.opts, this.info);
    if (!cmd.onPacketReceive) this.receiveQueue.shift();
  }

  resetHeader() {
    this.remainingLen = null;
    this.headerLen = 0;
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
    let pos = 0;
    let length;
    const chunkLen = chunk.length;

    do {
      //read header
      if (this.remainingLen) {
        length = this.remainingLen;
      } else {
        length = null;
        while (chunkLen - pos > 0) {
          this.header[this.headerLen++] = chunk[pos++];
          if (this.headerLen === 4) {
            this.packetLen = this.header[0] + (this.header[1] << 8) + (this.header[2] << 16);
            length = this.packetLen;
            break;
          }
        }
      }

      if (length) {
        if (chunkLen - pos >= length) {
          const buf = chunk.slice(pos, pos + length);
          pos += length;
          if (this.parts) {
            this.parts.push(buf);
            this.partsTotalLen += length;

            if (this.packetLen < 0xffffff) {
              let buf = Buffer.concat(this.parts, this.partsTotalLen);
              this.parts = null;
              const packet = new Packet(buf, 0, this.partsTotalLen);
              this.receivePacket(packet);
            }
          } else {
            if (this.packetLen < 0xffffff) {
              const packet = new Packet(buf, 0, length);
              this.receivePacket(packet);
            } else {
              this.parts = [buf];
              this.partsTotalLen = length;
            }
          }
          this.resetHeader();
        } else {
          const buf = chunk.slice(pos, chunkLen);
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
      }
    } while (pos < chunkLen);
  }
}

module.exports = PacketInputStream;
