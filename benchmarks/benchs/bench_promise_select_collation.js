const assert = require('assert');

module.exports.title = 'select multiple collation using promise';
module.exports.displaySql = 'select * from information_schema.COLLATIONS';
module.exports.promise = true;
module.exports.benchFct = async function (conn, deferred) {
  const rows = await conn.query('select * from information_schema.COLLATIONS');

  // console.log(rows.length);
  // console.log(rows[0].length);
  deferred.resolve();
};
