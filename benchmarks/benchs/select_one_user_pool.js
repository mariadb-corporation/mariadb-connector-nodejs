const assert = require('assert');

module.exports.title = 'select one mysql.user using pool';
module.exports.displaySql = 'select * from mysql.user u LIMIT 1';
module.exports.pool = true;
module.exports.benchFct = function (pool, deferred) {
  pool
    .query('select * from mysql.user u LIMIT 1')
    .then((rows) => {
      deferred();
    })
    .catch((e) => {
      console.log(e);
      throw e;
    });
};
