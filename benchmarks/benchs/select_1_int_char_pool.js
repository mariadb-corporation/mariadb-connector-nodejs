module.exports.title = 'select 1 int + char with pool';
module.exports.displaySql = "select 1, 'abcdefghijabcdefghijabcdefghijaa'";
module.exports.pool = true;
module.exports.benchFct = async function (pool, type, deferred) {
  const rows = await pool.query("select 1, 'abcdefghijabcdefghijabcdefghijaa'");
  deferred.resolve(rows);
};
