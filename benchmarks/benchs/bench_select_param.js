const assert = require('assert');

module.exports.title = 'select number';
module.exports.displaySql = 'select ?';
module.exports.promise = false;
module.exports.benchFct = function(conn, deferred) {
  conn.query('select ?', [100000000], (err, rows) => {
    if (err) {
      throw err;
    }

    // assert.equal(rand, rows[0].t);
    deferred.resolve();
  });
};
