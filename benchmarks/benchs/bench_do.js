const assert = require('assert');

module.exports.title = 'do ? using callback';
module.exports.displaySql = 'do ?';
module.exports.promise = false;
module.exports.benchFct = function(conn, deferred) {
  conn.query(
    'do ?',
    ['' + Math.floor(Math.random() * 50000000)],
    (err, res) => {
      if (err) throw err;
      // let val = Array.isArray(rows) ? rows[0] : rows;
      // assert.equal(1, val.info ? val.info.affectedRows : val.affectedRows);
      deferred.resolve();
    }
  );
};
