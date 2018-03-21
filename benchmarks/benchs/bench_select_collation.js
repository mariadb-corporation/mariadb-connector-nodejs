const assert = require("assert");

module.exports.title = "select multiple collation";
module.exports.displaySql = "select * from information_schema.COLLATIONS";

module.exports.benchFct = function(conn, deferred) {
  conn.query("select * from information_schema.COLLATIONS", function(err, rows) {
    assert.ifError(err);
    assert.ok(rows.length > 256);
    assert.equal("big5_chinese_ci", rows[0].COLLATION_NAME);
    deferred.resolve();
  });
};
