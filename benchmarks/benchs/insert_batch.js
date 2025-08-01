//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

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
const sqlInsert = 'INSERT INTO perfTestTextBatch(t0) VALUES (?)';

export const title = "100 * insert CHAR(100) using batch (for mariadb) or loop for other driver (batch doesn't exist)";
export const displaySql = 'INSERT INTO perfTestTextBatch VALUES (?)';
const iterations = 100;
export const benchFct = async function (conn, type, deferred) {
  const params = [randomString(100)];
  if (type !== 'mariadb') {
    //other drivers don't have bulk method
    const queries = [];
    for (let i = 0; i < iterations; i++) {
      queries.push(conn.query(sqlInsert, params));
    }
    const res = await Promise.all(queries);
    deferred.resolve(res);
  } else {
    //use batch capability
    const totalParams = new Array(iterations);
    for (let i = 0; i < iterations; i++) {
      totalParams[i] = params;
    }
    const rows = await conn.batch(sqlInsert, totalParams);
    deferred.resolve(rows);
  }
};

export const initFct = async function (conn) {
  const sqlTable =
    'CREATE TABLE perfTestTextBatch (' +
    'id MEDIUMINT NOT NULL AUTO_INCREMENT,t0 text, PRIMARY KEY (id)' +
    ") COLLATE='utf8mb4_unicode_ci'";
  try {
    await Promise.all([
      conn.query('DROP TABLE IF EXISTS perfTestTextBatch'),
      conn.query("INSTALL SONAME 'ha_blackhole'"),
      conn.query(sqlTable + ' ENGINE = BLACKHOLE')
    ]);
  } catch (err) {
    await Promise.all([conn.query('DROP TABLE IF EXISTS perfTestTextBatch'), conn.query(sqlTable)]);
  }
};
export const onComplete = async function (conn) {
  await conn.query('TRUNCATE TABLE perfTestTextBatch');
};
