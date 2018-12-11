"use strict";

const Iconv = require("iconv-lite");
const Utils = require("../misc/utils");

const QUOTE = 0x27;
const DBL_QUOTE = 0x22;
const ZERO_BYTE = 0x00;
const SLASH = 0x5c;

//increase by level to avoid buffer copy.
const SMALL_BUFFER_SIZE = 1024;
const MEDIUM_BUFFER_SIZE = 16384; //16k
const LARGE_BUFFER_SIZE = 131072; //128k
const BIG_BUFFER_SIZE = 1048576; //1M
const MAX_BUFFER_SIZE = 16777219; //16M + 4
const CHARS_GLOBAL_REGEXP = /[\0\"\'\\]/g; // eslint-disable-line no-control-regex

/**
 * MySQL packet builder.
 *
 * @param opts    options
 * @param info    connection info
 * @constructor
 */
class PacketOutputStream {
  constructor(opts, info) {
    this.opts = opts;
    this.info = info;
    this.pos = 4;
    this.buf = Buffer.allocUnsafe(SMALL_BUFFER_SIZE);
    this.changeEncoding(this.opts.collation);
  }

  changeEncoding(collation) {
    this.encoding = collation.encoding;
    if (this.encoding === "utf8") {
      this.writeString = this.writeDefaultBufferString;
      this.writeStringEscapeQuote = this.writeUtf8StringEscapeQuote;
    } else if (Buffer.isEncoding(this.encoding)) {
      this.writeString = this.writeDefaultBufferString;
      this.writeStringEscapeQuote = this.writeDefaultStringEscapeQuote;
    } else {
      this.writeString = this.writeDefaultIconvString;
      this.writeStringEscapeQuote = this.writeDefaultStringEscapeQuote;
    }
  }

  setStream(stream) {
    this.stream = stream;
  }

  growBuffer(len) {
    let newCapacity;
    if (len + this.pos < MEDIUM_BUFFER_SIZE) {
      newCapacity = MEDIUM_BUFFER_SIZE;
    } else if (len + this.pos < LARGE_BUFFER_SIZE) {
      newCapacity = LARGE_BUFFER_SIZE;
    } else if (len + this.pos < BIG_BUFFER_SIZE) {
      newCapacity = BIG_BUFFER_SIZE;
    } else newCapacity = MAX_BUFFER_SIZE;

    let newBuf = Buffer.allocUnsafe(newCapacity);
    this.buf.copy(newBuf, 0, 0, this.pos);
    this.buf = newBuf;
  }

  startPacket(cmd) {
    this.cmd = cmd;
    this.pos = 4;
  }

  writeInt8(value) {
    if (this.pos + 1 >= this.buf.length) {
      if (this.pos >= MAX_BUFFER_SIZE) {
        //buffer is more than a Packet, must flushBuffer()
        this.flushBuffer(false, 1);
      } else this.growBuffer(1);
    }
    this.buf[this.pos++] = value;
  }

  writeInt16(value) {
    if (this.pos + 2 >= this.buf.length) {
      let b = Buffer.allocUnsafe(2);
      b.writeUInt16LE(value, 0);
      this.writeBuffer(b, 0, 2);
      return;
    }
    this.buf[this.pos] = value;
    this.buf[this.pos + 1] = value >> 8;
    this.pos += 2;
  }

  writeInt16AtPos(initPos) {
    this.buf[initPos] = this.pos - initPos - 2;
    this.buf[initPos + 1] = (this.pos - initPos - 2) >> 8;
  }

  writeInt32(value) {
    if (this.pos + 4 >= this.buf.length) {
      //not enough space remaining
      let arr = Buffer.allocUnsafe(4);
      arr.writeInt32LE(value, 0);
      this.writeBuffer(arr, 0, 4);
      return;
    }

    this.buf[this.pos] = value;
    this.buf[this.pos + 1] = value >> 8;
    this.buf[this.pos + 2] = value >> 16;
    this.buf[this.pos + 3] = value >> 24;
    this.pos += 4;
  }

  writeLengthCoded(len) {
    //length encoded can be null(0xfb) or bigger than 65k, but only if using binary protocol
    //so not implemented for now
    if (len < 0xfb) {
      this.writeInt8(len);
      return;
    }

    //max length is len < 0xffff
    this.writeInt8(0xfc);
    this.writeInt16(len);
  }

  writeBuffer(arr, off, len) {
    if (len > this.buf.length - this.pos) {
      if (this.buf.length !== MAX_BUFFER_SIZE) {
        this.growBuffer(len);
      }

      //max buffer size
      if (len > this.buf.length - this.pos) {
        //not enough space in buffer, will stream :
        // fill buffer and flush until all data are snd
        let remainingLen = len;

        while (true) {
          //filling buffer
          let lenToFillBuffer = Math.min(MAX_BUFFER_SIZE - this.pos, remainingLen);
          arr.copy(this.buf, this.pos, off, off + lenToFillBuffer);
          remainingLen -= lenToFillBuffer;
          off += lenToFillBuffer;
          this.pos += lenToFillBuffer;

          if (remainingLen === 0) return;
          this.flushBuffer(false, remainingLen);
        }
      }
    }
    arr.copy(this.buf, this.pos, off, off + len);
    this.pos += len;
  }

  /**
   * Write ascii string to socket (no escaping)
   *
   * @param str                string
   */
  writeStringAscii(str) {
    let len = str.length;

    //not enough space remaining
    if (len >= this.buf.length - this.pos) {
      let strBuf = Buffer.from(str, "ascii");
      this.writeBuffer(strBuf, 0, strBuf.length);
      return;
    }

    for (let off = 0; off < len; ) {
      this.buf[this.pos++] = str.charCodeAt(off++);
    }
  }

  writeUtf8StringEscapeQuote(str) {
    const charsLength = str.length;

    //not enough space remaining
    if (charsLength * 3 + 2 >= this.buf.length - this.pos) {
      const arr = Buffer.from(str, "utf8");
      this.writeInt8(QUOTE);
      this.writeBufferEscape(arr);
      this.writeInt8(QUOTE);
      return;
    }

    //create UTF-8 byte array
    //since javascript char are internally using UTF-16 using surrogate's pattern, 4 bytes unicode characters will
    //represent 2 characters : example "\uD83C\uDFA4" = 🎤 unicode 8 "no microphones"
    //so max size is 3 * charLength
    //(escape characters are 1 byte encoded, so length might only be 2 when escaped)
    // + 2 for the quotes for text protocol
    let charsOffset = 0;
    let currChar;
    this.buf[this.pos++] = QUOTE;
    //quick loop if only ASCII chars for faster escape
    for (
      ;
      charsOffset < charsLength && (currChar = str.charCodeAt(charsOffset)) < 0x80;
      charsOffset++
    ) {
      if (
        currChar === SLASH ||
        currChar === QUOTE ||
        currChar === ZERO_BYTE ||
        currChar === DBL_QUOTE
      ) {
        this.buf[this.pos++] = SLASH;
      }
      this.buf[this.pos++] = currChar;
    }

    //if quick loop not finished
    while (charsOffset < charsLength) {
      currChar = str.charCodeAt(charsOffset++);
      if (currChar < 0x80) {
        if (
          currChar === SLASH ||
          currChar === QUOTE ||
          currChar === ZERO_BYTE ||
          currChar === DBL_QUOTE
        ) {
          this.buf[this.pos++] = SLASH;
        }
        this.buf[this.pos++] = currChar;
      } else if (currChar < 0x800) {
        this.buf[this.pos++] = 0xc0 | (currChar >> 6);
        this.buf[this.pos++] = 0x80 | (currChar & 0x3f);
      } else if (currChar >= 0xd800 && currChar < 0xe000) {
        //reserved for surrogate - see https://en.wikipedia.org/wiki/UTF-16
        if (currChar < 0xdc00) {
          //is high surrogate
          if (charsOffset + 1 > charsLength) {
            this.buf[this.pos++] = 0x3f;
          } else {
            const nextChar = str.charCodeAt(charsOffset);
            if (nextChar >= 0xdc00 && nextChar < 0xe000) {
              //is low surrogate
              const surrogatePairs =
                (currChar << 10) + nextChar + (0x010000 - (0xd800 << 10) - 0xdc00);
              this.buf[this.pos++] = 0xf0 | (surrogatePairs >> 18);
              this.buf[this.pos++] = 0x80 | ((surrogatePairs >> 12) & 0x3f);
              this.buf[this.pos++] = 0x80 | ((surrogatePairs >> 6) & 0x3f);
              this.buf[this.pos++] = 0x80 | (surrogatePairs & 0x3f);
              charsOffset++;
            } else {
              //must have low surrogate
              this.buf[this.pos++] = 0x3f;
            }
          }
        } else {
          //low surrogate without high surrogate before
          this.buf[this.pos++] = 0x3f;
        }
      } else {
        this.buf[this.pos++] = 0xe0 | (currChar >> 12);
        this.buf[this.pos++] = 0x80 | ((currChar >> 6) & 0x3f);
        this.buf[this.pos++] = 0x80 | (currChar & 0x3f);
      }
    }
    this.buf[this.pos++] = QUOTE;
  }

  writeDefaultBufferString(str) {
    //javascript use UCS-2 or UTF-16 string internal representation
    //that means that string to byte will be a maximum of * 3
    // (4 bytes utf-8 are represented on 2 UTF-16 characters)
    if (str.length * 3 < this.buf.length - this.pos) {
      this.pos += this.buf.write(str, this.pos, this.encoding);
      return;
    }

    //checking real length
    let byteLength = Buffer.byteLength(str, this.encoding);
    if (byteLength > this.buf.length - this.pos) {
      if (this.buf.length < MAX_BUFFER_SIZE) {
        this.growBuffer(byteLength);
      }
      if (byteLength > this.buf.length - this.pos) {
        //not enough space in buffer, will stream :
        let strBuf = Buffer.from(str, this.encoding);
        this.writeBuffer(strBuf, 0, strBuf.length);
        return;
      }
    }
    this.pos += this.buf.write(str, this.pos, this.encoding);
  }

  writeDefaultIconvString(str) {
    let buf = Iconv.encode(str, this.encoding);
    this.writeBuffer(buf, 0, buf.length);
  }

  /**
   * Parameters need to be properly escaped :
   * following characters are to be escaped by "\" :
   * - \0
   * - \\
   * - \'
   * - \"
   * regex split part of string writing part, and escaping special char.
   * Those chars are <= 7f meaning that this will work even with multi-byte encoding
   *
   * @param str string to escape.
   */
  writeDefaultStringEscapeQuote(str) {
    this.writeInt8(QUOTE);
    let match;
    let lastIndex = 0;
    while ((match = CHARS_GLOBAL_REGEXP.exec(str)) !== null) {
      this.writeString(str.slice(lastIndex, match.index));
      this.writeInt8(SLASH);
      this.writeInt8(match[0].charCodeAt(0));
      lastIndex = CHARS_GLOBAL_REGEXP.lastIndex;
    }

    if (lastIndex === 0) {
      // Nothing was escaped
      this.writeString(str);
      this.writeInt8(QUOTE);
      return;
    }

    if (lastIndex < str.length) {
      this.writeString(str.slice(lastIndex));
    }
    this.writeInt8(QUOTE);
  }

  writeBufferEscape(val) {
    let valLen = val.length;
    if (valLen * 2 > this.buf.length - this.pos) {
      //makes buffer bigger (up to 16M)
      if (this.buf.length !== MAX_BUFFER_SIZE) this.growBuffer(valLen * 2);

      //data may still be bigger than buffer.
      //must flush buffer when full (and reset position to 4)
      if (valLen * 2 > this.buf.length - this.pos) {
        //not enough space in buffer, will fill buffer
        for (let i = 0; i < valLen; i++) {
          switch (val[i]) {
            case QUOTE:
            case SLASH:
            case DBL_QUOTE:
            case ZERO_BYTE:
              if (this.pos >= this.buf.length) this.flushBuffer(false, (valLen - i) * 2);
              this.buf[this.pos++] = SLASH; //add escape slash
          }
          if (this.pos >= this.buf.length) this.flushBuffer(false, (valLen - i) * 2);
          this.buf[this.pos++] = val[i];
        }
        return;
      }
    }

    //sure to have enough place to use buffer directly
    for (let i = 0; i < valLen; i++) {
      switch (val[i]) {
        case QUOTE:
        case SLASH:
        case DBL_QUOTE:
        case ZERO_BYTE:
          this.buf[this.pos++] = SLASH; //add escape slash
      }
      this.buf[this.pos++] = val[i];
    }
  }

  /**
   * Indicate if buffer contain any data.
   * @returns {boolean}
   */
  isEmpty() {
    return this.pos <= 4;
  }

  /**
   * Flush the internal buffer.
   */
  flushBuffer(commandEnd, remainingLen) {
    this.buf[0] = this.pos - 4;
    this.buf[1] = (this.pos - 4) >>> 8;
    this.buf[2] = (this.pos - 4) >>> 16;
    this.buf[3] = ++this.cmd.sequenceNo;

    this.stream.writeBuf(this.buf.slice(0, this.pos), this.cmd);

    if (this.opts.logPackets || this.opts.debug) {
      const packet = Utils.log(this.opts, this.buf, 0, this.pos);
      if (this.opts.logPackets) {
        this.info.addPacket(
          "==> conn:" +
            (this.info.threadId ? this.info.threadId : -1) +
            " " +
            this.cmd.constructor.name +
            "(0," +
            this.pos +
            ")\n" +
            packet
        );
      }

      if (this.opts.debug) {
        console.log(
          "==> conn:%d %s\n%s",
          this.info.threadId ? this.info.threadId : -1,
          this.cmd.constructor.name + "(0," + this.pos + ")",
          Utils.log(this.opts, this.buf, 0, this.pos)
        );
      }
    }

    if (commandEnd) {
      //if last packet fill the max size, must send an empty com to indicate that command end.
      if (this.pos === MAX_BUFFER_SIZE) {
        this.writeEmptyPacket();
      } else {
        this.stream.flush(true, this.cmd);
        this.buf = Buffer.allocUnsafe(SMALL_BUFFER_SIZE);
      }
    } else {
      this.buf = allocateBuffer(remainingLen + 4);
      this.pos = 4;
    }
  }

  writeEmptyPacket() {
    const emptyBuf = Buffer.from([0x00, 0x00, 0x00, ++this.cmd.sequenceNo]);

    if (this.opts.logPackets || this.opts.debug) {
      const packet = Utils.log(this.opts, emptyBuf, 0, 4);
      if (this.opts.logPackets) {
        this.info.addPacket(
          "==> conn:" +
            (this.info.threadId ? this.info.threadId : -1) +
            " " +
            this.cmd.constructor.name +
            "(0,4)\n" +
            packet
        );
      }
      if (this.opts.debug) {
        console.log(
          "==> conn:%d %s\n%s",
          this.info.threadId ? this.info.threadId : -1,
          this.cmd.constructor.name + "(0,4)",
          packet
        );
      }
    }

    this.stream.writeBuf(emptyBuf, this.cmd);
    this.stream.flush(true, this.cmd);
  }
}

function allocateBuffer(len) {
  if (len < SMALL_BUFFER_SIZE) {
    return Buffer.allocUnsafe(SMALL_BUFFER_SIZE);
  } else if (len < MEDIUM_BUFFER_SIZE) {
    return Buffer.allocUnsafe(MEDIUM_BUFFER_SIZE);
  } else if (len < LARGE_BUFFER_SIZE) {
    return Buffer.allocUnsafe(LARGE_BUFFER_SIZE);
  } else if (len < BIG_BUFFER_SIZE) {
    return Buffer.allocUnsafe(BIG_BUFFER_SIZE);
  }
  return Buffer.allocUnsafe(MAX_BUFFER_SIZE);
}

module.exports = PacketOutputStream;
