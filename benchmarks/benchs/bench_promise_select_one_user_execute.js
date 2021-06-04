const assert = require('assert');

module.exports.title = 'select one mysql.user using execute promise';
module.exports.displaySql = 'select <all mysql.user fields> from mysql.user u LIMIT 1';
module.exports.promise = true;
module.exports.requireExecute = true;
module.exports.benchFct = function (conn, deferred) {
  conn
    .execute('select * from mysql.user u LIMIT 1')
    .then((rows) => {
      // assert.equal(50000000, rows[0]["t"]);
      deferred.resolve();
    })
    .catch((err) => {
      throw err;
    });
};
