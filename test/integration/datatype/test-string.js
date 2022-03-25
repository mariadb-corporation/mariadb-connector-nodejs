'use strict';

const base = require('../../base.js');
const { assert } = require('chai');
const { isXpand } = require('../../base');

describe('string', () => {
  it('String escape', async function () {
    assert.equal(shareConn.escape(null), 'NULL');
    assert.equal(shareConn.escape("let'g'o😊"), "'let\\'g\\'o😊'");
    const buf = "a'\nb\tc\rd\\e%_\u001a";
    assert.equal(shareConn.escape(buf), "'a\\'\\nb\\tc\\rd\\\\e%_\\Z'");
    let rows = await shareConn.query(' SELECT ' + shareConn.escape('\u0000\u001a') + ' t');
    assert.deepEqual(rows, [{ t: '\u0000\u001a' }]);
    rows = await shareConn.query(' SELECT ' + shareConn.escape(buf) + ' t');
    assert.deepEqual(rows, [{ t: buf }]);
  });

  it('utf8 buffer verification', async function () {
    if (!base.utf8Collation()) this.skip();

    const buf = Buffer.from([0xf0, 0x9f, 0xa4, 0x98, 0xf0, 0x9f, 0x92, 0xaa]); // 🤘💪
    await shareConn.query('DROP TABLE IF EXISTS buf_utf8_chars');
    await shareConn.query('CREATE TABLE buf_utf8_chars(tt text  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci)');
    await shareConn.query('INSERT INTO buf_utf8_chars VALUES (?)', buf);
    let results = await shareConn.query("SELECT _binary'🤘💪' t1, '🤘💪' t2, tt FROM buf_utf8_chars");
    assert.equal(results[0].t1, '🤘💪');
    assert.equal(results[0].t2, '🤘💪');
    assert.equal(results[0].tt, '🤘💪');
    await shareConn.execute('INSERT INTO buf_utf8_chars VALUES (?)', ['🤘🤖']);
    const rows = await shareConn.execute('SELECT ? t2, tt FROM buf_utf8_chars', ['🤖']);
    assert.equal(rows[0].tt, '🤘💪');
    assert.equal(rows[0].t2, '🤖');
    assert.equal(rows[1].tt, '🤘🤖');
    assert.equal(rows[1].t2, '🤖');
  });

  it('utf8 strings', async function () {
    if (!base.utf8Collation()) this.skip();
    await shareConn.query('DROP TABLE IF EXISTS buf_utf8_string');
    await shareConn.query('CREATE TABLE buf_utf8_string(tt text  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci)');

    //F0 9F 98 8E 😎 unicode 6 smiling face with sunglasses
    //F0 9F 8C B6 🌶 unicode 7 hot pepper
    //F0 9F 8E A4 🎤 unicode 8 no microphones
    //F0 9F A5 82 🥂 unicode 9 champagne glass

    await shareConn.query(
      'INSERT INTO buf_utf8_string values ' +
        "('hel\\'lo'), " +
        "('您好 (chinese)'), " +
        "('नमस्ते (Hindi)'), " +
        "('привет (Russian)'), " +
        "('😎🌶🎤🥂')"
    );
    let rows = await shareConn.query('SELECT * from buf_utf8_string');
    checkUtf8String(rows);
    rows = await shareConn.execute('SELECT * from buf_utf8_string');
    checkUtf8String(rows);
  });

  const checkUtf8String = (res) => {
    assert.equal(res[0].tt, "hel'lo");
    assert.equal(res[1].tt, '您好 (chinese)');
    assert.equal(res[2].tt, 'नमस्ते (Hindi)');
    assert.equal(res[3].tt, 'привет (Russian)');
    assert.equal(res[4].tt, '😎🌶🎤🥂');
  };

  it('connection encoding', async function () {
    if (isXpand()) this.skip();
    this.timeout(10000);
    const value = '©°';
    const encodings = ['KOI8R_GENERAL_CI', 'UTF8_GENERAL_CI', 'CP850_BIN', 'CP1251_GENERAL_CI'];
    for (let i = 0; i < encodings.length; i++) {
      const conn = await base.createConnection({ collation: encodings[i] });
      let res = await conn.query('select ? as t', value);
      assert.strictEqual(res[0].t, value);
      res = await conn.execute('select ? as t', value);
      assert.strictEqual(res[0].t, value);

      conn.end();
    }
  });

  it('table encoding not affecting query', async function () {
    if (isXpand()) this.skip();
    if (!base.utf8Collation()) this.skip();
    const str = '財團法人資訊工業策進會';
    await shareConn.query('DROP TABLE IF EXISTS utf8_encoding_table');
    await shareConn.query('DROP TABLE IF EXISTS big5_encoding_table');
    await shareConn.query('CREATE TABLE utf8_encoding_table(t1 text) CHARSET utf8');
    await shareConn.query('CREATE TABLE big5_encoding_table(t2 text) CHARSET big5');
    await shareConn.query('INSERT INTO utf8_encoding_table values (?)', [str]);
    await shareConn.query('INSERT INTO big5_encoding_table values (?)', [str]);
    let res = await shareConn.query('SELECT * from utf8_encoding_table, big5_encoding_table');
    assert.deepEqual(res, [{ t1: str, t2: str }]);
    res = await shareConn.execute('SELECT * from utf8_encoding_table, big5_encoding_table');
    assert.deepEqual(res, [{ t1: str, t2: str }]);
  });

  it('string escape', async () => {
    await shareConn.query('DROP TABLE IF EXISTS escape_utf8_string');
    await shareConn.query('CREATE TABLE escape_utf8_string(tt text) CHARSET utf8');
    await shareConn.query('INSERT INTO escape_utf8_string values (?)', ['a \'b\\"c']);
    let res = await shareConn.query('SELECT * from escape_utf8_string');
    assert.deepEqual(res, [{ tt: 'a \'b\\"c' }]);
    res = await shareConn.execute('SELECT * from escape_utf8_string');
    assert.deepEqual(res, [{ tt: 'a \'b\\"c' }]);
  });

  it('wrong surrogate', async function () {
    if (!base.utf8Collation()) this.skip();

    const wrongString = 'a\ue800\ud800b\udc01c\ud800';
    const conn = await base.createConnection();
    await conn.query('DROP TABLE IF EXISTS wrong_utf8_string');
    await conn.query('CREATE TABLE wrong_utf8_string(tt text) CHARSET utf8mb4');
    await conn.query('INSERT INTO wrong_utf8_string values (?)', [wrongString]);
    let res = await conn.query('SELECT * from wrong_utf8_string');
    assert.deepEqual(res, [{ tt: 'a?b?c?' }]);
    res = await conn.execute('SELECT * from wrong_utf8_string');
    assert.deepEqual(res, [{ tt: 'a?b?c?' }]);
    conn.end();
  });
});
