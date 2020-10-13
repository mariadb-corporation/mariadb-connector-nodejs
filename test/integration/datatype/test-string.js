'use strict';

const base = require('../../base.js');
const { assert } = require('chai');

describe('string', () => {
  it('String escape', function (done) {
    assert.equal(shareConn.escape(null), 'NULL');
    assert.equal(shareConn.escape("let'g'o😊"), "'let\\'g\\'o😊'");
    const buf = "a'\nb\tc\rd\\e%_\u001a";
    assert.equal(shareConn.escape(buf), "'a\\'\\nb\\tc\\rd\\\\e%_\\Z'");
    shareConn
      .query(' SELECT ' + shareConn.escape('\u0000\u001a') + ' t')
      .then((rows) => {
        assert.deepEqual(rows, [{ t: '\u0000\u001a' }]);
      })
      .catch(done);
    shareConn
      .query(' SELECT ' + shareConn.escape(buf) + ' t')
      .then((rows) => {
        assert.deepEqual(rows, [{ t: buf }]);
        done();
      })
      .catch(done);
  });

  it('utf8 buffer verification', function (done) {
    if (!base.utf8Collation()) this.skip();

    const buf = Buffer.from([0xf0, 0x9f, 0xa4, 0x98, 0xf0, 0x9f, 0x92, 0xaa]); // 🤘💪
    shareConn
      .query('DROP TABLE IF EXISTS buf_utf8_chars')
      .then(() => {
        return shareConn.query(
          'CREATE TABLE buf_utf8_chars(tt text  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci)'
        );
      })
      .then(() => {
        return shareConn.query('INSERT INTO buf_utf8_chars VALUES (?)', buf);
      })
      .then(() => {
        return shareConn.query("SELECT _binary'🤘💪' t1, '🤘💪' t2, tt FROM buf_utf8_chars");
      })
      .then((results) => {
        assert.equal(results[0].t1, '🤘💪');
        assert.equal(results[0].t2, '🤘💪');
        assert.equal(results[0].tt, '🤘💪');
        return shareConn.query('INSERT INTO buf_utf8_chars VALUES (?)', ['🤘🤖']);
      })
      .then(() => {
        return shareConn.query('SELECT ? t2, tt FROM buf_utf8_chars', ['🤖']);
      })
      .then((rows) => {
        assert.equal(rows[0].tt, '🤘💪');
        assert.equal(rows[0].t2, '🤖');
        assert.equal(rows[1].tt, '🤘🤖');
        assert.equal(rows[1].t2, '🤖');
        done();
      })
      .catch(done);
  });

  it('utf8 strings', function (done) {
    if (!base.utf8Collation()) this.skip();
    shareConn
      .query('DROP TABLE IF EXISTS buf_utf8_string')
      .then(() => {
        return shareConn.query(
          'CREATE TABLE buf_utf8_string(tt text  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci)'
        );
      })
      .then(() => {
        //F0 9F 98 8E 😎 unicode 6 smiling face with sunglasses
        //F0 9F 8C B6 🌶 unicode 7 hot pepper
        //F0 9F 8E A4 🎤 unicode 8 no microphones
        //F0 9F A5 82 🥂 unicode 9 champagne glass

        return shareConn.query(
          'INSERT INTO buf_utf8_string values ' +
            "('hel\\'lo'), " +
            "('您好 (chinese)'), " +
            "('नमस्ते (Hindi)'), " +
            "('привет (Russian)'), " +
            "('😎🌶🎤🥂')"
        );
      })
      .then(() => {
        return shareConn.query('SELECT * from buf_utf8_string');
      })
      .then((rows) => {
        checkUtf8String(rows);
        done();
      })
      .catch(done);
  });

  const checkUtf8String = (res) => {
    assert.equal(res[0].tt, "hel'lo");
    assert.equal(res[1].tt, '您好 (chinese)');
    assert.equal(res[2].tt, 'नमस्ते (Hindi)');
    assert.equal(res[3].tt, 'привет (Russian)');
    assert.equal(res[4].tt, '😎🌶🎤🥂');
  };

  it('connection encoding', (done) => {
    const value = '©°';
    const encodings = ['KOI8R_GENERAL_CI', 'UTF8_GENERAL_CI', 'CP850_BIN', 'CP1251_GENERAL_CI'];
    for (let i = 0; i < encodings.length; i++) {
      base
        .createConnection({ collation: encodings[i] })
        .then((conn) => {
          conn
            .query('select ? as t', value)
            .then((res) => {
              assert.strictEqual(res[0].t, value);
              conn.end();
              if (i === encodings.length - 1) done();
            })
            .catch(done);
        })
        .catch(done);
    }
  });

  it('table encoding not affecting query', function (done) {
    if (!base.utf8Collation()) this.skip();
    const str = '財團法人資訊工業策進會';
    shareConn
      .query('DROP TABLE IF EXISTS utf8_encoding_table')
      .then(() => {
        return shareConn.query('DROP TABLE IF EXISTS big5_encoding_table');
      })
      .then(() => {
        return shareConn.query('CREATE TABLE utf8_encoding_table(t1 text) CHARSET utf8');
      })
      .then(() => {
        return shareConn.query('CREATE TABLE big5_encoding_table(t2 text) CHARSET big5');
      })
      .then(() => {
        return shareConn.query('INSERT INTO utf8_encoding_table values (?)', [str]);
      })
      .then(() => {
        return shareConn.query('INSERT INTO big5_encoding_table values (?)', [str]);
      })
      .then(() => {
        return shareConn.query('SELECT * from utf8_encoding_table, big5_encoding_table');
      })
      .then((res) => {
        assert.deepEqual(res, [{ t1: str, t2: str }]);
        done();
      })
      .catch(done);
  });

  it('string escape', (done) => {
    shareConn
      .query('DROP TABLE IF EXISTS escape_utf8_string')
      .then(() => {
        return shareConn.query('CREATE TABLE escape_utf8_string(tt text) CHARSET utf8');
      })
      .then(() => {
        return shareConn.query('INSERT INTO escape_utf8_string values (?)', ['a \'b\\"c']);
      })
      .then(() => {
        return shareConn.query('SELECT * from escape_utf8_string');
      })
      .then((res) => {
        assert.deepEqual(res, [{ tt: 'a \'b\\"c' }]);
        done();
      })
      .catch(done);
  });

  it('wrong surrogate', function (done) {
    if (!base.utf8Collation()) this.skip();

    const wrongString = 'a\ue800\ud800b\udc01c\ud800';
    base.createConnection().then((conn) => {
      conn
        .query('DROP TABLE IF EXISTS wrong_utf8_string')
        .then(() => {
          return conn.query('CREATE TABLE wrong_utf8_string(tt text) CHARSET utf8mb4');
        })
        .then(() => {
          return conn.query('INSERT INTO wrong_utf8_string values (?)', [wrongString]);
        })
        .then(() => {
          return conn.query('SELECT * from wrong_utf8_string');
        })
        .then((res) => {
          assert.deepEqual(res, [{ tt: 'a?b?c?' }]);
          conn.end();
          done();
        })
        .catch(done);
    });
  });
});
