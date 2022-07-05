const assert = require('assert');

module.exports.title = 'select 1000 rows';
module.exports.displaySql = 'select * from 1000 rows (int + string(32))';
module.exports.benchFct = function (conn, deferred) {
  conn
    .query('select * from 1000rows')
    .then((rows) => {
      // console.log(rows.length);
      // console.log(rows[0].length);
      deferred();
    })
    .catch((e) => {
      console.log(e);
      throw e;
    });
};

function generateString(length) {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

module.exports.initFct = function (conn) {
  conn.query('DROP TABLE IF EXISTS 1000rows');
  conn.query('CREATE TABLE 1000rows(id INT not null primary key auto_increment, val VARCHAR(32))');
  let inserts = [];
  for (let i = 0; i < 1000; i++) {
    conn.query('INSERT INTO 1000rows(val) VALUES (?) ', generateString(32));
  }
  return Promise.all(inserts).catch((e) => {
    console.log(e);
    throw e;
  });
};
