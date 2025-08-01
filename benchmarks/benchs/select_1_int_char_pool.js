export const title = 'select 1 int + char(32) with pool';
export const displaySql = "select 1, 'abcdefghijabcdefghijabcdefghijaa'";
export const pool = true;
export const benchFct = async function (pool, type, deferred) {
  const rows = await pool.query("select 1, 'abcdefghijabcdefghijabcdefghijaa'");
  deferred.resolve(rows);
};
