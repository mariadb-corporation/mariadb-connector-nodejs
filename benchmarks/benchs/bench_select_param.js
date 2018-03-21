const assert = require("assert");

module.exports.title = "select ?";
module.exports.displaySql = "select ?";

module.exports.benchFct = function(conn, deferred) {
  const rand = Math.floor(Math.random() * 50000000);
  conn.query("select ? as t", [rand], function(err, rows) {
    assert.ifError(err);
    assert.equal(rand, rows[0].t);
    deferred.resolve();
  });
};
