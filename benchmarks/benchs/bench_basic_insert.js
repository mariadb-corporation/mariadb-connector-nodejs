const assert = require('assert');

module.exports.title = 'simple insert';
module.exports.displaySql = 'INSERT INTO testn.perfTest(test) VALUES (?) (into BLACKHOLE ENGINE) ';

module.exports.benchFct = function(conn, deferred) {
  conn.query(
    'INSERT INTO testn.perfTest(test) VALUES (?)',
    [Math.floor(Math.random() * 50000000)],
    function(err, rows) {
      assert.ifError(err);
      assert.equal(1, rows.info ? rows.info.affectedRows : rows.affectedRows);
      deferred.resolve();
    }
  );
};

module.exports.initFct = async function(conn) {
  try {
    await Promise.all([
      conn.query('DROP TABLE IF EXISTS testn.perfTest'),
      conn.query("INSTALL SONAME 'ha_blackhole'"),
      conn.query(
        'CREATE TABLE testn.perfTest ( id int(11) NOT NULL AUTO_INCREMENT, test int, PRIMARY KEY (id) ) ENGINE = BLACKHOLE'
      )
    ]);
  } catch (err) {
    console.log(err);
  }
};

module.exports.onComplete = function(conn) {
  conn.query('TRUNCATE TABLE testn.perfTest');
};
