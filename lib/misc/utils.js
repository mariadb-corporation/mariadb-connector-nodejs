'use strict';

const hexArray = '0123456789ABCDEF'.split('');

/**
 * Write bytes/hexadecimal value of a byte array to a string.
 * String output example :
 * 38 00 00 00 03 63 72 65  61 74 65 20 74 61 62 6C     8....create tabl
 * 65 20 42 6C 6F 62 54 65  73 74 63 6C 6F 62 74 65     e BlobTestclobte
 * 73 74 32 20 28 73 74 72  6D 20 74 65 78 74 29 20     st2 (strm text)
 * 43 48 41 52 53 45 54 20  75 74 66 38                 CHARSET utf8
 */
module.exports.log = function(opts, buf, off, len, header) {
  let out = [];

  if (!buf || len !== 0) {
    let asciiValue = new Array(16);
    asciiValue[8] = ' ';

    let useHeader = header !== undefined;
    let offset = off || 0;
    const maxLgh = Math.min(
      useHeader ? opts.debugLen - header.length : opts.debugLen,
      len - offset
    );
    const isLimited = len - offset > maxLgh;
    let byteValue;
    let posHexa = 0;
    let pos = 0;

    if (useHeader) {
      while (pos < header.length) {
        byteValue = header[pos++] & 0xff;
        out.push(hexArray[byteValue >>> 4], hexArray[byteValue & 0x0f], ' ');
        asciiValue[posHexa++] =
          byteValue > 31 && byteValue < 127 ? String.fromCharCode(byteValue) : '.';
      }
    }

    pos = offset;
    while (pos < maxLgh + offset) {
      byteValue = buf[pos] & 0xff;

      out.push(hexArray[byteValue >>> 4], hexArray[byteValue & 0x0f], ' ');

      asciiValue[posHexa++] =
        byteValue > 31 && byteValue < 127 ? String.fromCharCode(byteValue) : '.';

      if (posHexa === 8) out.push(' ');
      if (posHexa === 16) {
        out.push('    ', asciiValue.join(''), '\n');
        posHexa = 0;
      }
      pos++;
    }

    let remaining = posHexa;
    if (remaining > 0) {
      if (remaining < 8) {
        for (; remaining < 8; remaining++) out.push('   ');
        out.push(' ');
      }

      for (; remaining < 16; remaining++) out.push('   ');

      out.push('    ', asciiValue.slice(0, posHexa).join('') + (isLimited ? ' ...' : ''), '\n');
    } else if (isLimited) {
      out[out.length - 2] = out[out.length - 2] + ' ...';
    }
    return out.join('');
  }
  return '';
};
