<p align="center">
  <a href="http://mariadb.com/">
    <img src="https://mariadb.com/kb/static/images/logo-2018-black.png">
  </a>
</p>

# MariaDB Node.js connector

[![Linux Build](https://travis-ci.org/MariaDB/mariadb-connector-nodejs.svg?branch=master)](https://travis-ci.org/MariaDB/mariadb-connector-nodejs)
[![Windows status](https://ci.appveyor.com/api/projects/status/bcg7yy4iy9viq08t/branch/master?svg=true)](https://ci.appveyor.com/project/rusher/mariadb-connector-nodejs)
[![License (LGPL version 2.1)](https://img.shields.io/badge/license-GNU%20LGPL%20version%202.1-green.svg?style=flat-square)](http://opensource.org/licenses/LGPL-2.1)
[![codecov](https://codecov.io/gh/MariaDB/mariadb-connector-nodejs/branch/master/graph/badge.svg)](https://codecov.io/gh/MariaDB/mariadb-connector-nodejs)

**Non-blocking MariaDB and MySQL client for Node.js.**

MariaDB and MySQL client, 100% JavaScript, compatible with Node.js 6+, with the Promise API.

## Why a New Client?

While there are existing MySQL clients that work with MariaDB, (such as the [`mysql`](https://www.npmjs.com/package/mysql) and [`mysql2`](https://www.npmjs.com/package/mysql2) clients), the MariaDB Node.js Connector offers new functionality, like [Insert Streaming](#insert-streaming) and [Pipelining](#pipelining) while making no compromises on performance.

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

* [`promise-mysql`](https://www.npmjs.com/package/promise-mysql) version 3.3.1 + [`mysql`](https://www.npmjs.com/package/mysql) version 2.15.0 
* [`mysql2`](https://www.npmjs.com/package/mysql2) version 1.5.3

```
promise-mysql  : 1,366 ops/sec ±1.42%
mysql2         : 1,469 ops/sec ±1.63%
mariadb        : 1,802 ops/sec ±1.19%
```

<img src="./documentation/misc/bench.png" width="559" height="209"/>

For more information, see the [Benchmarks](/documentation/benchmarks.md) page.

## Quick Start

The MariaDB Connector is available through the Node.js repositories.  You can install it using npm :

```
$ npm install mariadb
```

Using ECMAScript < 2017:

```js
const mariadb = require('mariadb');
const pool = mariadb.createPool({host: 'mydb.com', user: 'myUser', connectionLimit: 5});
pool.getConnection()
    .then(conn => {
    
      conn.query("SELECT 1 as val")
        .then((rows) => {
          console.log(rows); //[ {val: 1}, meta: ... ]
          return conn.query("INSERT INTO myTable value (?, ?)", [1, "mariadb"]);
        })
        .then((res) => {
          console.log(res); // { affectedRows: 1, insertId: 1, warningStatus: 0 }
          conn.end();
        })
        .catch(err => {
          //handle error
          conn.end();
        })
        
    }).catch(err => {
      //not connected
    });
```

Using ECMAScript 2017:

```js
const mariadb = require('mariadb');
const pool = mariadb.createPool({host: 'mydb.com', user: 'myUser', connectionLimit: 5});

async function asyncFunction() {
  let conn;
  try {
	conn = await pool.getConnection();
	const rows = await conn.query("SELECT 1 as val");
	console.log(rows); //[ {val: 1}, meta: ... ]
	const res = await conn.query("INSERT INTO myTable value (?, ?)", [1, "mariadb"]);
	console.log(res); // { affectedRows: 1, insertId: 1, warningStatus: 0 }

  } catch (err) {
	throw err;
  } finally {
	if (conn) return conn.end();
  }
}
```

## Documentation

The MariaDB Node.js Connector can use different APIs on the back-end: Promise and Callback.  
The default API is [Promise API](https://github.com/MariaDB/mariadb-connector-nodejs/blob/master/documentation/promise-api.md).  

[Callback API](https://github.com/MariaDB/mariadb-connector-nodejs/blob/master/documentation/callback-api.md) is provided for compatibility with the `mysql` and `mysql2` APIs.
  
## Road Map 

The Connector remains in development.  Here's a list of features being developed for future releases:

* MariaDB `ed25519` plugin authentication
* Query Timeouts


## Contributing 

If you would like to contribute to the MariaDB Node.js Connector, please follow the instructions given in the [Developers Guide.](/documentation/developers-guide.md)

To file an issue or follow the development, see [JIRA](https://jira.mariadb.org/projects/CONJS/issues/).


