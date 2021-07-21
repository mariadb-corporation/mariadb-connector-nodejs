const assert = require('assert');

module.exports.title = 'select one mysql.user using promise and pool';
module.exports.displaySql = 'select <all mysql.user fields> from mysql.user u LIMIT 1';
module.exports.promise = true;
module.exports.pool = true;
module.exports.benchFct = async function (pool, deferred) {
  const rows = await pool.query('select * from mysql.user u LIMIT 1');
  deferred.resolve();
};
