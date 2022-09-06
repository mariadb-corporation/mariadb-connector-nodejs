const assert = require('assert');

module.exports.title = 'do 1';
module.exports.displaySql = 'do 1';
module.exports.benchFct = async function (conn, type, deferred) {
  const rows = await conn.query('do 1');
  deferred.resolve(rows);
};
