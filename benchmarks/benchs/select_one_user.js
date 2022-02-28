const assert = require('assert');

module.exports.title = 'select one mysql.user';
module.exports.displaySql = 'select * from mysql.user LIMIT 1';
module.exports.benchFct = function (conn, deferred) {
  conn
    .query('select * from mysql.user u LIMIT 1')
    .then((rows) => {
      deferred();
    })
    .catch((e) => {
      console.log(e);
      throw e;
    });
};
