const assert = require('assert');

module.exports.title = 'select now()';
module.exports.displaySql = 'select now()';
module.exports.benchFct = async function (conn, type, deferred) {
  const rows = await conn.query('select now()');
  deferred.resolve(rows);
};
