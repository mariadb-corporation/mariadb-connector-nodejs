const assert = require('assert');

module.exports.title = 'select one mysql.user using execute';
module.exports.displaySql = 'select * from mysql.user LIMIT 1';
module.exports.requireExecute = true;
module.exports.benchFct = function (conn, deferred) {
  conn
    .execute('select * from mysql.user u LIMIT 1')
    .then((rows) => {
      // assert.equal(50000000, rows[0]["t"]);
      deferred();
    })
    .catch((err) => {
      throw err;
    });
};
