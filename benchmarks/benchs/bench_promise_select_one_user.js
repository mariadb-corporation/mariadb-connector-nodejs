const assert = require('assert');

module.exports.title = 'select one mysql.user using promise';
module.exports.displaySql = 'select <all mysql.user fields> from mysql.user u LIMIT 1';
module.exports.promise = true;
module.exports.benchFct = async function (conn, deferred) {
  const rows = await conn.query('select * from mysql.user u LIMIT 1');
  deferred.resolve();
};
