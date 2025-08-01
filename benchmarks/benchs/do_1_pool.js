export const title = 'do <random number> with pool';
export const displaySql = 'do ? with pool';
export const pool = true;
export const benchFct = async function (pool, type, deferred) {
  const rows = await pool.query('do ?', [Math.floor(Math.random() * 50000000)]);
  deferred.resolve(rows);
};
