const assert = require('assert');

module.exports.title = 'select 20 * int, 20 * varchar(32) using execute';
module.exports.displaySql = 'select * FROM simpleTableExecute where id0=?';
module.exports.requireExecute = true;
module.exports.benchFct = async function (conn, type, deferred) {
  const rows = await conn.execute('select * from simpleTable2 where id0=?', [0]);
  deferred.resolve(rows);
};

module.exports.initFct = async function (conn) {
  await conn.query('DROP TABLE IF EXISTS simpleTable2');
  let createSql = 'CREATE TABLE simpleTable2(id0 INT not null primary key , val0 VARCHAR(32)';
  let insertSql =
    'INSERT INTO simpleTable2 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
  for (let i = 1; i < 20; i++) {
    createSql = createSql + ',id' + i + ' INT, val' + i + ' VARCHAR(32)';
  }
  createSql = createSql + ')';
  await conn.query(createSql);
  const str = '12345678901234567890123456789012';
  await conn.query(insertSql, [
    0,
    str,
    1,
    str,
    2,
    str,
    3,
    str,
    4,
    str,
    5,
    str,
    6,
    str,
    7,
    str,
    8,
    str,
    9,
    str,
    10,
    str,
    11,
    str,
    12,
    str,
    13,
    str,
    14,
    str,
    15,
    str,
    16,
    str,
    17,
    str,
    18,
    str,
    19,
    str
  ]);
};
