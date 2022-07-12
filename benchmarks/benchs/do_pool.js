const assert = require('assert');

module.exports.title = 'do <random number> with pool';
module.exports.displaySql = 'do ? with pool';
module.exports.pool = true;
module.exports.benchFct = async function (pool, type, deferred) {
  const rows = await pool.query('do ?', [Math.floor(Math.random() * 50000000)]);
  deferred.resolve(rows);
};
