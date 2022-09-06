module.exports.title = 'select 1 int + char';
module.exports.displaySql = "select 1, 'abcdefghijabcdefghijabcdefghijaa'";
module.exports.benchFct = async function (conn, type, deferred) {
  const randVal = Math.floor(Math.random() * 1000000);
  const rows = await conn.query("select ?, 'abcdefghijabcdefghijabcdefghijaa'", randVal);
  deferred.resolve(rows);
};
