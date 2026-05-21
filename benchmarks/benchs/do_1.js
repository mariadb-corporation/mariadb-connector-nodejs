export const title = 'do 1';
export const displaySql = 'DO 1';
export const benchFct = async function (conn, type) {
  await conn.query('DO 1');
  return;
};
