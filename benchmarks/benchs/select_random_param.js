const assert = require('assert');

module.exports.title = 'select random number';
module.exports.displaySql = 'select ?';
module.exports.benchFct = async function (conn, type, deferred) {
  const rand = '' + Math.floor(Math.random() * 1000000);
  const rows = await conn.query('select ? as t', [rand]);
  deferred.resolve(rows);
};
