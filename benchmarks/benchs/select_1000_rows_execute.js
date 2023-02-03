module.exports.title = 'select 1000 rows of CHAR(32) - BINARY';
module.exports.displaySql = 'select * from 1000 rows (int + string(32))';
module.exports.requireExecute = true;
module.exports.benchFct = async function (conn, type, deferred) {
  const res = await conn.execute('select * from 1000rows');
  deferred.resolve(res);
};

module.exports.initFct = function (conn) {
  conn.query('DROP TABLE IF EXISTS 1000rows');
  conn.query('CREATE TABLE 1000rows(id INT SIGNED not null primary key auto_increment, val VARCHAR(32))');
  let inserts = [];
  for (let i = 0; i < 1000; i++) {
    inserts.push(conn.query('INSERT INTO 1000rows(val) VALUES (?) ', ['abcdefghijabcdefghijabcdefghijaa']));
  }
  return Promise.all(inserts).catch((e) => {
    console.log(e);
    throw e;
  });
};
