const assert = require('assert');

module.exports.title = 'select collations';
module.exports.displaySql = 'select * from information_schema.COLLATIONS';
module.exports.benchFct = function (conn, deferred) {
  conn
    .query('select * from information_schema.COLLATIONS')
    .then((rows) => {
      // console.log(rows.length);
      // console.log(rows[0].length);
      deferred();
    })
    .catch((e) => {
      console.log(e);
      throw e;
    });
};
