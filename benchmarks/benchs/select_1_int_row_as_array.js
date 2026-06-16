export const title = 'select 1 int with rowsAsArray';
export const displaySql = "{sql:'SELECT 1', rowsAsArray: true}";
export const benchFct = async function (conn, type) {
  await conn.query({sql:'SELECT 1', rowsAsArray: true});
  return;
};
1