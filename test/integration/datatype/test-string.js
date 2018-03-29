"use strict";

const base = require("../../base.js");
const assert = require("chai").assert;

describe("string", () => {
  it("utf8 buffer verification", done => {
    shareConn.query(
      "CREATE TEMPORARY TABLE buf_utf8_chars(tt text  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci)"
    );
    const buf = Buffer.from([0xf0, 0x9f, 0xa4, 0x98, 0xf0, 0x9f, 0x92, 0xaa]); // 🤘💪
    shareConn.query("INSERT INTO buf_utf8_chars VALUES (?)", buf);
    shareConn.query("SELECT _binary'🤘💪' t1, '🤘💪' t2, tt FROM buf_utf8_chars", function(
      err,
      results
    ) {
      if (err) {
        done(err);
      } else {
        assert.equal(results[0].t1, "🤘💪");
        assert.equal(results[0].t2, "🤘💪");
        assert.equal(results[0].tt, "🤘💪");
        done();
      }
    });
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
        "('hello'), " +
        "('您好 (chinese)'), " +
        "('नमस्ते (Hindi)'), " +
        "('привет (Russian)'), " +
        "('😎🌶🎤🥂')"
    );

    shareConn.query("SELECT * from buf_utf8_string", (err, res) => checkUtf8String(err, res));
    shareConn.execute("SELECT * from buf_utf8_string", (err, res) =>
      checkUtf8String(err, res, done)
    );
  });

  const checkUtf8String = (err, res, done) => {
    if (err) {
      done(err);
    } else {
      assert.equal(res[0].tt, "hello");
      assert.equal(res[1].tt, "您好 (chinese)");
      assert.equal(res[2].tt, "नमस्ते (Hindi)");
      assert.equal(res[3].tt, "привет (Russian)");
      assert.equal(res[4].tt, "😎🌶🎤🥂");
      if (done) done();
    }
  };

  it("connection encoding", done => {
    const value = "©°";
    const encodings = ["KOI8R_GENERAL_CI", "UTF8_GENERAL_CI", "CP850_BIN", "CP1251_GENERAL_CI"];
    for (let i = 0; i < encodings.length; i++) {
      const conn = base.createConnection({ charset: encodings[i] });
      conn.query("select ? as t", value, (err, res) => assert.strictEqual(res[0].t, value));
      conn.execute("select ? as t", value, (err, res) => {
        assert.strictEqual(res[0].t, value);
        conn.end();
        if (i === encodings.length - 1) done();
      });
    }
  });

  it("table encoding not affecting query", done => {
    const str = "財團法人資訊工業策進會";
    shareConn.query("CREATE TEMPORARY TABLE utf8_encoding_table(t1 text) CHARSET utf8");
    shareConn.query("CREATE TEMPORARY TABLE big5_encoding_table(t2 text) CHARSET big5");
    shareConn.query("INSERT INTO utf8_encoding_table values (?)", [str]);
    shareConn.query("INSERT INTO big5_encoding_table values (?)", [str]);
    shareConn.query("SELECT * from utf8_encoding_table, big5_encoding_table", (err, res) => {
      if (err) done(err);
      assert.deepEqual(res, [{ t1: str, t2: str }]);
      done();
    });
  });

  it("string escape", done => {
    shareConn.query("CREATE TEMPORARY TABLE escape_utf8_string(tt text) CHARSET utf8");
    shareConn.query("INSERT INTO escape_utf8_string values (?)", ["a 'b\\\"c"]);
    shareConn.query("SELECT * from escape_utf8_string", (err, res) => {
      if (err) done(err);
      assert.deepEqual(res, [{ tt: "a 'b\\\"c" }]);
      done();
    });
  });
});
