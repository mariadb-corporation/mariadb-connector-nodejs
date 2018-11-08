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
  "CREATE TABLE testn.perfTestTextPipe (id MEDIUMINT NOT NULL AUTO_INCREMENT,t0 text" +
  ", PRIMARY KEY (id))";
sqlInsert = "INSERT INTO testn.perfTestTextPipe(t0) VALUES (?)";

module.exports.title =
  "1000 * insert 100 characters using promise and batch method (for mariadb only, since doesn't exist for others)";
module.exports.displaySql = "INSERT INTO testn.perfTestTextPipe VALUES (?) (into BLACKHOLE ENGINE)";
const iterations = 1000;
module.exports.promise = true;
module.exports.benchFct = function(conn, deferred, connType) {
  const params = [randomString(100)];
  // console.log(connType.desc);
  if (!connType.desc.includes("mariadb")) {
    //other driver doesn't have bulk method
    let ended = 0;
    for (let i = 0; i < iterations; i++) {
      conn
        .query(sqlInsert, params)
        .then(rows => {
          // let val = Array.isArray(rows) ? rows[0] : rows;
          // assert.equal(1, val.info ? val.info.affectedRows : val.affectedRows);
          if (++ended === iterations) {
            deferred.resolve();
          }
        })
        .catch(err => {
          throw err;
        });
    }
  } else {
    //use batch capability
    const totalParams = new Array(iterations);
    for (let i = 0; i < iterations; i++) {
      totalParams[i] = params;
    }
    conn
      .batch(sqlInsert, totalParams)
      .then(rows => {
        deferred.resolve();
      })
      .catch(err => {
        throw err;
      });
  }
};

module.exports.initFct = function(conn) {
  return Promise.all([
    conn.query("DROP TABLE IF EXISTS testn.perfTestTextPipe"),
    conn.query("INSTALL SONAME 'ha_blackhole'"),
    conn.query(sqlTable + " ENGINE = BLACKHOLE COLLATE='utf8mb4_unicode_ci'")
  ])
    .catch(err => {
      return Promise.all([
        conn.query("DROP TABLE IF EXISTS testn.perfTestTextPipe"),
        conn.query(sqlTable + " COLLATE='utf8mb4_unicode_ci'")
      ]);
    })
    .catch(e => {
      console.log(e);
      throw e;
    });
};

module.exports.onComplete = function(conn) {
  conn.query("TRUNCATE TABLE testn.perfTestTextPipe").catch(e => {
    console.log(e);
    throw e;
  });
};
