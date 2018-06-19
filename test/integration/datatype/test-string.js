"use strict";

const base = require("../../base.js");
const { assert } = require("chai");

describe("string", () => {
  it("utf8 buffer verification", done => {
    shareConn.query(
      "CREATE TEMPORARY TABLE buf_utf8_chars(tt text  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci)"
    );
    const buf = Buffer.from([0xf0, 0x9f, 0xa4, 0x98, 0xf0, 0x9f, 0x92, 0xaa]); // 🤘💪
    shareConn.query("INSERT INTO buf_utf8_chars VALUES (?)", buf);
    shareConn
      .query("SELECT _binary'🤘💪' t1, '🤘💪' t2, tt FROM buf_utf8_chars")
      .then(results => {
        assert.equal(results[0].t1, "🤘💪");
        assert.equal(results[0].t2, "🤘💪");
        assert.equal(results[0].tt, "🤘💪");
        done();
      })
      .catch(done);
  });

  it("utf8 strings", done => {
    shareConn.query(
      "CREATE TEMPORARY TABLE buf_utf8_string(tt text  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci)"
    );

    //F0 9F 98 8E 😎 unicode 6 smiling face with sunglasses
    //F0 9F 8C B6 🌶 unicode 7 hot pepper
    //F0 9F 8E A4 🎤 unicode 8 no microphones
    //F0 9F A5 82 🥂 unicode 9 champagne glass

    shareConn.query(
      "INSERT INTO buf_utf8_string values " +
        "('hel\\'lo'), " +
        "('您好 (chinese)'), " +
        "('नमस्ते (Hindi)'), " +
        "('привет (Russian)'), " +
        "('😎🌶🎤🥂')"
    );

    shareConn
      .query("SELECT * from buf_utf8_string")
      .then(rows => {
        checkUtf8String(rows);
        done();
      })
      .catch(done);
  });

  const checkUtf8String = res => {
    assert.equal(res[0].tt, "hel'lo");
    assert.equal(res[1].tt, "您好 (chinese)");
    assert.equal(res[2].tt, "नमस्ते (Hindi)");
    assert.equal(res[3].tt, "привет (Russian)");
    assert.equal(res[4].tt, "😎🌶🎤🥂");
  };

  it("connection encoding", done => {
    const value = "©°";
    const encodings = ["KOI8R_GENERAL_CI", "UTF8_GENERAL_CI", "CP850_BIN", "CP1251_GENERAL_CI"];
    for (let i = 0; i < encodings.length; i++) {
      base
        .createConnection({ charset: encodings[i] })
        .then(conn => {
          conn
            .query("select ? as t", value)
            .then(res => {
              assert.strictEqual(res[0].t, value);
              conn.end();
              if (i === encodings.length - 1) done();
            })
            .catch(done);
        })
        .catch(done);
    }
  });

  it("table encoding not affecting query", done => {
    const str = "財團法人資訊工業策進會";
    shareConn.query("CREATE TEMPORARY TABLE utf8_encoding_table(t1 text) CHARSET utf8");
    shareConn.query("CREATE TEMPORARY TABLE big5_encoding_table(t2 text) CHARSET big5");
    shareConn.query("INSERT INTO utf8_encoding_table values (?)", [str]);
    shareConn.query("INSERT INTO big5_encoding_table values (?)", [str]);
    shareConn
      .query("SELECT * from utf8_encoding_table, big5_encoding_table")
      .then(res => {
        assert.deepEqual(res, [{ t1: str, t2: str }]);
        done();
      })
      .catch(done);
  });

  it("string escape", done => {
    shareConn.query("CREATE TEMPORARY TABLE escape_utf8_string(tt text) CHARSET utf8");
    shareConn.query("INSERT INTO escape_utf8_string values (?)", ["a 'b\\\"c"]);
    shareConn
      .query("SELECT * from escape_utf8_string")
      .then(res => {
        assert.deepEqual(res, [{ tt: "a 'b\\\"c" }]);
        done();
      })
      .catch(done);
  });

  it("wrong surrogate", done => {
    const wrongString = "a\ue800\ud800b\udc01c\ud800";
    base.createConnection().then(conn => {
      conn.query("CREATE TEMPORARY TABLE wrong_utf8_string(tt text) CHARSET utf8mb4");
      conn.query("INSERT INTO wrong_utf8_string values (?)", [wrongString]);
      conn
        .query("SELECT * from wrong_utf8_string")
        .then(res => {
          assert.deepEqual(res, [{ tt: "a?b?c?" }]);
          conn.end();
          done();
        })
        .catch(done);
    });
  });
});
