"use strict";

const Iconv = require("iconv-lite");
const Utils = require("../misc/utils");

const QUOTE = 0x27;
const DBL_QUOTE = 0x22;
const ZERO_BYTE = 0x00;
const SLASH = 0x5c;

//increase by level to avoid buffer copy.
const SMALL_BUFFER_SIZE = 2042;
const MEDIUM_BUFFER_SIZE = 131072; //128k
const LARGE_BUFFER_SIZE = 1048576; //1M
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
    this.writeDate = opts.timezone === "local" ? this.writeLocalDate : this.writeTimezoneDate;
    this.encoding = this.opts.collation.encoding;
    if (this.encoding === "utf8") {
      this.writeString = this.writeDefaultBufferString;
      this.writeStringEscape = this.writeUtf8StringEscape;
    } else if (Buffer.isEncoding(this.encoding)) {
      this.writeString = this.writeDefaultBufferString;
      this.writeStringEscape = this.writeDefaultStringEscape;
    } else {
      this.writeString = this.writeDefaultIconvString;
      this.writeStringEscape = this.writeDefaultStringEscape;
    }
  }

  setStreamer(stream) {
    this.stream = stream;
  }

  growBuffer(len) {
    let newCapacity;
    if (len + this.pos < MEDIUM_BUFFER_SIZE) {
      newCapacity = MEDIUM_BUFFER_SIZE;
    } else if (len + this.pos < LARGE_BUFFER_SIZE) {
      newCapacity = LARGE_BUFFER_SIZE;
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
        this.flushBuffer(false);
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
    this.buf.writeUInt16LE(value, this.pos);
    this.pos += 2;
  }

  writeInt24(value) {
    if (this.pos + 3 >= this.buf.length) {
      let b = Buffer.allocUnsafe(3);

      b[0] = value;
      b[1] = value >>> 8;
      b[2] = value >>> 16;
      this.writeBuffer(b, 0, 2);
      return;
    }

    b[this.pos] = value;
    b[this.pos + 1] = value >>> 8;
    b[this.pos + 2] = value >>> 16;
    this.pos += 3;
  }

  writeInt32(value) {
    if (this.pos + 4 >= this.buf.length) {
      //not enough space remaining
      let arr = Buffer.allocUnsafe(4);
      arr.writeInt32LE(value, 0);
      this.writeBuffer(arr, 0, 4);
      return;
    }

    this.buf.writeInt32LE(value, this.pos);
    this.pos += 4;
  }

  writeLengthCoded(len) {
    if (len < 0xfb) {
      this.writeInt8(len);
      return;
    }

    if (len < 0xffff) {
      this.writeInt8(0xfc);
      this.writeInt16(len);
      return;
    }

    if (len < 0xffffff) {
      this.writeInt8(0xfd);
      this.writeInt24(len);
      return;
    }

    if (len === null) {
      this.writeInt8(0xfb);
      return;
    }

    this.writeInt8(0xfe);
    this.buf.writeUInt32LE(len, this.pos);
    this.buf.writeUInt32LE(len >> 32, this.pos + 4);
    this.pos += 8;
  }

  writeLocalDate(date, opts) {
    const year = date.getFullYear();
    const mon = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const min = date.getMinutes();
    const sec = date.getSeconds();
    const ms = date.getMilliseconds();
    this._writeDatePart(year, mon, day, hour, min, sec, ms);
  }

  _writeDatePart(year, mon, day, hour, min, sec, ms) {
    //return 'YYYY-MM-DD HH:MM:SS' datetime format
    //see https://mariadb.com/kb/en/library/datetime/
    this.writeStringAscii(
      (year > 999 ? year : year > 99 ? "0" + year : year > 9 ? "00" + year : "000" + year) +
        "-" +
        (mon < 10 ? "0" : "") +
        mon +
        "-" +
        (day < 10 ? "0" : "") +
        day +
        " " +
        (hour < 10 ? "0" : "") +
        hour +
        ":" +
        (min < 10 ? "0" : "") +
        min +
        ":" +
        (sec < 10 ? "0" : "") +
        sec +
        "." +
        (ms > 99 ? ms : ms > 9 ? "0" + ms : "00" + ms)
    );
  }

  writeTimezoneDate(date, opts) {
    if (opts.timezoneMillisOffset) date.setTime(date.getTime() + opts.timezoneMillisOffset);

    const year = date.getUTCFullYear();
    const mon = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const hour = date.getUTCHours();
    const min = date.getUTCMinutes();
    const sec = date.getUTCSeconds();
    const ms = date.getUTCMilliseconds();
    this._writeDatePart(year, mon, day, hour, min, sec, ms);
  }

  writeLengthCodedBuffer(arr) {
    this.writeLengthCoded(arr.length);
    this.writeBuffer(arr, 0, arr.length);
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
          this.flushBuffer(false);
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

  writeUtf8StringEscape(str) {
    const charsLength = str.length;

    //not enough space remaining
    if (charsLength * 3 >= this.buf.length - this.pos) {
      const arr = Buffer.from(str, "utf8");
      this.writeBufferEscape(arr);
      return;
    }

    //create UTF-8 byte array
    //since java char are internally using UTF-16 using surrogate's pattern, 4 bytes unicode characters will
    //represent 2 characters : example "\uD83C\uDFA4" = 🎤 unicode 8 "no microphones"
    //so max size is 3 * charLength
    //(escape characters are 1 byte encoded, so length might only be 2 when escape)
    // + 2 for the quotes for text protocol
    let charsOffset = 0;
    let currChar;

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
            this.buf[this.pos++] = 0x63;
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
              this.buf[this.pos++] = 0x63;
            }
          }
        } else {
          //low surrogate without high surrogate before
          this.buf[this.pos++] = 0x63;
        }
      } else {
        this.buf[this.pos++] = 0xe0 | (currChar >> 12);
        this.buf[this.pos++] = 0x80 | ((currChar >> 6) & 0x3f);
        this.buf[this.pos++] = 0x80 | (currChar & 0x3f);
      }
    }
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
  writeDefaultStringEscape(str) {
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
      return;
    }

    if (lastIndex < str.length) {
      this.writeString(str.slice(lastIndex));
    }
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
              if (this.pos >= this.buf.length) this.flushBuffer(false);
              this.buf[this.pos++] = SLASH; //add escape slash
          }
          if (this.pos >= this.buf.length) this.flushBuffer(false);
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
  flushBuffer(commandEnd) {
    this.buf[0] = this.pos - 4;
    this.buf[1] = (this.pos - 4) >>> 8;
    this.buf[2] = (this.pos - 4) >>> 16;
    this.buf[3] = this.cmd.sequenceNo;
    this.cmd.incrementSequenceNo(1);

    this.stream.writeBuf(this.buf.slice(0, this.pos), this.cmd);

    if (this.opts.debug && !this.opts.debugCompress) {
      console.log(
        "==> conn:%d %s\n%s",
        this.info.threadId ? this.info.threadId : -1,
        (this.cmd.onPacketReceive
          ? this.cmd.constructor.name + "." + this.cmd.onPacketReceive.name
          : this.cmd.constructor.name) +
          "(0," +
          this.pos +
          ")",
        Utils.log(this.opts, this.buf, 0, this.pos)
      );
    }

    if (commandEnd) {
      //if last com fill the max size, must send an empty com to indicate command end.
      if (this.pos === MAX_BUFFER_SIZE) {
        this.writeEmptyPacket();
      } else {
        this.stream.flush(true, this.cmd);
      }

      //reset buffer, taking buffer from buffer pool
      this.buf = Buffer.allocUnsafe(SMALL_BUFFER_SIZE);
    }

    this.pos = 4;
  }

  writeEmptyPacket() {
    const emptyBuf = new Buffer([0x00, 0x00, 0x00, this.cmd.sequenceNo]);
    this.cmd.incrementSequenceNo(1);

    if (this.opts.debug && !this.opts.debugCompress) {
      console.log(
        "==> conn:%d %s\n%s",
        this.info.threadId ? this.info.threadId : -1,
        (this.cmd.onPacketReceive
          ? this.cmd.constructor.name + "." + this.cmd.onPacketReceive.name
          : this.cmd.constructor.name) + "(0,4)",
        Utils.log(emptyBuf, 0, 4)
      );
    }

    this.stream.writeBuf(emptyBuf, this.cmd);
    this.stream.flush(true, this.cmd);
  }
}

module.exports = PacketOutputStream;
