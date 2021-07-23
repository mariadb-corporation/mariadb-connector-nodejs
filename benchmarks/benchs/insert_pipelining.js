const assert = require('assert');

const basechars = '123456789abcdefghijklmnop\\Z';
const chars = basechars.split('');
chars.push('😎');
chars.push('🌶');
chars.push('🎤');
chars.push('🥂');

function randomString(length) {
  let result = '';
  for (let i = length; i > 0; --i) result += chars[Math.round(Math.random() * (chars.length - 1))];
  return result;
}

let sqlTable =
  'CREATE TABLE testn.perfTestTextPipe (id MEDIUMINT NOT NULL AUTO_INCREMENT,t0 text' +
  ', PRIMARY KEY (id))';
sqlInsert = 'INSERT INTO testn.perfTestTextPipe(t0) VALUES (?)';

module.exports.title = 'insert 100 characters pipelining';
module.exports.displaySql = 'INSERT INTO testn.perfTestTextPipe VALUES (?) (into BLACKHOLE ENGINE)';
module.exports.benchFct = async function (conn, deferred) {
  const params = [randomString(100)];
  let ended = 0;
  const rows = await conn.query(sqlInsert, params);
  // let val = Array.isArray(rows) ? rows[0] : rows;
  // assert.equal(1, val.info ? val.info.affectedRows : val.affectedRows);
  deferred();
};

module.exports.initFct = function (conn) {
  return Promise.all([
    conn.query('DROP TABLE IF EXISTS testn.perfTestTextPipe'),
    conn.query("INSTALL SONAME 'ha_blackhole'"),
    conn.query(sqlTable + " ENGINE = BLACKHOLE COLLATE='utf8mb4_unicode_ci'")
  ])
    .catch((err) => {
      return Promise.all([
        conn.query('DROP TABLE IF EXISTS testn.perfTestTextPipe'),
        conn.query(sqlTable + " COLLATE='utf8mb4_unicode_ci'")
      ]);
    })
    .catch((e) => {
      console.log(e);
      throw e;
    });
};

module.exports.onComplete = function (conn) {
  conn.query('TRUNCATE TABLE testn.perfTestTextPipe').catch((e) => {
    console.log(e);
    throw e;
  });
};
