const assert = require('assert');

module.exports.title = 'select multiple collation using promise';
module.exports.displaySql = 'select * from information_schema.COLLATIONS';
module.exports.promise = true;
module.exports.benchFct = function (conn, deferred) {
  conn
    .query('select * from information_schema.COLLATIONS')
    .then((rows) => {
      // assert.ok(rows.length > 230);
      // assert.equal("big5_chinese_ci", rows[0].COLLATION_NAME);

      deferred.resolve();
    })
    .catch((err) => {
      throw err;
    });
};
