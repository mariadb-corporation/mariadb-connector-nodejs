export const title = 'select 1 int + char(32)';
export const displaySql = "select 1, 'abcdefghijabcdefghijabcdefghijaa'";
export const benchFct = async function (conn, type, deferred) {
  await conn.query('SELECT 1, "abcdefghijabcdefghijabcdefghijaa"');
  deferred.resolve();
};
