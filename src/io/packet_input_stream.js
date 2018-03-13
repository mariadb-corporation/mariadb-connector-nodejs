"use strict";

const Packet = require("./Packet");

/**
 * MySQL packet parser
 * see : https://mariadb.com/kb/en/library/0-packet/
 */
class PacketInputStream {
  constructor(dispatchPacket) {
    this.dispatchPacket = dispatchPacket;

    //in case packet is not complete
    this.header = Buffer.allocUnsafe(4);
    this.headerLen = 0;
    this.packetLen = -1;
    this.remainingLen = null;

    this.parts = null;
    this.partsTotalLen = 0;
    this.largeParts = null;
    this.largePartsTotalLen = 0;
  }

  receivePacket(packet) {
    this.dispatchPacket(packet, this.header);
  }

  resetHeader() {
    this.remainingLen = null;
    this.headerLen = 0;
    this.packetLen = -1;
  }

  /**
   * Read 4 bytes header.
   *
   * @param chunk
   * @returns packet length if header is completly received
   * @private
   */
  readHeader(chunk) {
    if (this.remainingLen) return this.remainingLen;
    while (chunk.length - this.pos > 0) {
      this.header[this.headerLen++] = chunk[this.pos++];
      if (this.headerLen === 4) {
        this.packetLen = this.header[0] + (this.header[1] << 8) + (this.header[2] << 16);
        return this.packetLen;
      }
    }
    return null;
  }

  onData(chunk) {
    this.pos = 0;
    while (this.pos < chunk.length) {
      let length;
      if ((length = this.readHeader(chunk))) {
        if (chunk.length - this.pos >= length) {
          if (this.parts) {
            this.parts.push(chunk.slice(this.pos, this.pos + length));
            this.partsTotalLen += length;
            let buf = Buffer.concat(this.parts, this.partsTotalLen);
            let packet = new Packet(buf, 0, this.partsTotalLen);

            if (this.packetLen < 0xffffff) {
              if (this.largeParts) {
                this.largeParts.push(buf);
                this.largePartsTotalLen += this.partsTotalLen;
                buf = Buffer.concat(this.largeParts, this.largePartsTotalLen);
                packet = new Packet(buf, 0, this.largePartsTotalLen);
                this.largeParts = null;
              }
              this.receivePacket(packet);
            } else {
              if (!this.largeParts) {
                this.largeParts = [];
                this.largePartsTotalLen = 0;
              }
              this.largeParts.push(buf);
              this.largePartsTotalLen += this.packetLen;
            }
            this.parts = null;
          } else {
            if (this.packetLen < 0xffffff) {
              let packet;
              if (this.largeParts) {
                this.largeParts.push(chunk.slice(this.pos, this.pos + length));
                this.largePartsTotalLen += length;
                let buf = Buffer.concat(this.largeParts, this.largePartsTotalLen);
                packet = new Packet(buf, 0, this.largePartsTotalLen);
                this.largeParts = null;
              } else {
                packet = new Packet(chunk, this.pos, this.pos + length);
              }
              this.receivePacket(packet);
            } else {
              if (!this.largeParts) {
                this.largeParts = [];
                this.largePartsTotalLen = 0;
              }
              this.largeParts.push(chunk.slice(this.pos, this.pos + length));
              this.largePartsTotalLen += length;
            }
          }
          this.resetHeader();
          this.pos += length;
        } else {
          if (!this.parts) {
            this.parts = [];
            this.partsTotalLen = 0;
          }
          let read = chunk.length - this.pos;
          this.parts.push(chunk.slice(this.pos, chunk.length));
          this.partsTotalLen += read;
          this.remainingLen = length - read;
          this.pos += read;
        }
      }
    }
  }
}

module.exports = PacketInputStream;
