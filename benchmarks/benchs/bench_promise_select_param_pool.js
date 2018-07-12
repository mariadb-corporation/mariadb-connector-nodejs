const assert = require("assert");

module.exports.title = "select number using promise and POOL";
module.exports.displaySql = "select 10000000";
module.exports.promise = true;
module.exports.pool = true;
module.exports.benchFct = function(pool, deferred) {
  pool
    .query("select ?", [1])
    .then(rows => {
      // assert.equal(rand, rows[0].t);
      deferred.resolve();
    })
    .catch(err => {
      throw err;
    });
};
