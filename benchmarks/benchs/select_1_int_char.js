module.exports.title = 'select 1 int + char(32)';
module.exports.displaySql = "select 1, 'abcdefghijabcdefghijabcdefghijaa'";
module.exports.benchFct = async function (conn, type, deferred) {
  const rows = await conn.query("select 1, 'abcdefghijabcdefghijabcdefghijaa'");
  deferred.resolve(rows);
};
