const assert = require("assert");

module.exports.title = "select ?";
module.exports.displaySql = "select ?";

module.exports.benchFct = function(conn, deferred) {
  const rand = "" + Math.floor(Math.random() * 50000000);
  conn.query("select ? as t", [rand])
    .then(rows => {
      // assert.equal(rand, rows[0].t);
      deferred.resolve();
    })
    .catch(err => {
      throw err;
    });
};
