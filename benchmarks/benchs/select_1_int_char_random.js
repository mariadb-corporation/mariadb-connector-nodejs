export const title = 'select 1 random int + char(32)';
export const displaySql = "select 1, 'abcdefghijabcdefghijabcdefghijaa'";
export const benchFct = async function (conn, type, deferred) {
  const randVal = Math.floor(Math.random() * 1000000);
  await conn.query('SELECT ?, "abcdefghijabcdefghijabcdefghijaa"', randVal);
  deferred.resolve();
};
