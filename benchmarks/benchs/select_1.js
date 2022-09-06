const assert = require('assert');

module.exports.title = 'select 1';
module.exports.displaySql = 'select 1';
module.exports.benchFct = async function (conn, type, deferred) {
  const rows = await conn.query('select 1');
  deferred.resolve(rows);
};
