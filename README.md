<p align="center">
  <a href="http://mariadb.com/">
    <img src="https://mariadb.com/kb/static/images/logo-2018-black.png">
  </a>
</p>

# MariaDB Node.js connector

[![npm package][npm-image]][npm-url] 
[![Test Build][travis-image]][travis-url]
[![License (LGPL version 2.1)][licence-image]][licence-url]
[![codecov][codecov-image]][codecov-url]

**Non-blocking MariaDB and MySQL client for Node.js.**

MariaDB and MySQL client, 100% JavaScript, with TypeScript definition, with the Promise API.


## Documentation

See [promise documentation](https://github.com/mariadb-corporation/mariadb-connector-nodejs/blob/master/documentation/promise-api.md) for detailed API. 

[Callback documentation](https://github.com/mariadb-corporation/mariadb-connector-nodejs/blob/master/documentation/callback-api.md) describe the callback wrapper for compatibility with existing drivers.

See [dedicated part](https://github.com/mariadb-corporation/mariadb-connector-nodejs/blob/master/documentation/promise-api.md#migrating-from-2x-or-mysqlmysql2-to-3x) for migration from mysql/mysql2 or from 2.x version.

   
## Why a New Client?

While there are existing MySQL clients that work with MariaDB, (such as the [`mysql`](https://www.npmjs.com/package/mysql) and [`mysql2`](https://www.npmjs.com/package/mysql2) clients), the MariaDB Node.js Connector offers new functionality, like [Insert Streaming](#insert-streaming), [Pipelining](#pipelining), [ed25519 plugin authentication](https://mariadb.org/history-of-mysql-mariadb-authentication-protocols/) while making no compromises on performance.

Connector is production grade quality, with multiple features:
* superfast batching
* fast pool
* easy debugging, trace pointing to code line on error
* allows data streaming without high memory consumption
* pipelining
* metadata skipping (for MariaDB server only) 
* ...

see some of those features:

### Insert Streaming 

Using a Readable stream in your application, you can stream `INSERT` statements to MariaDB through the Connector.

```javascript
    
    https.get('https://someContent', readableStream => {
        //readableStream implement Readable, driver will stream data to database 
        connection.query("INSERT INTO myTable VALUE (?)", [readableStream]);
    });
```
 
### Pipelining

With Pipelining, the Connector sends commands without waiting for server results, preserving order.  For instance, consider the use of executing two `INSERT`  statements.

<p align="center">
    <img src="./documentation/misc/pip.png">
</p>

The Connector doesn't wait for query results before sending the next `INSERT` statement. Instead, it sends queries one after the other, avoiding much of the network latency.

For more information, see the [Pipelining](/documentation/pipelining.md) documentation.
 
### Bulk insert

Some use cases require a large amount of data to be inserted into a database table. By using batch processing, these queries can be sent to the database in one call, thus improving performance.

For more information, see the [Batch](/documentation/batch.md) documentation.


## Benchmarks

MariaDB provides benchmarks comparing the Connector with other Node.js MariaDB/MySQL clients, including: 

* [`promise-mysql`](https://www.npmjs.com/package/promise-mysql) version 5.2.0 + [`mysql`](https://www.npmjs.com/package/mysql) version 2.18.1
* [`mysql2`](https://www.npmjs.com/package/mysql2) version 2.3.3

See the [Benchmarks](./documentation/benchmarks.md) page for multiple results.

#### query

```
select 20 * int, 20 * varchar(32)
            mysql :    3,086 ops/s ± 0.6%
           mysql2 :  2,799.6 ops/s ± 1.6%  (   -9.3% )
          mariadb :  4,710.8 ops/s ±   1%  (  +52.7% )
```
![select 20 * int, 20 * varchar(32) benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=3086&data2=2800&data3=4711)

#### execute

```
select 20 * int, 20 * varchar(32) using execute
           mysql2 :    2,998 ops/s ± 1.3%
          mariadb :  4,419.6 ops/s ±   1%  (  +47.4% )
```
![select 20 * int, 20 * varchar(32) using execute benchmark results](https://quickchart.io/chart/render/zm-36b213f4-8efe-4943-8f94-82edf94fce83?data1=2998&data2=4420)


## Quick Start

The MariaDB Connector is available through the Node.js repositories.  You can install it using npm :

```
$ npm install mariadb
```
example:
```js
const mariadb = require('mariadb');
const pool = mariadb.createPool({host: process.env.DB_HOST, user: process.env.DB_USER, connectionLimit: 5});

async function asyncFunction() {
  let conn;
  try {

	conn = await pool.getConnection();
	const rows = await conn.query("SELECT 1 as val");
	// rows: [ {val: 1}, meta: ... ]

	const res = await conn.query("INSERT INTO myTable value (?, ?)", [1, "mariadb"]);
	// res: { affectedRows: 1, insertId: 1, warningStatus: 0 }

  } finally {
	if (conn) conn.release(); //release to pool
  }
}
```

## Contributing 

If you would like to contribute to the MariaDB Node.js Connector, please follow the instructions given in the [Developers Guide.](/documentation/developers-guide.md)

To file an issue or follow the development, see [JIRA](https://jira.mariadb.org/projects/CONJS/issues/).


[travis-image]:https://travis-ci.com/mariadb-corporation/mariadb-connector-nodejs.svg?branch=master
[travis-url]:https://app.travis-ci.com/github/mariadb-corporation/mariadb-connector-nodejs
[npm-image]:https://img.shields.io/npm/v/mariadb.svg
[npm-url]:http://npmjs.org/package/mariadb
[licence-image]:https://img.shields.io/badge/license-GNU%20LGPL%20version%202.1-green.svg?style=flat-square
[licence-url]:http://opensource.org/licenses/LGPL-2.1
[codecov-image]:https://codecov.io/gh/mariadb-corporation/mariadb-connector-nodejs/branch/master/graph/badge.svg
[codecov-url]:https://codecov.io/gh/mariadb-corporation/mariadb-connector-nodejs
