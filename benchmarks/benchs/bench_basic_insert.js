const assert = require("assert");

module.exports.title = "simple insert";
module.exports.displaySql = "INSERT INTO testn.perfTest(test) VALUES (?) (into BLACKHOLE ENGINE) ";

module.exports.benchFct = function(conn, deferred) {
  conn
    .query("INSERT INTO testn.perfTest(test) VALUES (?)", [
      "" + Math.floor(Math.random() * 50000000)
    ])
    .then(rows => {
      // let val = Array.isArray(rows) ? rows[0] : rows;
      // assert.equal(1, val.info ? val.info.affectedRows : val.affectedRows);
      deferred.resolve();
    })
    .catch(err => {
      throw err;
    });
};

module.exports.initFct = async function(conn) {
  try {
    await conn.query("DROP TABLE IF EXISTS testn.perfTest");
    await conn.query("INSTALL SONAME 'ha_blackhole'");
    await conn.query(
      "CREATE TABLE testn.perfTest ( id int(11) NOT NULL AUTO_INCREMENT, test varchar(10), PRIMARY KEY (id) ) " +
        "ENGINE = BLACKHOLE COLLATE='utf8mb4_unicode_ci'"
    );
  } catch (e) {
    try {
      await conn.query("DROP TABLE IF EXISTS testn.perfTest");
      await conn.query(
        "CREATE TABLE testn.perfTest ( id int(11) NOT NULL AUTO_INCREMENT, test varchar(10), PRIMARY KEY (id) ) " +
        "COLLATE='utf8mb4_unicode_ci'"
      );
    } catch (e) {
      console.log(e);
      throw e;
    }
  }
};

module.exports.onComplete = async function(conn) {
  try {
    await conn.query("TRUNCATE TABLE testn.perfTest");
  } catch (e) {
    //eat
  }
};
