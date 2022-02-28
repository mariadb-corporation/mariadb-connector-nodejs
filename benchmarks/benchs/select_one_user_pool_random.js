const assert = require('assert');

module.exports.title = 'select one mysql.user and a random number [no caching client side]';
module.exports.displaySql = 'select u.*, <random field> from mysql.user u LIMIT 1';
module.exports.pool = true;
module.exports.benchFct = function (pool, deferred) {
  const rand = Math.floor(Math.random() * 50000000);
  pool
    .query('select u.*, ' + rand + ' from mysql.user u LIMIT 1')
    .then((rows) => {
      // assert.equal(1, rows[0]["t" + rand]);
      deferred();
    })
    .catch((err) => {
      throw err;
    });
};
