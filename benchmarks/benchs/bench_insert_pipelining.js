const assert = require("assert");

const basechars = "123456789abcdefghijklmnop\\Z";
const chars = basechars.split("");
chars.push("😎");
chars.push("🌶");
chars.push("🎤");
chars.push("🥂");

function randomString(length) {
  let result = "";
  for (let i = length; i > 0; --i) result += chars[Math.round(Math.random() * (chars.length - 1))];
  return result;
}

let sqlTable =
  "CREATE TABLE testn.perfTestText (id MEDIUMINT NOT NULL AUTO_INCREMENT,t0 text" +
  ", PRIMARY KEY (id)) ENGINE = BLACKHOLE COLLATE='utf8mb4_unicode_ci'";
sqlInsert = "INSERT INTO testn.perfTestText(t0) VALUES (?)";

module.exports.title = "100 * insert 100 characters";
module.exports.displaySql = "INSERT INTO testn.perfTestText VALUES (?) (into BLACKHOLE ENGINE)";
const iterations = 10;
module.exports.benchFct = function(conn, deferred) {
  const params = [randomString(100)];
  let ended = 0;
  for (let i = 0; i < iterations; i++) {
    conn.query(sqlInsert, params, function(err, rows) {
      if (err) {
        throw err;
      }
      assert.equal(rows.info ? rows.info.affectedRows : rows.affectedRows, 1);
      if (++ended === iterations) {
        deferred.resolve();
      }
    });
  }
};

module.exports.initFct = async function(conn) {
  try {
    await Promise.all([
      conn.query("DROP TABLE IF EXISTS testn.perfTestText"),
      conn.query("INSTALL SONAME 'ha_blackhole'"),
      conn.query(sqlTable)
    ]);
  } catch (err) {
    console.log(err);
  }
};

module.exports.onComplete = function(conn) {
  // conn.query('TRUNCATE TABLE testn.perfTestText');
};
