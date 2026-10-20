import { randomStrings } from '../random-strings.js';

const nextString = randomStrings(1000, 100);

let sqlTable = 'CREATE TABLE perfTestText (id MEDIUMINT NOT NULL AUTO_INCREMENT,t0 varchar(100)';
let sqlParam = '';
let sqlCol = 't0';
for (let i = 1; i < 10; i++) {
  sqlParam += ',?';
  sqlCol += ',t' + i;
  sqlTable += ',t' + i + ' varchar(100)';
}
const sqlInsert = 'INSERT INTO perfTestText(' + sqlCol + ') VALUES (?' + sqlParam + ')';
sqlTable += ', PRIMARY KEY (id))';

export const title = 'insert 10 VARCHAR(100)';
export const displaySql = 'INSERT INTO perfTestText VALUES (?, ?, ?, ?, ?,?, ?, ?, ?, ?)';
export const benchFct = async function (conn, type) {
  const params = [];
  for (let i = 0; i < 10; i++) {
    params.push(nextString());
  }

  const rows = await conn.query(sqlInsert, params);
  return rows;
};
export const initFct = async function (conn) {
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
export const end = async function (conn) {
  await conn.query('TRUNCATE TABLE perfTestText');
};
