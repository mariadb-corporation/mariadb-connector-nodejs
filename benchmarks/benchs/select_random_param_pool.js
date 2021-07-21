const assert = require('assert');

module.exports.title = 'select random number using pool';
module.exports.displaySql = 'select ?';
module.exports.pool = true;
module.exports.benchFct = function (pool, deferred) {
  const rand = Math.floor(Math.random() * 1000000);
  pool
    .query('select ? as t', [rand])
    .then((rows) => {
      // assert.equal(rand, rows[0].t);
      deferred();
    })
    .catch((err) => {
      throw err;
    });
};
