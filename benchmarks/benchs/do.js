const assert = require('assert');

module.exports.title = 'do <random number>';
module.exports.displaySql = 'do ?';
module.exports.benchFct = async function (conn, type, deferred) {
  const rows = await conn.query('do ?', [Math.floor(Math.random() * 50000000)]);
  deferred.resolve(rows);
};
