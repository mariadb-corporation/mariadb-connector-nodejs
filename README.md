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

version before 2.4 is compatible with Node.js 6+
version after 2.4 is compatible with Node.js 10+


## Documentation

See [promise documentation](https://github.com/mariadb-corporation/mariadb-connector-nodejs/blob/master/documentation/promise-api.md) for detailed API. 

[Callback documentation](https://github.com/mariadb-corporation/mariadb-connector-nodejs/blob/master/documentation/callback-api.md) describe the callback wrapper for compatibility with existing drivers.

See [dedicated part](https://github.com/mariadb-corporation/mariadb-connector-nodejs/blob/master/documentation/promise-api.md#migrating-from-2x-or-mysqlmysql2-to-3x) for migration from mysql/mysql2 or from 2.x version.

   
## Why a New Client?

While there are existing MySQL clients that work with MariaDB, (such as the [`mysql`](https://www.npmjs.com/package/mysql) and [`mysql2`](https://www.npmjs.com/package/mysql2) clients), the MariaDB Node.js Connector offers new functionality, like [Insert Streaming](#insert-streaming), [Pipelining](#pipelining), [ed25519 plugin authentication](https://mariadb.org/history-of-mysql-mariadb-authentication-protocols/) while making no compromises on performance.


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

MariaDB provides benchmarks comparing the Connector with popular Node.js MySQL clients, including: 

* [`promise-mysql`](https://www.npmjs.com/package/promise-mysql) version 5.0.4 + [`mysql`](https://www.npmjs.com/package/mysql) version 2.18.1
* [`mysql2`](https://www.npmjs.com/package/mysql2) version 2.2.5


#### query

```
select * from mysql.user - mysql x 1,442 ops/sec ±0.38%
select * from mysql.user - mysql2 x 1,484 ops/sec ±0.60%
select * from mysql.user - mariadb x 1,595 ops/sec ±0.38%
```

<img src="https://quickchart.io/chart/render/zm-e2bd7f00-c7ca-4412-84e5-5284055056b5?data1=1442&data2=1484&data3=1595&title=select%20one%20mysql.user%0A%20%5B%20sql%3A%20select%20*%20from%20mysql.user%20LIMIT%201%20%5D" width="500" height="160"/>

#### execute

```
select * from mysql.user using execute - mysql2 x 2,257 ops/sec ±0.84%
select * from mysql.user using execute - mariadb x 2,651 ops/sec ±0.59%
```

<img src="https://quickchart.io/chart?devicePixelRatio=1.0&h=140&w=520&c=%7B%22type%22%3A%22horizontalBar%22%2C%22data%22%3A%7B%22datasets%22%3A%5B%7B%22label%22%3A%22mysql2%202.2.5%22%2C%22backgroundColor%22%3A%22%234285f4%22%2C%22data%22%3A%5B2257%5D%7D%2C%7B%22label%22%3A%22mariadb%203.0.1%22%2C%22backgroundColor%22%3A%22%23ff9900%22%2C%22data%22%3A%5B2651%5D%7D%5D%7D%2C%22options%22%3A%7B%22plugins%22%3A%7B%22datalabels%22%3A%7B%22anchor%22%3A%22end%22%2C%22align%22%3A%22start%22%2C%22color%22%3A%22%23fff%22%2C%22font%22%3A%7B%22weight%22%3A%22bold%22%7D%7D%7D%2C%22elements%22%3A%7B%22rectangle%22%3A%7B%22borderWidth%22%3A0%7D%7D%2C%22responsive%22%3Atrue%2C%22legend%22%3A%7B%22position%22%3A%22right%22%7D%2C%22title%22%3A%7B%22display%22%3Atrue%2C%22text%22%3A%22select%20one%20mysql.user%20using%20execute%5Cn%20%5B%20sql%3A%20select%20*%20from%20mysql.user%20LIMIT%201%20%5D%22%7D%2C%22scales%22%3A%7B%22xAxes%22%3A%5B%7B%22display%22%3Atrue%2C%22scaleLabel%22%3A%7B%22display%22%3Atrue%2C%22labelString%22%3A%22operations%20per%20second%22%7D%2C%22ticks%22%3A%7B%22beginAtZero%22%3Atrue%7D%7D%5D%7D%7D%7D" width="500" height="140"/>
For more information, see the [Benchmarks](./documentation/benchmarks.md) page.

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