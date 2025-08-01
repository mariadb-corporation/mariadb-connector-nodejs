//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import * as Utils from '../../../lib/misc/utils.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import ConnOptions from '../../../lib/config/connection-options.js';
import Collations from '../../../lib/const/collations.js';
import ConnectionInformation from '../../../lib/misc/connection-information.js';

describe('utils', () => {
  const head = Buffer.from([0xaa, 0xbb, 0xcc, 0x33]);
  const buf = Buffer.from([0xf0, 0x9f, 0xa4, 0x98, 0xf0, 0x9f, 0x92, 0xaa]); // 🤘💪
  const longbuf = Buffer.from([
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10
  ]);

  test('log', () => {
    const opts = new ConnOptions({});
    const buf = Buffer.from('test some value 123');
    assert.equal(
      Utils.log(opts, buf),
      '+--------------------------------------------------+\n' +
        '|  0  1  2  3  4  5  6  7   8  9  a  b  c  d  e  f |\n' +
        '+--------------------------------------------------+------------------+\n' +
        '| 74 65 73 74 20 73 6F 6D  65 20 76 61 6C 75 65 20 | test some value  |\n' +
        '| 31 32 33                                         | 123              |\n' +
        '+--------------------------------------------------+------------------+\n'
    );
    assert.equal(
      Utils.log(opts, buf, 3),
      '+--------------------------------------------------+\n' +
        '|  0  1  2  3  4  5  6  7   8  9  a  b  c  d  e  f |\n' +
        '+--------------------------------------------------+------------------+\n' +
        '| 74 20 73 6F 6D 65 20 76  61 6C 75 65 20 31 32 33 | t some value 123 |\n' +
        '+--------------------------------------------------+------------------+\n'
    );
    assert.equal(Utils.log(opts), '');
  });

  test('log no buffer', () => {
    let opt = new ConnOptions();
    assert.equal('', Utils.log(opt, null, 0, 0));
  });

  test('log no length', () => {
    let opt = new ConnOptions();
    assert.equal(
      '+--------------------------------------------------+\n' +
        '|  0  1  2  3  4  5  6  7   8  9  a  b  c  d  e  f |\n' +
        '+--------------------------------------------------+------------------+\n' +
        '| F0 9F A4 98 F0 9F 92 AA                          | ........         |\n' +
        '+--------------------------------------------------+------------------+\n',
      Utils.log(opt, buf, 0, 0, buf)
    );
  });

  test('log entry without header', () => {
    let opt = new ConnOptions();
    assert.equal(
      '+--------------------------------------------------+\n' +
        '|  0  1  2  3  4  5  6  7   8  9  a  b  c  d  e  f |\n' +
        '+--------------------------------------------------+------------------+\n' +
        '| F0 9F A4 98 F0 9F 92 AA                          | ........         |\n' +
        '+--------------------------------------------------+------------------+\n',
      Utils.log(opt, buf, 0, buf.length)
    );
  });

  test('log entry with header', () => {
    let opt = new ConnOptions();
    assert.equal(
      '+--------------------------------------------------+\n' +
        '|  0  1  2  3  4  5  6  7   8  9  a  b  c  d  e  f |\n' +
        '+--------------------------------------------------+------------------+\n' +
        '| AA BB CC 33 F0 9F A4 98  F0 9F                   | ...3......       |\n' +
        '+--------------------------------------------------+------------------+\n',
      Utils.log(opt, buf, 0, buf.length - 2, head)
    );
  });

  test('log entry with header without length', () => {
    let opt = new ConnOptions();
    assert.equal(
      '+--------------------------------------------------+\n' +
        '|  0  1  2  3  4  5  6  7   8  9  a  b  c  d  e  f |\n' +
        '+--------------------------------------------------+------------------+\n' +
        '| AA BB CC 33 F0 9F A4 98  F0 9F 92 AA             | ...3........     |\n' +
        '+--------------------------------------------------+------------------+\n',
      Utils.log(opt, buf, 0, null, head)
    );
  });

  test('log entry multi-line', () => {
    let opt = new ConnOptions();
    assert.equal(
      '+--------------------------------------------------+\n' +
        '|  0  1  2  3  4  5  6  7   8  9  a  b  c  d  e  f |\n' +
        '+--------------------------------------------------+------------------+\n' +
        '| 00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F | ................ |\n' +
        '| 10                                               | .                |\n' +
        '+--------------------------------------------------+------------------+\n',
      Utils.log(opt, longbuf, 0, longbuf.length)
    );
  });

  test('log entry multi-line with header', () => {
    let opt = new ConnOptions();
    assert.equal(
      '+--------------------------------------------------+\n' +
        '|  0  1  2  3  4  5  6  7   8  9  a  b  c  d  e  f |\n' +
        '+--------------------------------------------------+------------------+\n' +
        '| AA BB CC 33 00 01 02 03  04 05 06 07 08 09 0A 0B | ...3............ |\n' +
        '| 0C 0D 0E 0F 10                                   | .....            |\n' +
        '+--------------------------------------------------+------------------+\n',
      Utils.log(opt, longbuf, 0, longbuf.length, head)
    );
  });

  test('log limited entry', () => {
    let opt = new ConnOptions();
    assert.equal(
      '+--------------------------------------------------+\n' +
        '|  0  1  2  3  4  5  6  7   8  9  a  b  c  d  e  f |\n' +
        '+--------------------------------------------------+------------------+\n' +
        '| AA BB CC 33 00 01 02 03  04 05 06 07 08 09 0A 0B | ...3............ |\n' +
        '| 0C 0D 0E 0F                                      | ....             |\n' +
        '+--------------------------------------------------+------------------+\n',
      Utils.log(opt, longbuf, 0, longbuf.length - 1, head)
    );
  });

  test('log offset entry', () => {
    let opt = new ConnOptions();
    assert.equal(
      '+--------------------------------------------------+\n' +
        '|  0  1  2  3  4  5  6  7   8  9  a  b  c  d  e  f |\n' +
        '+--------------------------------------------------+------------------+\n' +
        '| AA BB CC 33 01 02 03 04  05 06 07 08 09 0A 0B 0C | ...3............ |\n' +
        '| 0D 0E 0F 10                                      | ....             |\n' +
        '+--------------------------------------------------+------------------+\n',
      Utils.log(opt, longbuf, 1, longbuf.length, head)
    );
  });

  test('log option limited', () => {
    let opt = new ConnOptions();
    opt.debugLen = 16;
    assert.equal(
      '+--------------------------------------------------+\n' +
        '|  0  1  2  3  4  5  6  7   8  9  a  b  c  d  e  f |\n' +
        '+--------------------------------------------------+------------------+\n' +
        '| AA BB CC 33 01 02 03 04  05 06 07 08 09 0A 0B 0C | ...3............ |...\n' +
        '+--------------------------------------------------+------------------+\n',
      Utils.log(opt, longbuf, 1, longbuf.length, head)
    );
  });

  test('log option partial limited', () => {
    let opt = new ConnOptions();
    opt.debugLen = 14;
    assert.equal(
      '+--------------------------------------------------+\n' +
        '|  0  1  2  3  4  5  6  7   8  9  a  b  c  d  e  f |\n' +
        '+--------------------------------------------------+------------------+\n' +
        '| AA BB CC 33 01 02 03 04  05 06 07 08 09 0A       | ...3..........   |...\n' +
        '+--------------------------------------------------+------------------+\n',
      Utils.log(opt, longbuf, 1, longbuf.length, head)
    );
  });

  test('log option partial limited', () => {
    let opt = new ConnOptions();
    opt.debugLen = 7;
    assert.equal(
      '+--------------------------------------------------+\n' +
        '|  0  1  2  3  4  5  6  7   8  9  a  b  c  d  e  f |\n' +
        '+--------------------------------------------------+------------------+\n' +
        '| AA BB CC 33 01 02 03                             | ...3...          |...\n' +
        '+--------------------------------------------------+------------------+\n',
      Utils.log(opt, longbuf, 1, longbuf.length, head)
    );
  });

  test('log option limited multi-line', () => {
    let opt = new ConnOptions();
    opt.debugLen = 18;
    assert.equal(
      '+--------------------------------------------------+\n' +
        '|  0  1  2  3  4  5  6  7   8  9  a  b  c  d  e  f |\n' +
        '+--------------------------------------------------+------------------+\n' +
        '| AA BB CC 33 01 02 03 04  05 06 07 08 09 0A 0B 0C | ...3............ |\n' +
        '| 0D 0E                                            | ..               |...\n' +
        '+--------------------------------------------------+------------------+\n',
      Utils.log(opt, longbuf, 1, longbuf.length, head)
    );
  });

  test('escapeId', () => {
    assert.equal('`bla`', Utils.escapeId(null, null, 'bla'));
    assert.equal('```bla```', Utils.escapeId(null, null, '`bla`'));
    assert.equal('```bla``s`', Utils.escapeId(null, null, '`bla`s'));
    assert.equal('```bla````s```', Utils.escapeId(null, null, '`bla``s`'));
    assert.equal('``````', Utils.escapeId(null, null, '``'));
  });

  test('escapeParameters', () => {
    const opt = new ConnOptions();
    const info = new ConnectionInformation(opt);
    info.collation = Collations.fromCharset('big5');
    assert.equal("_binary'test'", Utils.escape(opt, info, Buffer.from('test')));
  });
});
