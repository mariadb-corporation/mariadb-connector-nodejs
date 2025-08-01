//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab
import {
  Connection,
  FieldInfo,
  ConnectionConfig,
  PoolConfig,
  UpsertResult,
  SqlError,
  importFile,
  Prepare,
  defaultOptions,
  PoolConnection,
  Pool,
  version,
  createPoolCluster,
  createPool,
  createConnection,
  StreamCallback
} from './callback.d.ts';

import { createReadStream } from 'node:fs';

import { baseConfig } from '../test/conf.js';

function importSqlFile(cb: (err: SqlError | null) => void) {
  importFile(
    {
      host: baseConfig.host,
      user: baseConfig.user,
      password: baseConfig.password,
      file: '/somefile',
      database: baseConfig.database
    },
    cb
  );
}

// Use 'any' for the runtime connection object, as the runtime type may not match the TS type exactly
function createConn(option?: ConnectionConfig): Connection {
  return createConnection({
    host: baseConfig.host,
    user: option && option.user ? option.user : baseConfig.user,
    rowsAsArray: option && option.rowsAsArray ? option.rowsAsArray : false,
    metaAsArray: option && option.metaAsArray ? option.metaAsArray : false,
    password: baseConfig.password,
    database: baseConfig.database,
    logger: {
      network: (msg: string) => console.log(msg),
      query: (msg: string) => console.log(msg),
      error: (err: Error) => console.log(err)
    },
    stream: (callback: typeof StreamCallback) => {
      console.log('test');
      callback(undefined, undefined);
    },
    infileStreamFactory: (filepath: string) => createReadStream(filepath),
    metaEnumerable: true
  });
}

function createPoolConfig(options?: PoolConfig): PoolConfig {
  return Object.assign(
    {
      host: baseConfig.host,
      user: baseConfig.user,
      database: baseConfig.database,
      password: baseConfig.password,
      leakDetectionTimeout: 100
    },
    options
  );
}

function createPoolConfigWithSSl(options?: PoolConfig): PoolConfig {
  Object.assign({ ssl: { ca: 'fff' } }, options);
  return Object.assign(
    {
      host: baseConfig.host,
      user: baseConfig.user,
      database: baseConfig.database,
      password: baseConfig.password,
      ssl: false
    },
    options
  );
}

// Pool type is not used at runtime, so we can use 'any' for now for pools
function newPool(options?: PoolConfig | string): Pool {
  if (typeof options === 'string') {
    return createPool(options as string);
  }
  createPool(createPoolConfig(options));
  return createPool(createPoolConfigWithSSl(options));
}

function testMisc(next: (err?: Error) => void) {
  const defOptions = defaultOptions();
  const defaultOptionsWithTz = defaultOptions({
    timezone: '+00:00',
    debugLen: 1024,
    logParam: true,
    queryTimeout: 2000
  });
  console.log(defOptions);
  console.log(defaultOptionsWithTz);
  const connection = createConn({});
  connection.query('DROP TABLE IF EXISTS myTable', () => {});
  connection.query('CREATE TABLE myTable(id int)', () => {});
  connection.query('INSERT INTO myTable VALUE (1)', (err: SqlError | null, rows?: UpsertResult) => {
    if (err) return next(err);
    if (rows === undefined) return next(new Error('rows is undefined'));
    console.log(rows.insertId === 1);
    console.log(rows.affectedRows === 1);

    connection.query('SELECT 1 + 1 AS solution', (err: SqlError | null, rows?: any[]) => {
      if (err) return next(err);
      if (rows === undefined) return next(new Error('rows is undefined'));
      console.log(rows[0].solution === 2);
      connection.query('SELECT ? as t', 1, (err: SqlError | null, rows?: any[]) => {
        if (err) return next(err);
        if (rows === undefined) return next(new Error('rows is undefined'));
        console.log(rows[0].t === 1);
        connection.query('SELECT ? as t', [1], (err: SqlError | null, rows?: any[]) => {
          if (err) return next(err);
          if (rows === undefined) return next(new Error('rows is undefined'));
          console.log(rows[0].t === 1);
          connection.importFile({ file: '/path' }, () => {
            connection.importFile({ file: '/path', database: baseConfig.database }, () => {
              connection.query(
                {
                  namedPlaceholders: true,
                  sql: 'SELECT :val as t',
                  infileStreamFactory: (filepath: string) => createReadStream(filepath)
                },
                { val: 2 },
                (err: SqlError | null, rows?: any[]) => {
                  if (err) return next(err);
                  if (rows === undefined) return next(new Error('rows is undefined'));
                  console.log(rows[0].t === 2);
                  connection.prepare('INSERT INTO myTable VALUES (?)', (err: SqlError | null, prepare?: Prepare) => {
                    if (err) return next(err);
                    if (prepare === undefined) return next(new Error('prepare is undefined'));
                    console.log(prepare.id);
                    prepare.execute([1], (err: SqlError | null, insRes?: any) => {
                      if (err) return next(err);
                      console.log(insRes.insertId === 2);
                      console.log(insRes.affectedRows === 2);
                      let currRow = 0;
                      const stream = prepare.executeStream([1]);
                      stream.on('data', (row: unknown[]) => {
                        console.log(row);
                        currRow++;
                      });
                      console.log(currRow);
                      stream.on('end', () => {
                        prepare.close();
                        connection.execute(
                          'INSERT INTO myTable VALUE (1)',
                          (err: SqlError | null, rows?: UpsertResult) => {
                            if (err) return next(err);
                            if (rows === undefined) return next(new Error('rows is undefined'));
                            console.log(rows.insertId === 1);
                            console.log(rows.affectedRows === 1);
                            connection.execute('SELECT 1 + 1 AS solution', (err: SqlError | null, rows?: any[]) => {
                              if (err) return next(err);
                              if (rows === undefined) return next(new Error('rows is undefined'));
                              console.log(rows[0].solution === 2);
                              connection.execute('SELECT ? as t', 1, (err: SqlError | null, rows?: any[]) => {
                                if (err) return next(err);
                                if (rows === undefined) return next(new Error('rows is undefined'));
                                console.log(rows[0].t === 1);
                                connection.execute('SELECT ? as t', [1], (err: SqlError | null, rows?: any[]) => {
                                  if (err) return next(err);
                                  if (rows === undefined) return next(new Error('rows is undefined'));
                                  console.log(rows[0].t === 1);
                                  connection.execute(
                                    { sql: 'SELECT ? as t', timeout: 1000 },
                                    [1],
                                    (err: SqlError | null, rows?: any) => {
                                      if (err) return next(err);
                                      console.log(rows[0].t === 1);
                                      connection.execute(
                                        {
                                          namedPlaceholders: true,
                                          sql: 'SELECT :val as t'
                                        },
                                        { val: 2 },
                                        (err: SqlError | null, rows?: any) => {
                                          if (err) return next(err);
                                          console.log(rows[0].t === 2);
                                          // Error test
                                          connection.query({ sql: 'SELECT 1', nestTables: '_' }, () => {
                                            connection.query('Wrong SQL', (err: SqlError | null, rows?: any) => {
                                              if (!err) return next(new Error('must have throw error!' + rows));
                                              console.log(err.message != null);
                                              console.log(err.errno === 12);
                                              console.log(err.sqlState === '');
                                              console.log(err.fatal === true);
                                              let metaReceived = false;
                                              let currRow = 0;
                                              connection
                                                .queryStream('SELECT * from mysql.user')
                                                .on('error', (err: Error) => next(err))
                                                .on('fields', (meta: FieldInfo[]) => {
                                                  console.log(meta);
                                                  metaReceived = true;
                                                })
                                                .on('data', (row: unknown[]) => {
                                                  console.log(row.length > 1);
                                                  currRow++;
                                                })
                                                .on('end', () => {
                                                  console.log(currRow + ' ' + metaReceived);
                                                  next();
                                                });
                                            });
                                          });
                                        }
                                      );
                                    }
                                  );
                                });
                              });
                            });
                          }
                        );
                      });
                    });
                  });
                }
              );
            });
          });
        });
      });
    });
  });
}

function testChangeUser(next: (err?: Error) => void) {
  const connection = createConn({});
  connection.changeUser({ user: 'this is a bogus user name' }, (err: SqlError | null) => {
    if (err) {
      console.log('Correctly threw an error when changing user');
      return next();
    }
    next(new Error('Expected error when changing user'));
  });
}

function testPool(next: (err?: Error) => void) {
  const poolConf = Object.assign({ connectionLimit: 1 }, baseConfig);
  console.log(poolConf);
  let pool = newPool(Object.assign({ connectionLimit: 1 }, baseConfig));
  pool.importFile({ file: '/path' }, () => {
    pool.importFile({ file: '/path', database: baseConfig.database }, () => {
      console.log(pool.closed);
      pool.taskQueueSize();
      function displayConn(conn: Connection): void {
        console.log(conn);
      }
      pool.on('acquire', displayConn).on('acquire', displayConn);
      pool.on('connection', displayConn).on('connection', displayConn);
      pool
        .on('enqueue', () => {
          console.log('enqueue');
        })
        .on('enqueue', () => {
          console.log('enqueue');
        });
      pool.on('release', displayConn).on('release', displayConn);
      pool.query('SELECT 1 + 1 AS solution', (err: SqlError | null, rows?: any[]) => {
        if (err) return next(err);
        if (rows === undefined) return next(new Error('rows is undefined'));
        console.log(rows[0].solution === 2);
        pool.end(() => {
          pool = createPool(
            `mariadb://${baseConfig.user}${baseConfig.password ? ':' + baseConfig.password : ''}@${
              baseConfig.host
            }:${baseConfig.port}/${baseConfig.database}?connectionLimit=10`
          );
          pool.end(() => {
            pool = newPool();
            pool.getConnection((err: SqlError | null, connection?: Connection) => {
              if (err) return next(err);
              pool.escape('test');
              pool.escape(true);
              pool.escape(5);
              pool.escapeId('myColumn');
              if (connection === undefined) return next(new Error('connection is undefined'));
              connection.query('DROP TABLE IF EXISTS myTable2', () => {});
              pool.query('CREATE TABLE myTable2(id int, id2 int)', () => {
                pool.batch(
                  'INSERT INTO myTable2 VALUE (?,?)',
                  [
                    [1, 2],
                    [4, 3]
                  ],
                  (err: SqlError | null, res?: any) => {
                    if (err) return next(err);
                    console.log(res.affectedRows);
                    console.log(connection!.threadId != null);

                    connection!.execute('SELECT 1 + 1 AS solution', (err: SqlError | null) => {
                      if (err) return next(err);
                      connection!.execute('SELECT 1 + ? AS solution', [1], (err: SqlError | null) => {
                        if (err) return next(err);
                        (connection as any).release((err: SqlError | null) => {
                          if (err) return next(err);
                          pool.end((err: SqlError | null) => {
                            if (err) return next(err);
                            next();
                          });
                        });
                      });
                    });
                  }
                );
              });
            });
          });
        });
      });
    });
  });
}

function testRowsAsArray(next: (err?: Error) => void) {
  const connection = createConn({ rowsAsArray: true });
  connection.query(`SELECT 'upper' as upper, 'lower' as lower`, (err: SqlError | null, rows?: any[][]) => {
    if (err) return next(err);
    if (rows === undefined) return next(new Error('rows is undefined'));
    if (rows[0][0] !== 'upper') return next(new Error('wrong value'));
    connection.query(
      {
        sql: `SELECT 'upper' as upper, 'lower' as lower`,
        rowsAsArray: true
      },
      (err: SqlError | null, rows2?: any[][]) => {
        if (err) return next(err);
        if (rows2 === undefined) return next(new Error('rows is undefined'));
        if (rows2[0][0] !== 'upper') return next(new Error('wrong value'));
        next();
      }
    );
  });
}

function testPoolCluster(next: (err?: Error) => void) {
  console.log('testPoolCluster');
  let connection: Connection | undefined;
  const poolCluster = createPoolCluster();
  const poolConfig = createPoolConfig({
    connectionLimit: 1
  });
  poolCluster.add('MASTER', poolConfig);
  poolCluster.add('SLAVE1', poolConfig);
  poolCluster.add('SLAVE2', poolConfig);

  poolCluster.getConnection((err, conn?) => {
    if (err) return next(err);
    if (conn === undefined) return next(new Error('conn is undefined'));
    connection = conn;
    if (!connection) return next(new Error('No connection'));
    console.log(connection.threadId != null);
    console.log(5);
    conn.release(() => {});
    poolCluster.getConnection('MASTER', (err: SqlError | null, conn?) => {
      if (err) return next(err);
      if (!conn) return next(new Error('No connection'));
      console.log(conn.threadId != null);
      conn.release(() => {});
      poolCluster.getConnection('MASTER', 'RR', (err, conn) => {
        if (err) return next(err);
        if (!conn) return next(new Error('No connection'));
        console.log(conn.threadId != null);
        conn.release(() => {});
        poolCluster.of('.*').getConnection((err: SqlError | null, conn?: PoolConnection) => {
          if (err) return next(err);
          if (!conn) return next(new Error('No connection'));
          console.log(conn.threadId != null);
          conn.release(() => {});
          poolCluster.of(null, 'RR').getConnection((err: SqlError | null, conn?) => {
            if (err) return next(err);
            if (!conn) return next(new Error('No connection'));
            console.log(conn.threadId != null);
            conn.release(() => {});
            const filtered = poolCluster.of('SLAVE.*', 'RANDOM');
            filtered.batch(
              'INSERT INTO myTable2 VALUE (?,?)',
              [
                [1, 2],
                [4, 3]
              ],
              (err: SqlError | null, res?: any) => {
                if (err) return next(err);
                console.log(res.affectedRows);
                filtered.query('SELECT 1 + 1 AS solution', (err: SqlError | null) => {
                  if (err) return next(err);
                  filtered.execute('SELECT 1 + 1 AS solution', (err: SqlError | null) => {
                    if (err) return next(err);
                    if (!connection) return next(new Error('No connection'));

                    createPoolCluster({
                      canRetry: true,
                      removeNodeErrorCount: 3,
                      restoreNodeTimeout: 1000,
                      defaultSelector: 'RR'
                    });
                    poolCluster.end((err: SqlError | null) => {
                      if (err) return next(err);
                      next();
                    });
                  });
                });
              }
            );
          });
        });
      });
    });
  });
}

function runTests() {
  importSqlFile(() => {
    testMisc((err?: Error) => {
      if (err) return done(err);
      testChangeUser((err?: Error) => {
        if (err) return done(err);
        testPool((err?: Error) => {
          if (err) return done(err);
          testPoolCluster((err?: Error) => {
            if (err) return done(err);
            testRowsAsArray((err?: Error) => {
              if (err) return done(err);
              done();
            });
          });
        });
      });
    });
  });
}

function done(err?: any) {
  if (err) {
    console.log('Unexpected error');
    console.log(err);
    process.exit(1);
  } else {
    console.log('done');
    process.exit(0);
  }
}

runTests();

console.log(version);
