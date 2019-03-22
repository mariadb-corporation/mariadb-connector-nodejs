import fs = require('fs');
import mariadb = require('types');
import { FieldInfo, Types } from 'types';
import { Geometry } from 'geojson';

/// Connections

mariadb.createConnection('mariadb://user:password>@host:3306/mydb?opt1value1');

mariadb
  .createConnection({
    host: 'localhost',
    user: 'root',
    password: 'testn'
  })
  .then(connection => {
    connection
      .query('SELECT 1 + 1 AS solution')
      .then(rows => {
        console.log(rows[0].solution === 2);
      })
      .catch(err => {
        throw err;
      });

    connection
      .end()
      .then(() => {
        console.log('ended');
      })
      .catch(err => {
        throw err;
      });

    connection.destroy();

    connection.changeUser({ user: 'john' }).catch(err => {
      throw err;
    });

    connection
      .query('SELECT ? as t', 1)
      .then(rows => {
        console.log(rows[0].t === 1);
      })
      .catch(err => {
        throw err;
      });

    connection
      .query('SELECT ? as t', [1])
      .then(rows => {
        console.log(rows[0].t === 1);
      })
      .catch(err => {
        throw err;
      });

    connection
      .query('SELECT :val as t', { val: 2 })
      .then(rows => {
        console.log(rows[0].t === 2);
      })
      .catch(err => {
        throw err;
      });

    connection.query({ sql: 'SELECT 1', nestTables: '_' }).then(rows => {
      throw new Error('must have throw error!' + rows);
    });

    connection
      .query('Wrong SQL')
      .then(rows => {
        throw new Error('must have throw error!' + rows);
      })
      .catch(err => {
        console.log(err.message != null);
        console.log(err.errno === 12);
        console.log(err.sqlState === '');
        console.log(err.fatal === true);
      });

    let metaReceived = false;
    let currRow = 0;
    connection
      .queryStream('SELECT * from mysql.user')
      .on('error', err => {
        throw err;
      })
      .on('fields', meta => {
        console.log(meta);
        metaReceived = true;
      })
      .on('data', row => {
        console.log(row.length > 1);
        currRow++;
      })
      .on('end', () => {
        console.log(currRow + ' ' + metaReceived);
      });

    connection
      .ping()
      .then(() => {
        console.log('');
      })
      .catch(err => {
        throw err;
      });

    const writable = fs.createWriteStream('file.txt');
    connection.queryStream('SELECT * FROM posts').pipe(writable);

    connection
      .beginTransaction()
      .then(() => {})
      .catch(err => {
        console.log(err);
      });

    connection
      .rollback()
      .then(() => {})
      .catch(err => {
        console.log(err);
      });

    const changeCaseCast = function(
      column: FieldInfo,
      next: () => boolean | number | string | symbol | null | Geometry | Buffer
    ): boolean | number | string | symbol | null | Geometry | Buffer {
      if (column.string() === null) {
        return 0;
      }
      if (column.type === Types.BIT && column.name.startsWith('upp')) {
        return column.string() === '1';
      }
      return next();
    };

    mariadb.createConnection({ typeCast: changeCaseCast });

    connection
      .query({ sql: '...', typeCast: changeCaseCast }, [1, ''])
      .then(() => {})
      .catch(err => {
        console.log(err);
      });
  })
  .catch(err => {
    throw err;
  });

mariadb.createConnection({ multipleStatements: true });

mariadb
  .createConnection({
    host: 'example.org',
    user: 'bob',
    password: 'secret'
  })
  .then(connection => {
    console.error(`error connecting: ${connection.threadId}`);
  });

const poolConfig = {
  connectionLimit: 10,
  host: 'example.org',
  user: 'bob',
  password: 'secret'
};

let pool = mariadb.createPool(poolConfig);

pool
  .query('SELECT 1 + 1 AS solution')
  .then(rows => {
    console.log(rows[0].solution === 2);
  })
  .catch(err => {
    throw err;
  });

pool = mariadb.createPool({
  host: 'example.org',
  user: 'bob',
  password: 'secret'
});

pool
  .getConnection()
  .then(connection => {
    console.log(connection.threadId != null);
    connection
      .query('SELECT something FROM sometable')
      .then(() => {
        connection.release();
      })
      .catch(err => {
        throw err;
      });
  })
  .catch(err => {
    throw err;
  });

/// PoolClusters

// create
const poolCluster = mariadb.createPoolCluster();

poolCluster.add(poolConfig); // anonymous group
poolCluster.add('MASTER', poolConfig);
poolCluster.add('SLAVE1', poolConfig);
poolCluster.add('SLAVE2', poolConfig);

// Target Group : ALL(anonymous, MASTER, SLAVE1-2), Selector : round-robin(default)
poolCluster
  .getConnection()
  .then(connection => {
    console.log(connection.threadId != null);
  })
  .catch(err => {
    throw err;
  });

poolCluster
  .getConnection('MASTER')
  .then(connection => {
    console.log(connection.threadId != null);
  })
  .catch(err => {
    throw err;
  });

poolCluster
  .getConnection('MASTER', 'RR')
  .then(connection => {
    console.log(connection.threadId != null);
  })
  .catch(err => {
    throw err;
  });

// of namespace : of(pattern, selector)
poolCluster
  .of('*')
  .getConnection()
  .then(connection => {
    console.log(connection.threadId != null);
  })
  .catch(err => {
    throw err;
  });

poolCluster
  .of(null, 'RR')
  .getConnection()
  .then(connection => {
    console.log(connection.threadId != null);
  })
  .catch(err => {
    throw err;
  });

poolCluster.of('SLAVE*', 'RANDOM');

mariadb.createPoolCluster({
  canRetry: true,
  removeNodeErrorCount: 3,
  restoreNodeTimeout: 1000,
  defaultSelector: 'RR'
});

// destroy
poolCluster.end();

mariadb.createConnection({ debug: true });
mariadb.createConnection({ dateStrings: true });
