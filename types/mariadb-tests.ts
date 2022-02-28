import mariadb = require('..');
import { Connection, FieldInfo, ConnectionConfig, PoolConfig } from '..';
import { Stream } from 'stream';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { baseConfig } = require('../test/conf.js');

function createConnection(option?: ConnectionConfig): Promise<mariadb.Connection> {
  return mariadb.createConnection({
    host: baseConfig.host,
    user: option.user,
    password: baseConfig.password,
    logger: {
      network: (msg) => console.log(msg),
      query: (msg) => console.log(msg),
      error: (err) => console.log(err)
    },
    stream: (callback) => {
      console.log('test');
      callback(null, null);
    }
  });
}

function createPoolConfig(options?: PoolConfig): mariadb.PoolConfig {
  return Object.assign(
    {
      host: baseConfig.host,
      user: baseConfig.user,
      password: baseConfig.password,
      leakDetectionTimeout: 100
    },
    options
  );
}

function createPoolConfigWithSSl(options?: PoolConfig): mariadb.PoolConfig {
  Object.assign(
    {
      host: baseConfig.host,
      user: baseConfig.user,
      password: baseConfig.password,
      ssl: true
    },
    options
  );
  return Object.assign(
    {
      host: baseConfig.host,
      user: baseConfig.user,
      password: baseConfig.password,
      ssl: { ca: 'fff' }
    },
    options
  );
}

function createPool(options?: unknown): mariadb.Pool {
  mariadb.createPool(createPoolConfig(options));
  return mariadb.createPool(createPoolConfigWithSSl(options));
}

async function testMisc(): Promise<void> {
  let rows;
  const defaultOptions = mariadb.defaultOptions();
  const defaultOptionsWithTz = mariadb.defaultOptions({ timezone: '+00:00' });
  console.log(defaultOptions);
  console.log(defaultOptionsWithTz);
  const connection = await createConnection();

  rows = await connection.query('INSERT INTO myTable VALUE (1)');
  console.log(rows.insertId === 1);
  console.log(rows.affectedRows === 1);

  rows = await connection.query('SELECT 1 + 1 AS solution');
  console.log(rows[0].solution === 2);

  rows = await connection.query('SELECT ? as t', 1);
  console.log(rows[0].t === 1);

  rows = await connection.query('SELECT ? as t', [1]);
  console.log(rows[0].t === 1);

  rows = await connection.query(
    {
      namedPlaceholders: true,
      sql: 'SELECT :val as t'
    },
    { val: 2 }
  );
  console.log(rows[0].t === 2);

  try {
    rows = await connection.query({ sql: 'SELECT 1', nestTables: '_' });
    throw new Error('Should have thrown error!' + rows);
  } catch (err) {
    // Received expected error
  }

  try {
    rows = await connection.query('Wrong SQL');
    throw new Error('must have throw error!' + rows);
  } catch (err) {
    console.log(err.message != null);
    console.log(err.errno === 12);
    console.log(err.sqlState === '');
    console.log(err.fatal === true);
  }

  let metaReceived = false;
  let currRow = 0;
  connection
    .queryStream('SELECT * from mysql.user')
    .on('error', (err: Error) => {
      throw err;
    })
    .on('fields', (meta) => {
      console.log(meta);
      metaReceived = true;
    })
    .on('data', (row) => {
      console.log(row.length > 1);
      currRow++;
    })
    .on('end', () => {
      console.log(currRow + ' ' + metaReceived);
    });

  await connection.ping();

  const writable = new Stream.Writable({
    objectMode: true,
    /* eslint-disable @typescript-eslint/no-explicit-any */
    write(this: any, _chunk: any, _encoding: string, callback: (error?: Error | null) => void): void {
      callback(null);
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });
  connection.queryStream('SELECT * FROM mysql.user').pipe(writable);

  await connection.beginTransaction();

  await connection.rollback();

  await connection.end();
  console.log('ended');

  connection.destroy();
  connection.escape('test');
  connection.escape(true);
  connection.escape(5);
  connection.escapeId('myColumn');

  await createConnection({ multipleStatements: true });

  await createConnection({ debug: true });
  await createConnection({ dateStrings: true });
}

async function testChangeUser(): Promise<void> {
  const connection = await createConnection();
  try {
    await connection.changeUser({ user: 'this is a bogus user name' });
  } catch (err) {
    console.log('Correctly threw an error when changing user');
  }
}

async function testTypeCast(): Promise<void> {
  const changeCaseCast = (column: FieldInfo, next: mariadb.TypeCastNextFunction): mariadb.TypeCastResult => {
    const name = column.name();

    if (name.startsWith('upp')) {
      return column.string().toUpperCase();
    }

    return next();
  };

  const connection = await createConnection({ typeCast: changeCaseCast });

  const rows = await connection.query(`SELECT 'upper' as upper, 'lower' as lower`);

  if (rows[0].upper !== 'UPPER') {
    throw new Error('typeCast did not convert to upper case');
  }

  if (rows[0].lower !== 'lower') {
    throw new Error('typeCast did not ignore lower');
  }
}

async function testPool(): Promise<void> {
  let pool;

  pool = createPool({
    connectionLimit: 10
  });
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

  const rows = await pool.query('SELECT 1 + 1 AS solution');
  console.log(rows[0].solution === 2);

  pool = createPool();

  const connection = await pool.getConnection();
  pool.escape('test');
  pool.escape(true);
  pool.escape(5);
  pool.escapeId('myColumn');

  console.log(connection.threadId != null);

  await connection.query('SELECT 1 + 1 AS solution');
  connection.release();
}

async function testPoolCluster(): Promise<void> {
  let connection;
  const poolCluster = mariadb.createPoolCluster();

  const poolConfig = createPoolConfig({
    connectionLimit: 10
  });

  poolCluster.add('MASTER', poolConfig);
  poolCluster.add('SLAVE1', poolConfig);
  poolCluster.add('SLAVE2', poolConfig);

  // Target Group : ALL(anonymous, MASTER, SLAVE1-2), Selector : round-robin(default)
  connection = await poolCluster.getConnection();
  console.log(connection.threadId != null);
  console.log(5);

  connection = await poolCluster.getConnection('MASTER');
  console.log(connection.threadId != null);

  connection = await poolCluster.getConnection('MASTER', 'RR');
  console.log(connection.threadId != null);

  // of namespace : of(pattern, selector)
  connection = await poolCluster.of('.*').getConnection();
  console.log(connection.threadId != null);

  connection = await poolCluster.of(null, 'RR').getConnection();
  console.log(connection.threadId != null);

  poolCluster.of('SLAVE.*', 'RANDOM');

  mariadb.createPoolCluster({
    canRetry: true,
    removeNodeErrorCount: 3,
    restoreNodeTimeout: 1000,
    defaultSelector: 'RR'
  });

  poolCluster.end();
}

async function runTests(): Promise<void> {
  try {
    await testMisc();
    await testChangeUser();
    await testTypeCast();
    await testPool();
    await testPoolCluster();

    console.log('done');
  } catch (err) {
    console.log('Unexpected error');
    console.log(err);
  } finally {
    process.exit();
  }
}

runTests();

mariadb.version;
