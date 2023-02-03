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

let sqlTable = 'CREATE TABLE perfTestText (id MEDIUMINT NOT NULL AUTO_INCREMENT,t0 text';
let sqlParam = '';
let sqlCol = 't0';
for (let i = 1; i < 10; i++) {
  sqlParam += ',?';
  sqlCol += ',t' + i;
  sqlTable += ',t' + i + ' text';
}
sqlInsert = 'INSERT INTO perfTestText(' + sqlCol + ') VALUES (?' + sqlParam + ')';
sqlTable += ', PRIMARY KEY (id))';

module.exports.title = 'insert 10 VARCHAR(100)';
module.exports.displaySql = 'INSERT INTO perfTestText VALUES (?, ?, ?, ?, ?,?, ?, ?, ?, ?)';
module.exports.benchFct = async function (conn, type, deferred) {
  const params = [];
  for (let i = 0; i < 10; i++) {
    params.push(randomString(100));
  }

  const rows = await conn.query(sqlInsert, params);
  deferred.resolve(rows);
};

module.exports.initFct = async function (conn) {
  try {
    await Promise.all([
      conn.query('DROP TABLE IF EXISTS perfTestText'),
      conn.query("INSTALL SONAME 'ha_blackhole'"),
      conn.query(sqlTable + " ENGINE = BLACKHOLE COLLATE='utf8mb4_unicode_ci'")
    ]);
  } catch (err) {
    await Promise.all([
      conn.query('DROP TABLE IF EXISTS perfTestText'),
      conn.query(sqlTable + " COLLATE='utf8mb4_unicode_ci'")
    ]);
  }
};

module.exports.onComplete = async function (conn) {
  await conn.query('TRUNCATE TABLE perfTestText');
};
