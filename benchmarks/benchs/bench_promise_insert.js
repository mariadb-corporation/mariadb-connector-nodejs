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

let sqlTable = "CREATE TABLE testn.perfTestText (id MEDIUMINT NOT NULL AUTO_INCREMENT,t0 text";
let sqlParam = "";
let sqlCol = "t0";
for (let i = 1; i < 10; i++) {
  sqlParam += ",?";
  sqlCol += ",t" + i;
  sqlTable += ",t" + i + " text";
}
sqlInsert = "INSERT INTO testn.perfTestText(" + sqlCol + ") VALUES (?" + sqlParam + ")";
sqlTable += ", PRIMARY KEY (id))";

module.exports.title = "insert 10 parameters of 100 characters using promise";
module.exports.displaySql =
  "INSERT INTO testn.perfTestText VALUES (<100 ?>) (into BLACKHOLE ENGINE)";
module.exports.promise = true;
module.exports.benchFct = function(conn, deferred) {
  const params = [];
  for (let i = 0; i < 10; i++) {
    params.push(randomString(100));
  }

  conn
    .query(sqlInsert, params)
    .then(rows => {
      // let val = Array.isArray(rows) ? rows[0] : rows;
      // assert.equal(1, val.info ? val.info.affectedRows : val.affectedRows);
      deferred.resolve();
    })
    .catch(err => {
      throw err;
    });
};

module.exports.initFct = function(conn) {
  return Promise.all([
    conn.query("DROP TABLE IF EXISTS testn.perfTestText"),
    conn.query("INSTALL SONAME 'ha_blackhole'"),
    conn.query(sqlTable + " ENGINE = BLACKHOLE COLLATE='utf8mb4_unicode_ci'")
  ])
    .catch(err => {
      return Promise.all([
        conn.query("DROP TABLE IF EXISTS testn.perfTestText"),
        conn.query(sqlTable + " COLLATE='utf8mb4_unicode_ci'")
      ])
    })
    .catch(e => {
      console.log(e);
      throw e;
    });

};

module.exports.onComplete = function(conn) {
  conn.query("TRUNCATE TABLE testn.perfTestText")
    .catch(e => {
      console.log(e);
      throw e;
    });
};
