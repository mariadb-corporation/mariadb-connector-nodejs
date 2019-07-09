'use strict';

const Iconv = require('iconv-lite');
const SMALL_BUFFER_SIZE = 1024;
const MEDIUM_BUFFER_SIZE = 16384; //16k
const LARGE_BUFFER_SIZE = 131072; //128k
const BIG_BUFFER_SIZE = 1048576; //1M
const MAX_BUFFER_SIZE = 16777219; //16M + 4

/**
 * Packet splitter.
 *
 * The servers have a limit max_allowed_packet which limits the size of the data sent, to avoid saturating the server in memory.
 *
 * The following implementation has a workaround that will rewrite the command and separate the send according to this value.
 * This implies that this command can send multiple commands, with some tricks for sequencing packets.
 *
 */
class BulkPacket {
  constructor(opts, out, row) {
    this.out = out;
    this.buf = Buffer.allocUnsafe(SMALL_BUFFER_SIZE);
    this.pos = 4;
    this.datatypes = [];
    this.encoding = out.encoding;
    this.waitingResponseNo = 1;
    this.singleQuery = false;
    this.haveErrorResponse = false;
    this.writeBinaryDate = opts.tz ? this.writeBinaryTimezoneDate : this.writeBinaryLocalDate;
    if (this.encoding === 'utf8') {
      this.writeLengthEncodedString = this.writeDefaultLengthEncodedString;
    } else if (Buffer.isEncoding(this.encoding)) {
      this.writeLengthEncodedString = this.writeDefaultLengthEncodedString;
    } else {
      this.writeLengthEncodedString = this.writeIconvLengthEncodedString;
    }
    this.maxAllowedPacket = opts.maxAllowedPacket;
    this.maxPacketSize = opts.maxAllowedPacket
      ? Math.min(MAX_BUFFER_SIZE, opts.maxAllowedPacket)
      : 4194304;
    this.writeHeader(row);
  }

  datatypeChanged(row) {
    if (this.datatypes.length !== row.length) return true;
    for (let r = 0; r < row.length; r++) {
      if (row[r] !== null) {
        switch (typeof row[r]) {
          case 'boolean':
            if (this.datatypes[r] !== 0x01) return true;
            break;
          case 'number':
            if (this.datatypes[r] !== 0x0f) return true;
            break;
          case 'object':
            if (Object.prototype.toString.call(row[r]) === '[object Date]') {
              if (this.datatypes[r] !== 0x0c) return true;
            } else if (Buffer.isBuffer(row[r])) {
              if (this.datatypes[r] !== 0xfb) return true;
            } else if (
              row[r].type != null &&
              [
                'Point',
                'LineString',
                'Polygon',
                'MultiPoint',
                'MultiLineString',
                'MultiPolygon',
                'GeometryCollection'
              ].includes(row[r].type)
            ) {
              if (this.datatypes[r] !== 0xfb) return true;
            } else {
              if (this.datatypes[r] !== 0x0f) return true;
            }
            break;
          default:
            if (this.datatypes[r] !== 0x0f) return true;
        }
      }
    }
    return false;
  }

  writeHeader(row) {
    this.buf[this.pos++] = 0xfa;

    //use last prepare command
    this.buf[this.pos++] = 0xff;
    this.buf[this.pos++] = 0xff;
    this.buf[this.pos++] = 0xff;
    this.buf[this.pos++] = 0xff;

    //set bulk flags to Send types to server
    this.buf[this.pos++] = 0x80;
    this.buf[this.pos++] = 0x00;

    //send data type (strings)
    this.datatypes = [];
    for (let r = 0; r < row.length; r++) {
      if (row[r] === null) {
        this.buf[this.pos++] = 0x0f;
      } else {
        switch (typeof row[r]) {
          case 'boolean':
            this.buf[this.pos++] = 0x01;
            break;
          case 'number':
            this.buf[this.pos++] = 0x0f;
            break;
          case 'object':
            if (Object.prototype.toString.call(row[r]) === '[object Date]') {
              this.buf[this.pos++] = 0x0c;
            } else if (Buffer.isBuffer(row[r])) {
              this.buf[this.pos++] = 0xfb;
            } else if (
              row[r].type != null &&
              [
                'Point',
                'LineString',
                'Polygon',
                'MultiPoint',
                'MultiLineString',
                'MultiPolygon',
                'GeometryCollection'
              ].includes(row[r].type)
            ) {
              this.buf[this.pos++] = 0xfb;
            } else {
              this.buf[this.pos++] = 0x0f;
            }
            break;
          default:
            this.buf[this.pos++] = 0x0f;
        }
      }
      this.datatypes[r] = this.buf[this.pos - 1];
      this.buf[this.pos++] = 0x00;
    }
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

    if (newCapacity > this.maxPacketSize && this.markPos) {
      this.flush(false, len);
      return true;
    } else {
      let newBuf = Buffer.allocUnsafe(Math.min(newCapacity));
      this.buf.copy(newBuf, 0, 0, this.pos);
      this.buf = newBuf;
      return false;
    }
  }

  writeLengthStringAscii(val) {
    let len = val.length;
    //not enough space remaining
    if (len >= this.buf.length - this.pos) {
      let strBuf = Buffer.from(val, 'ascii');
      return this.writeLengthEncodedBuffer(strBuf);
    }

    this.writeLength(len);
    for (let off = 0; off < len; ) {
      this.buf[this.pos++] = val.charCodeAt(off++);
    }
    return false;
  }

  writeLength(len) {
    if (len < 0xfb) {
      return this.writeInt8(len);
    } else if (len < 65536) {
      let flushed = this.writeInt8(0xfc);
      return this.writeInt16(len) || flushed;
    } else if (len < 16777216) {
      let flushed = this.writeInt8(0xfd);
      return this.writeInt24(len) || flushed;
    } else {
      //4 last bytes are filled with 0, packet limitation size is 32 bit integer
      if (this.pos + 9 >= this.buf.length) {
        const tmpBuf = Buffer.allocUnsafe(9);
        tmpBuf[0] = 0xfe;
        tmpBuf[1] = len;
        tmpBuf[2] = len >>> 8;
        tmpBuf[3] = len >>> 16;
        tmpBuf[4] = len >>> 24;
        tmpBuf[5] = 0;
        tmpBuf[6] = 0;
        tmpBuf[7] = 0;
        tmpBuf[8] = 0;
        return this.writeBuffer(tmpBuf);
      }
      this.buf[this.pos++] = 0xfe;
      this.buf[this.pos++] = len;
      this.buf[this.pos++] = len >>> 8;
      this.buf[this.pos++] = len >>> 16;
      this.buf[this.pos++] = len >>> 24;
      this.buf[this.pos++] = 0;
      this.buf[this.pos++] = 0;
      this.buf[this.pos++] = 0;
      this.buf[this.pos++] = 0;
      return false;
    }
  }

  writeLengthEncodedBuffer(val) {
    let valLen = val.length;
    let flushed = this.writeLength(valLen);
    return this.writeBuffer(val) || flushed;
  }

  writeBuffer(val) {
    let flushed = false;
    let valLen = val.length;
    if (valLen > this.buf.length - this.pos) {
      //makes buffer bigger (up to 16M)
      if (this.buf.length < MAX_BUFFER_SIZE) flushed = this.growBuffer(valLen * 2);

      //data may still be bigger than buffer.
      //must flush buffer when full (and reset position to 4)
      if (valLen > this.buf.length - this.pos) {
        let tmpPos = this.buf.length - this.pos;
        val.copy(this.buf, this.pos, 0, tmpPos);
        this.pos += tmpPos;
        this.flush(false, valLen - tmpPos);

        while (tmpPos < valLen) {
          if (this.buf.length - this.pos < valLen - tmpPos) this.growBuffer(valLen - tmpPos);
          const toWrite = Math.min(valLen - tmpPos, this.buf.length - this.pos);
          val.copy(this.buf, this.pos, tmpPos, tmpPos + toWrite);
          tmpPos += toWrite;
          this.pos += toWrite;
          if (valLen - tmpPos > 0) this.flush(false, valLen - tmpPos);
        }
        return true;
      }
    }

    //sure to have enough place to use buffer directly
    val.copy(this.buf, this.pos, 0, valLen);
    this.pos += valLen;
    return flushed;
  }

  writeInt8(value) {
    let flushed = false;
    if (this.pos + 1 > this.buf.length) {
      if (this.buf.length < MAX_BUFFER_SIZE) {
        flushed = this.growBuffer(1);
      } else {
        this.flush(false, 1);
        this.buf[this.pos++] = value;
        return true;
      }
    }
    this.buf[this.pos++] = value;
    return flushed;
  }

  writeInt16(value) {
    let flushed = false;
    if (this.pos + 2 > this.buf.length) {
      if (this.buf.length < this.maxPacketSize) flushed = this.growBuffer(2);
      if (this.pos + 2 > this.buf.length) {
        const tmpBuf = Buffer.allocUnsafe(2);
        tmpBuf[0] = value;
        tmpBuf[1] = value >>> 8;
        this.writeBuffer(tmpBuf);
        return true;
      }
    }
    this.buf[this.pos++] = value;
    this.buf[this.pos++] = value >>> 8;
    return flushed;
  }

  writeInt24(value) {
    let flushed = false;
    if (this.pos + 3 > this.buf.length) {
      if (this.buf.length < this.maxPacketSize) flushed = this.growBuffer(3);
      if (this.pos + 3 > this.buf.length) {
        const tmpBuf = Buffer.allocUnsafe(3);
        tmpBuf[0] = value;
        tmpBuf[1] = value >>> 8;
        tmpBuf[2] = value >>> 16;
        this.writeBuffer(tmpBuf);
        return true;
      }
    }
    this.buf[this.pos++] = value;
    this.buf[this.pos++] = value >>> 8;
    this.buf[this.pos++] = value >>> 16;
    return flushed;
  }

  writeIconvLengthEncodedString(str) {
    let buf = Iconv.encode(str, this.encoding);
    return this.writeLengthEncodedBuffer(buf, 0, buf.length);
  }

  writeDefaultLengthEncodedString(str) {
    //javascript use UCS-2 or UTF-16 string internal representation
    //that means that string to byte will be a maximum of * 3
    // (4 bytes utf-8 are represented on 2 UTF-16 characters)
    if (str.length * 3 + 10 < this.buf.length - this.pos) {
      //reserve position for length indicator
      const maxLen = str.length * 3;
      let lengthPos;
      if (maxLen < 0xfb) {
        lengthPos = this.pos;
        this.pos++;
      } else if (maxLen < 65536) {
        this.buf[this.pos++] = 0xfc;
        lengthPos = this.pos;
        this.pos += 2;
      } else {
        //if len was > 16M, would have been > to buffer length
        this.buf[this.pos++] = 0xfd;
        lengthPos = this.pos;
        this.pos += 3;
      }
      const prevPos = this.pos;
      this.pos += this.buf.write(str, this.pos, this.encoding);
      //write real data length
      const realLen = this.pos - prevPos;
      if (maxLen < 0xfb) {
        this.buf[lengthPos] = realLen;
      } else if (maxLen < 65536) {
        this.buf[lengthPos] = realLen;
        this.buf[lengthPos + 1] = realLen >>> 8;
      } else {
        this.buf[lengthPos] = realLen;
        this.buf[lengthPos + 1] = realLen >>> 8;
        this.buf[lengthPos + 2] = realLen >>> 16;
      }
      return false;
    }

    //checking real length
    let flushed = false;
    let byteLength = Buffer.byteLength(str, this.encoding);
    if (byteLength + 9 > this.buf.length - this.pos) {
      if (this.buf.length < MAX_BUFFER_SIZE) flushed = this.growBuffer(byteLength);

      if (byteLength > this.buf.length - this.pos) {
        //not enough space in buffer, will stream :
        let strBuf = Buffer.from(str, this.encoding);
        return this.writeLengthEncodedBuffer(strBuf) || flushed;
      }
    }
    this.writeLength(byteLength);
    this.pos += this.buf.write(str, this.pos, this.encoding);
    return flushed;
  }

  writeBinaryLocalDate(date, opts) {
    const year = date.getFullYear();
    const mon = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const min = date.getMinutes();
    const sec = date.getSeconds();
    const ms = date.getMilliseconds();
    return this._writeBinaryDate(year, mon, day, hour, min, sec, ms);
  }

  _writeBinaryDate(year, mon, day, hour, min, sec, ms) {
    let len = ms === 0 ? 7 : 11;
    //not enough space remaining
    if (len + 1 > this.buf.length - this.pos) {
      let tmpBuf = Buffer.allocUnsafe(len + 1);

      tmpBuf[0] = len;
      tmpBuf[1] = year;
      tmpBuf[2] = year >>> 8;
      tmpBuf[3] = mon;
      tmpBuf[4] = day;
      tmpBuf[5] = hour;
      tmpBuf[6] = min;
      tmpBuf[7] = sec;
      if (ms !== 0) {
        const micro = ms * 1000;
        tmpBuf[8] = micro;
        tmpBuf[9] = micro >>> 8;
        tmpBuf[10] = micro >>> 16;
        tmpBuf[11] = micro >>> 24;
      }

      return this.writeBuffer(tmpBuf);
    }

    this.buf[this.pos] = len;
    this.buf[this.pos + 1] = year;
    this.buf[this.pos + 2] = year >>> 8;
    this.buf[this.pos + 3] = mon;
    this.buf[this.pos + 4] = day;
    this.buf[this.pos + 5] = hour;
    this.buf[this.pos + 6] = min;
    this.buf[this.pos + 7] = sec;

    if (ms !== 0) {
      const micro = ms * 1000;
      this.buf[this.pos + 8] = micro;
      this.buf[this.pos + 9] = micro >>> 8;
      this.buf[this.pos + 10] = micro >>> 16;
      this.buf[this.pos + 11] = micro >>> 24;
    }
    this.pos += len + 1;
    return false;
  }

  writeBinaryTimezoneDate(date, opts) {
    const formated = opts.tz(date).format('YYYY-MM-DD HH:mm:ss.SSSSSS');
    const dateZoned = new Date(formated + 'Z');

    const year = dateZoned.getUTCFullYear();
    const mon = dateZoned.getUTCMonth() + 1;
    const day = dateZoned.getUTCDate();
    const hour = dateZoned.getUTCHours();
    const min = dateZoned.getUTCMinutes();
    const sec = dateZoned.getUTCSeconds();
    const ms = dateZoned.getUTCMilliseconds();
    return this._writeBinaryDate(year, mon, day, hour, min, sec, ms);
  }

  mark(isLast, nextRow) {
    let flushed = false;
    this.nextRow = nextRow;
    if (this.singleQuery) {
      //end of big query that is more than 16M
      //write single one
      if (!this.haveErrorResponse) {
        const packetSendSize =
          this.pos +
          (this.singleQuerySequenceNo !== undefined
            ? (this.singleQuerySequenceNo + 1) * MAX_BUFFER_SIZE
            : 0);
        if (this.maxAllowedPacket && packetSendSize > this.maxAllowedPacket) {
          console.log(
            "will send a packet to db server with size > connection option 'maxAllowedPacket' (size send is " +
              packetSendSize +
              ') connection might be reset by server'
          );
        }
        this.copyAndFlush(true);
        flushed = true;
        this.markPos = undefined;
      }

      this.singleQuerySequenceNo = undefined;
      this.singleQueryCompressSequenceNo = undefined;
      this.singleQuery = false;
      this.writeHeader(nextRow);
      this.markPos = undefined;
    } else {
      if (!isLast && this.datatypeChanged(nextRow)) {
        this.markPos = this.pos;
        this.flushMark();
        flushed = true;
      } else if (this.markPos && this.pos > this.maxPacketSize) {
        //not enough room for current query , flush mark.
        this.flushMark();
        flushed = true;
      } else {
        //just mark ending query
        this.markPos = this.pos;
        if (isLast) {
          this.flushMark();
          flushed = true;
        }
      }
    }
    return flushed;
  }

  flush(end, remainingLen) {
    if (this.markPos && !this.singleQuery) {
      this.flushMark();
    } else {
      //one insert is more than 16M, will continue to mono insert, hoping
      //that max_allowed_packet is sized accordingly to query.
      if (this.buf.length < MAX_BUFFER_SIZE) {
        //in this case, connector has default to 4M packet, and a single query size
        //is > to 4mb. growing buffer to 16M
        let newBuf = Buffer.allocUnsafe(MAX_BUFFER_SIZE);
        this.buf.copy(newBuf, 0, 0, this.pos);
        this.buf = newBuf;
      } else {
        if (!this.haveErrorResponse) {
          if (this.maxAllowedPacket && this.buf.length > this.maxAllowedPacket) {
            console.log(
              "will send a packet to server with size > connection option 'maxAllowedPacket' (size send is " +
                this.pos +
                ') connection might be reset by server'
            );
          }
          this.copyAndFlush(false);

          this.markPos = undefined;
          if (!this.singleQuery) this.waitingResponseNo++;
          this.singleQuery = true;
          this.singleQuerySequenceNo = this.out.cmd.sequenceNo;
          this.singleQueryCompressSequenceNo = this.out.cmd.compressSequenceNo;
        }
      }
    }
  }

  flushMark() {
    let afterMark;
    if (this.pos !== this.markPos) {
      afterMark = Buffer.allocUnsafe(this.pos - this.markPos);
      this.buf.copy(afterMark, 0, this.markPos, this.pos);
    }

    this.pos = this.markPos;

    if (!this.haveErrorResponse) {
      this.copyAndFlush(true);
      this.waitingResponseNo++;
    }

    this.pos = 4;
    if (this.nextRow) this.writeHeader(this.nextRow);
    if (afterMark) {
      if (this.buf.length - this.pos < afterMark.length)
        this.growBuffer(afterMark.length - (this.buf.length - this.pos));
      afterMark.copy(this.buf, this.pos, 0, afterMark.length);
      this.pos += afterMark.length;
    }
    this.markPos = undefined;
    this.singleQuery = false;
    this.singleQuerySequenceNo = undefined;
    this.singleQueryCompressSequenceNo = undefined;
  }

  copyAndFlush(ended) {
    this.out.buf = this.buf;
    this.out.pos = this.pos;
    if (this.singleQuerySequenceNo !== undefined) {
      this.out.cmd.sequenceNo = this.singleQuerySequenceNo;
      this.out.cmd.compressSequenceNo = this.singleQueryCompressSequenceNo;
    } else {
      this.out.cmd.sequenceNo = -1;
      this.out.cmd.compressSequenceNo = -1;
    }
    this.out.flushBuffer(ended);
    if (this.singleQuerySequenceNo !== undefined) {
      this.singleQuerySequenceNo = this.out.cmd.sequenceNo;
      this.singleQueryCompressSequenceNo = this.out.cmd.compressSequenceNo;
    }
    this.pos = 4;
    this.buf = Buffer.allocUnsafe(SMALL_BUFFER_SIZE);
  }

  endedWithError() {
    this.haveErrorResponse = true;
  }
}

module.exports = BulkPacket;
