import assert from 'assert';

export const title = 'select now()';
export const displaySql = 'SELECT NOW()';
export const benchFct = async function (conn, type, deferred) {
  await conn.query('SELECT NOW()');
  deferred.resolve();
};
