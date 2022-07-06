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

let sqlTable = 'CREATE TABLE perfTestTextPipe (id MEDIUMINT NOT NULL AUTO_INCREMENT,t0 text' + ', PRIMARY KEY (id))';
sqlInsert = 'INSERT INTO perfTestTextPipe(t0) VALUES (?)';

module.exports.title = '3 * insert 100 characters pipelining';
module.exports.displaySql = 'INSERT INTO perfTestTextPipe VALUES (?) (into BLACKHOLE ENGINE)';
module.exports.benchFct = async function (conn, deferred) {
  const params = [randomString(100)];
  let ended = 0;
  conn.query(sqlInsert, params);
  conn.query(sqlInsert, params);
  const rows = await conn.query(sqlInsert, params);
  // let val = Array.isArray(rows) ? rows[0] : rows;
  // assert.equal(1, val.info ? val.info.affectedRows : val.affectedRows);
  deferred();
};

module.exports.initFct = async function (conn) {
  try {
    await Promise.all([
      conn.query('DROP TABLE IF EXISTS perfTestTextPipe'),
      conn.query("INSTALL SONAME 'ha_blackhole'"),
      conn.query(sqlTable + " ENGINE = BLACKHOLE COLLATE='utf8mb4_unicode_ci'")
    ]);
  } catch (err) {
    await Promise.all([
      conn.query('DROP TABLE IF EXISTS perfTestTextPipe'),
      conn.query(sqlTable + " COLLATE='utf8mb4_unicode_ci'")
    ]);
  }
};

module.exports.onComplete = async function (conn) {
  await conn.query('TRUNCATE TABLE perfTestTextPipe');
};
