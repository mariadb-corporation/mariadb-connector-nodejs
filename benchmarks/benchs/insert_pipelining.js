import { randomStrings } from '../random-strings.js';

const nextString = randomStrings(1000, 100);

let sqlTable = 'CREATE TABLE perfTestTextPipe (id MEDIUMINT NOT NULL AUTO_INCREMENT,t0 text' + ', PRIMARY KEY (id))';
const sqlInsert = 'INSERT INTO perfTestTextPipe(t0) VALUES (?)';

export const title = '3 * insert 100 characters pipelining';
export const displaySql = 'INSERT INTO perfTestTextPipe VALUES (?) (into BLACKHOLE ENGINE)';
export const benchFct = async function (conn, type) {
  const params = [nextString()];
  conn.query(sqlInsert, params);
  conn.query(sqlInsert, params);
  const rows = await conn.query(sqlInsert, params);
  // let val = Array.isArray(rows) ? rows[0] : rows;
  // assert.equal(1, val.info ? val.info.affectedRows : val.affectedRows);
  return rows;
};
export const initFct = async function (conn) {
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
export const end = async function (conn) {
  await conn.query('TRUNCATE TABLE perfTestTextPipe');
};
