const assert = require('assert');

module.exports.title = 'select random number';
module.exports.displaySql = 'select ?';
module.exports.promise = false;
module.exports.benchFct = function (conn, deferred) {
  const rand = '' + Math.floor(Math.random() * 50000000);
  conn.query('select ? as t', [rand], (err, rows) => {
    if (err) {
      throw err;
    }

    // assert.equal(rand, rows[0].t);
    deferred.resolve();
  });
};
