# Documentation

There are two different connection implementations: one, the default, uses Promise and the other uses Callback, allowing for compatibility with the mysql and mysql2 API's.  

The documentation provided on this page is the promise API (default).  
If you want information on the Callback API, see the [CALLBACK API](./callback-api.md). 


## Quick Start

Install the mariadb Connector using npm

```
$ npm install mariadb
```

You can then use the Connector in your application code with the Promise API. For instance,

```js
const mariadb = require('mariadb');

async function asyncFunction() {
  const conn = await mariadb.createConnection({
    host: 'mydb.com',
    user: 'myUser',
    password: 'myPwd'
  });

  try {
    const res = await conn.query('select 1');
    console.log(res); // [{ "1": 1 }]
    return res;
  } finally {
    conn.end();
  }
}

asyncFunction();
```

# Installation

In order to use the Connector you first need to install it on your system. The installation process for Promise and Callback API's is managed with the same package through npm. 

```
$ npm install mariadb
```

To use the Connector, you need to import the package into your application code. 

```js
const mariadb = require('mariadb');
```

## Migrating from 2.x or mysql/mysql2 to 3.x

Default behaviour for decoding [BIGINT](https://mariadb.com/kb/en/bigint/) / [DECIMAL](https://mariadb.com/kb/en/decimal/) datatype for 2.x version and mysql/mysql2 drivers return a javascript [Number](https://developer.mozilla.org/fr/docs/Web/JavaScript/Reference/Global_Objects/Number) object.
BIGINT/DECIMAL values might not be in the safe range, resulting in approximate results. 

Since 3.x version, driver has reliable default, returning:
* DECIMAL => javascript String
* BIGINT => javascript [BigInt](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt) object

For compatibility with previous version or mysql/mysql driver, 4 options have been added to return BIGINT/DECIMAL as number, as previous defaults. 

|               option | description                                                                                                                                                        |    type    | default | 
|---------------------:|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|:----------:|:-------:|
| **insertIdAsNumber** | Whether the query should return last insert id from INSERT/UPDATE command as BigInt or Number. default return BigInt                                               | *boolean*  |  false  |
|  **decimalAsNumber** | Whether the query should return decimal as Number. If enabled, this might return approximate values.                                                               | *boolean*  |  false  |
|   **bigIntAsNumber** | Whether the query should return BigInt data type as Number. If enabled, this might return approximate values.                                                      | *boolean*  |  false  |
| **checkNumberRange** | when used in conjunction of decimalAsNumber, insertIdAsNumber or bigIntAsNumber, if conversion to number is not exact, connector will throw an error (since 3.0.1) | *function* |         |

Previous options `supportBigNumbers` and `bigNumberStrings` still exist for compatibility, but are now deprecated.   

#### Other considerations

mysql has an experimental syntax permitting the use of `??` characters as placeholder to escape id.
This isn't implemented in mariadb driver, permitting same query syntax for [Connection.query](#connectionquerysql-values---promise) and [Connection.execute](#connectionexecutesql-values--promise).

example:
```js
  const res = await conn.query('call ??(?)', [myProc, 'myVal']);
```
has to use explicit escapeId:
```js
  const res = await conn.query(`call ${conn.escapeId(myProc)}(?)`, ['myVal']);
```

Cluster configuration `removeNodeErrorCount` default to `Infinity` when mysql/mysql2 default to value `5`. This avoids removing nodes without explicitly saying so.

## Recommendation

### Enable 'trace' option in development

It is recommended to activate the `trace` option in development.
Since driver is asynchronous, enabling this option permits to save initial stack when calling any driver methods.
This allows to have interesting debugging information: 
example:
```js
const pool = mariadb.createPool({
  host: 'mydb.com',
  user: 'myUser',
  connectionLimit: 5,
  trace: true
});
await pool.query('wrong query');
/* will throw an error like : 
  sql: wrong query - parameters:[]
    at Object.module.exports.createError (C:\temp\mariadb-connector-nodejs2\lib\misc\errors.js:57:10)
    at ...
 From event:
    at Function._PARAM (C:\temp\mariadb-connector-nodejs2\lib\connection-promise.js:104:30)
    at PoolPromise.query (C:\temp\mariadb-connector-nodejs2\lib\pool-promise.js:102:40)
    at Context.<anonymous> (C:\temp\mariadb-connector-nodejs2\test\integration\test-pool.js:60:18)
    at callFn (C:\temp\mariadb-connector-nodejs2\node_modules\mocha\lib\runnable.js:366:21)
    at Test.Runnable.run (C:\temp\mariadb-connector-nodejs2\node_modules\mocha\lib\runnable.js:354:5)
    at Runner.runTest (C:\temp\mariadb-connector-nodejs2\node_modules\mocha\lib\runner.js:678:10)
    at C:\temp\mariadb-connector-nodejs2\node_modules\mocha\lib\runner.js:801:12
    at next (C:\temp\mariadb-connector-nodejs2\node_modules\mocha\lib\runner.js:593:14)
    at C:\temp\mariadb-connector-nodejs2\node_modules\mocha\lib\runner.js:603:7
    at next (C:\temp\mariadb-connector-nodejs2\node_modules\mocha\lib\runner.js:486:14)
    at Immediate.<anonymous> (C:\temp\mariadb-connector-nodejs2\node_modules\mocha\lib\runner.js:571:5)
    at processImmediate (internal/timers.js:464:21) {
  text: "You have an error in your SQL syntax; check the manual that corresponds to your MariaDB server version for the right syntax to use near 'wrong query' at line 1",
  sql: 'wrong query - parameters:[]',
  fatal: false,
  errno: 1064,
  sqlState: '42000',
  code: 'ER_PARSE_ERROR'
}
   */
```
The caller method and line are now in error stack, permitting easy error debugging.

The problem is this error stack is created using [Error.captureStackTrace](https://nodejs.org/api/errors.html#errorcapturestacktracetargetobject-constructoropt) that is super slow (hoping [node.js solved it at some point](https://github.com/nodejs/performance/issues/40)). 
To give an idea, this slows down by 10% a query like 'select * from mysql.user LIMIT 1', so not recommended in production.

### Timezone consideration

If Client and Server share the same timezone, default behavior (`timezone`='local') is the solution.

Problem resides when client and server don't share timezone.  

The `timezone` option can have the following value:
* 'local' (default): connector doesn't do any conversion. If the database has a different timezone, there will be offset issues. 
* 'auto': connector retrieves server timezone, and if client timezone differs from server, connector will set session timezone to client timezone
* IANA timezone / offset, example 'America/New_York' or '+06:00'. Connector will set session timezone to indicated timezone. It is expected that this timezone corresponds to client tz.

Using 'auto' or setting specific timezone solves timezone correction. 
Please be careful for fixed timezone: Etc/GMT+12 = GMT-12:00 = -12:00 = offset -12. Etc/GMT have opposite sign!!  

(Before 3.1, connector was converting date to server timezone, but these were not correcting all timezone issues)

##### IANA timezone / offset

When using IANA timezone, the connector will set the connection timezone to the timezone. 
This can throw an error on connection if timezone is unknown by the server (see [mariadb timezone documentation](https://mariadb.com/kb/en/time-zones/), timezone tables might be not initialized)
If you are sure the server is using that timezone, this step can be skipped with the option `skipSetTimezone`.

If timezone corresponds to javascript default timezone, then no conversion will be done.

##### Timezone setting recommendation
The best is to have the same timezone on client and database, then keep the 'local' default value. 

If different, then either client or server has to convert date. 
In general, it is best to use client conversion, to avoid putting any unneeded stress on the database. 
Timezone has to be set to the IANA timezone corresponding to server timezone and disabled `skipSetTimezone` option since you are sure that the server has the corresponding timezone.

Example: client uses 'America/New_York' by default, and server 'America/Los_Angeles'.
Execute 'SELECT @@system_time_zone' on the server. That will give the server default timezone. 
The server can return POSIX timezone like 'PDT' (Pacific Daylight Time). 
IANA timezone correspondence must be found (see [IANA timezone List](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)) and configure client-side. 
This will ensure DST (automatic daylight saving time change will be handled).

```js
const conn = await mariadb.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PWD,
    timezone: 'America/Los_Angeles',
    skipSetTimezone: true
});
```

  
### Security consideration

Connection details such as URL, username, and password are better hidden into environment variables.
Using code like: 
```js
const conn = await mariadb.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PWD
});
```
Then for example, run node.js setting those environment variables:
```
$ DB_HOST=localhost DB_USER=test DB_PASSWORD=secretPasswrd node my-app.js
```

Another solution is using `dotenv` package. Dotenv loads environment variables from .env files into the process.env variable in Node.js:
```
$ npm install dotenv
```

Then configure dotenv to load all .env files:
 
```js
require('dotenv').config();

const conn = await mariadb.createConnection({
 host: process.env.DB_HOST,
 user: process.env.DB_USER,
 password: process.env.DB_PWD
});
```

with a .env file containing:
```
DB_HOST=localhost
DB_USER=test
DB_PWD=secretPasswrd
```
.env files must NOT be pushed into repository, using .gitignore.

Alternatively, Node.js 20.0 introduced the experimental feature of using the `node --env-file=.env` syntax to load environment variables without the need for external dependencies. We can then simply write:

```js
const conn = await mariadb.createConnection({
 host: process.env.DB_HOST,
 user: process.env.DB_USER,
 password: process.env.DB_PWD
});
```

Assuming the presence of the same .env file as previously described.


### Default options consideration

For new projects, enabling option `supportBigInt` is recommended (It will be in a future 3.x version).

This option permits to avoid exact value for big integer (value > 2^53) (see [javascript ES2020 
BigInt](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt))


# Promise API

**Base:**

* [`createConnection(options) → Promise`](#createconnectionoptions--promise): Creates a new connection.
* [`createPool(options) → Pool`](#createpooloptions--pool): Creates a new Pool.
* [`createPoolCluster(options) → PoolCluster`](#createpoolclusteroptions--poolcluster): Creates a new pool cluster.
* [`importFile(options) → Promise`](#importfileoptions--promise): Import Sql file
* [`version → String`](#version--string): Return library version.
* [`defaultOptions(options) → Json`](#defaultoptionsoptions--json): List options with default values
  

**Connection:** 

* [`connection.query(sql[, values]) → Promise`](#connectionquerysql-values---promise): Executes a query.
* [`connection.queryStream(sql[, values]) → Emitter`](#connectionquerystreamsql-values--emitter): Executes a query, returning an emitter object to stream rows.
* [`connection.prepare(sql) → Promise`](#connectionpreparesql--promise): Prepares a query.
* [`connection.execute(sql[, values]) → Promise`](#connectionexecutesql-values--promise): Prepare and Executes a query.
* [`connection.batch(sql, values) → Promise`](#connectionbatchsql-values--promise): Fast batch processing.
* [`connection.beginTransaction() → Promise`](#connectionbegintransaction--promise): Begins a transaction.
* [`connection.commit() → Promise`](#connectioncommit--promise): Commits the current transaction, if any.
* [`connection.release() → Promise`](#connectionrelease--promise): Release connection to pool if connection comes from pool.
* [`connection.rollback() → Promise`](#connectionrollback--promise): Rolls back the current transaction, if any.
* [`connection.changeUser(options) → Promise`](#connectionchangeuseroptions--promise): Changes the current connection user.
* [`connection.ping() → Promise`](#connectionping--promise): Sends a 1 byte packet to the database to validate the connection.
* [`connection.reset() → Promise`](#connectionreset--promise): Reset current connection state.
* [`connection.isValid() → boolean`](#connectionisvalid--boolean): Checks that the connection is active without checking socket state.
* [`connection.end() → Promise`](#connectionend--promise): Gracefully close the connection.
* [`connection.destroy()`](#connectiondestroy): Forces the connection to close. 
* [`connection.escape(value) → String`](#connectionescapevalue--string): Escape parameter 
* [`connection.escapeId(value) → String`](#connectionescapeidvalue--string): Escape identifier 
* [`connection.pause()`](#connectionpause): Pauses the socket output.
* [`connection.resume()`](#connectionresume): Resumes the socket output.
* [`connection.serverVersion()`](#connectionserverversion): Retrieves the current server version.
* [`connection.importFile(options) → Promise`](#connectionimportfileoptions--promise): Import Sql file
* [`events`](#events): Subscribes to connection error events.

**Pool:**

* [`pool.getConnection() → Promise`](#poolgetconnection--promise): Creates a new connection.
* [`pool.query(sql[, values]) → Promise`](#poolquerysql-values---promise): Executes a query.
* [`pool.batch(sql, values) → Promise`](#poolbatchsql-values---promise): Executes a batch
* [`pool.end() → Promise`](#poolend--promise): Gracefully closes the connection.
* [`pool.escape(value) → String`](#poolescapevalue--string): Escape parameter 
* [`pool.escapeId(value) → String`](#poolescapeidvalue--string): Escape identifier 
* [`pool.importFile(options) → Promise`](#poolimportfileoptions--promise): Import Sql file
* `pool.activeConnections() → Number`: Gets current active connection number.
* `pool.totalConnections() → Number`: Gets current total connection number.
* `pool.idleConnections() → Number`: Gets current idle connection number.
* `pool.taskQueueSize() → Number`: Gets current stacked request.
* [`pool events`](#pool-events): Subscribes to pool events.

**PoolCluster**

* [`poolCluster.add(id, config)`](#poolclusteraddid-config): Add a pool to cluster.
* [`poolCluster.remove(pattern)`](#poolclusterremovepattern): Remove and end pool according to pattern.
* [`poolCluster.end() → Promise`](#poolclusterend--promise): End cluster.
* [`poolCluster.getConnection(pattern, selector) → Promise`](#poolclustergetconnectionpattern-selector--promise): Return a connection from cluster.
* [`poolCluster.of(pattern, selector) → FilteredPoolCluster`](#poolclusterofpattern-selector--filteredpoolcluster): Return a subset of cluster.
* [`poolCluster events`](#poolcluster-events): Subscribes to pool cluster events.


# Base API

## `createConnection(options) → Promise`

> * `options`: *JSON/String* [connection option documentation](#connection-options)
>
> Returns a promise that:
> * resolves with a [Connection](#connection-api) object,
> * raises an [Error](#error).

Creates a new [Connection](#connection-api) object.

**Example:**

```javascript
try {
  const conn = await mariadb.createConnection({
    host: 'mydb.com',
    user: 'myUser',
    password: 'myPwd'
  });
  console.log("connected! connection id is " + conn.threadId);
} catch (err) {
  console.log("not connected due to error: " + err);
}
```

### Connection options

Essential options list:

|               option | description                                                                                                                                                                                                                                                                                  |   type    |   default   |
|---------------------:|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:---------:|:-----------:|
|           **`user`** | User to access database.                                                                                                                                                                                                                                                                     | *string*  | 
|       **`password`** | User password.                                                                                                                                                                                                                                                                               | *string*  | 
|           **`host`** | IP address or DNS of the database server. *Not used when using option `socketPath`*.                                                                                                                                                                                                         | *string*  | "localhost" |
|           **`port`** | Database server port number. *Not used when using option `socketPath`*                                                                                                                                                                                                                       | *integer* |    3306     |
|            **`ssl`** | Enables TLS support. For more information, see the [`ssl` option](/documentation/connection-options.md#ssl) documentation.                                                                                                                                                                   |  *mixed*  |
|       **`database`** | Default database to use when establishing the connection.                                                                                                                                                                                                                                    | *string*  | 
|     **`socketPath`** | Permits connections to the database through the Unix domain socket or named pipe.                                                                                                                                                                                                            | *string*  | 
|       **`compress`** | Compresses the exchange with the database through gzip. This permits better performance when the database is not in the same location.                                                                                                                                                      | *boolean* |    false    |
| **`connectTimeout`** | Sets the connection timeout in milliseconds.                                                                                                                                                                                                                                                 | *integer* |    1000     |
|  **`socketTimeout`** | Sets the socket timeout in milliseconds after connection succeeds. A value of `0` disables the timeout.                                                                                                                                                                                      | *integer* |      0      |
|   **`queryTimeout`** | Set maximum query time in ms (an error will be thrown if limit is reached). 0 or undefined meaning no timeout. This can be superseded for a query using [`timeout`](https://github.com/mariadb-corporation/mariadb-connector-nodejs/blob/master/documentation/promise-api.md#timeout) option |   *int*   |      0      | 
|    **`rowsAsArray`** | Returns result-sets as arrays, rather than JSON. This is a faster way to get results. For more information, see Query.                                                                                                                                                                       | *boolean* |    false    |
|         **`logger`** | Configure logger. For more information, see the [`logger` option](/documentation/connection-options.md#logger) documentation.                                                                                                                                                                |  *mixed*  |

For more information, see the [Connection Options](/documentation/connection-options.md) documentation. 

### Connecting to Local Databases 

When working with a local database (that is, cases where MariaDB and your Node.js application run on the same host), you can connect to MariaDB through the Unix socket or Windows named pipe for better performance, rather than using the TCP/IP layer.

In order to set this up, you need to assign the connection a `socketPath` value. When this is done, the Connector ignores the `host` and `port` options.

The specific socket path you need to set is defined by the 
[`socket`](https://mariadb.com/kb/en/library/server-system-variables/#socket) server system variable. If you don't know it off hand, you can retrieve it from the server.

```sql
SHOW VARIABLES LIKE 'socket';
```

It defaults to `/tmp/mysql.sock` on Unix-like operating systems and `MySQL` on Windows. Additionally, on Windows, this feature only works when the server is started with the `--enable-named-pipe` option.

For instance, on Unix a connection might look like this:

```javascript
const conn = await mariadb.createConnection({ 
    socketPath: '/tmp/mysql.sock', 
    user: 'root' 
});
```

It has a similar syntax on Windows: 

```javascript
const conn = await mariadb.createConnection({ 
    socketPath: '\\\\.\\pipe\\MySQL', 
    user: 'root' 
});
```

## `createPool(options) → Pool`

> * `options`: *JSON/String* [pool options](#pool-options)
>
> Returns a [Pool](#pool-api) object,

Creates a new pool.

**Example:**

```javascript
const pool = mariadb.createPool({ 
    host: 'mydb.com', 
    user: 'myUser', 
    connectionLimit: 5 
});

let conn;
try {
    conn = await pool.getConnection();
    console.log('connected! connection id is ' + conn.threadId);
    conn.release(); //release to pool
} catch (err) {
    console.log('not connected due to error: ' + err);
}
```

### Pool options

Pool options includes [connection option documentation](#connection-options) that will be used when creating new connections. 

Specific options for pools are:

|option|description|type|default|
|---:|---|:---:|:---:|
| **`acquireTimeout`** | Timeout to get a new connection from pool. In order to have connection error information, must be higher than connectTimeout. In milliseconds. | *integer* | 10000 |
| **`connectionLimit`** | Maximum number of connection in pool. | *integer* | 10 |
| **`idleTimeout`** | Indicate idle time after which a pool connection is released. Value must be lower than [@@wait_timeout](https://mariadb.com/kb/en/library/server-system-variables/#wait_timeout). In seconds. 0 means never release. | *integer* | 1800 |
| **`initializationTimeout`** | Pool will retry creating connection in loop, emitting 'error' event when reaching this timeout. In milliseconds. | *integer* | `acquireTimeout` value |
| **`minimumIdle`** | Permit to set a minimum number of connection in pool. **Recommendation is to use fixed pool, so not setting this value**. | *integer* | *set to connectionLimit value* |
| **`minDelayValidation`** | When asking a connection to pool, the pool will validate the connection state. "minDelayValidation" permits disabling this validation if the connection has been borrowed recently avoiding useless verifications in case of frequent reuse of connections. In milliseconds. 0 means validation is done each time the connection is asked. | *integer* | 500 |
| **`noControlAfterUse`** | After giving back connection to pool (connection.end) connector will reset or rollback connection to ensure a valid state. This option permit to disable those controls | *boolean* | false |
| **`resetAfterUse`** | When a connection is given back to pool, reset the connection if the server allows it (only for MariaDB version >= 10.2.22 /10.3.13). If disabled or server version doesn't allows reset, pool will only rollback open transaction if any| *boolean* | true before version 3, false since |
| **`leakDetectionTimeout`** | Permit to indicate a timeout to log connection borrowed from pool. When a connection is borrowed from pool and this timeout is reached, a message will be logged to console indicating a possible connection leak. Another message will tell if the possible logged leak has been released. In milliseconds. 0 means leak detection is disabled. | *integer* | 0 |
| **`pingTimeout`** | Validation timeout (ping) for checking an connection not used recently from pool. In milliseconds. | *integer* | 500 |

## `createPoolCluster(options) → PoolCluster`

> * `options`: *JSON* [poolCluster options](#poolCluster-options)
>
> Returns a [PoolCluster](#poolCluster-api) object,

Creates a new pool cluster. Cluster handle multiple pools, giving high availability / distributing load (using round robin / random / ordered).

**Example:**

```javascript
const cluster = mariadb.createPoolCluster();
cluster.add('master', { host: 'mydb1.com', user: 'myUser', connectionLimit: 5 });
cluster.add('slave1', { host: 'mydb2.com', user: 'myUser', connectionLimit: 5 });
cluster.add('slave2', { host: 'mydb3.com', user: 'myUser', connectionLimit: 5 });

//getting a connection from slave1 or slave2 using round-robin
const conn = await cluster.getConnection(/slave*/, "RR");
try {
  const rows = await conn.query("SELECT 1");
  return rows[0]["1"];
} finally {
  conn.end();
}
```

### PoolCluster options

Pool cluster options includes [pool option documentation](#pool-options) that will be used when creating new pools. 

Specific options for pool cluster are:

|                     option | description                                                                                                                                                                                    |   type    | default  | 
|---------------------------:|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:---------:|:--------:|
|             **`canRetry`** | When getting a connection from pool fails, can cluster retry with other pools                                                                                                                  | *boolean* |   true   |
| **`removeNodeErrorCount`** | Maximum number of consecutive connection fail from a pool before pool is removed from cluster configuration. Infinity means node won't be removed. Default to Infinity since 3.0, was 5 before | *integer* | Infinity |
|   **`restoreNodeTimeout`** | delay before a pool can be reused after a connection fails. 0 = can be reused immediately (in ms)                                                                                              | *integer* |   1000   |
|      **`defaultSelector`** | default pools selector. Can be 'RR' (round-robin), 'RANDOM' or 'ORDER' (use in sequence = always use first pools unless fails)                                                                 | *string*  |   'RR'   |

## `importFile(options) → Promise`

> * `options`: *JSON/String* [connection option documentation](#connection-options) + one additional options `file`
>
> Returns a promise that:
> * resolves with an empty result,
> * raises an [Error](#error).

Import an sql file 

**Example:**

```javascript
try {
    await mariadb.importFile({ host: 'localhost', user: 'root', file: '/tmp/tools/data-dump.sql'});
} catch (e) {
    // ...
}
```

## `version → String`

> Returns a String that is library version. example '2.1.2'.

## `defaultOptions(options) → Json`

> * `options`: *JSON/String* [connection option documentation](#connection-options) (non mandatory)
> 
> Returns a JSON value containing options default value. 

Permits listing default option that will be used. 

```js
console.log(mariadb.defaultOptions({ timezone: '+00:00' }));
/*
{
   host: 'localhost',
   port: 3306,
   user: 'root',
   password: undefined,
   database: undefined,
   collation: Collation { index: 224, name: 'UTF8MB4_UNICODE_CI', charset: 'utf8' },
   timezone: '+00:00',
   ...
}
*/        
```

# Connection API

## `connection.query(sql[, values]) -> Promise`

> * `sql`: *string | JSON* SQL string or JSON object to supersede default connection options. When using JSON object, object must have a "sql" key. For instance, `{ dateStrings: true, sql: 'SELECT now()' }`
> * `values`: *array | object* Placeholder values. Usually an array, but in cases of only one placeholder, it can be given as is. 
>
> Returns a promise that:
> * resolves with a JSON object for update/insert/delete or a [result-set](#result-set-array) object for result-set.
> * rejects with an [Error](#error).


Sends a query to database and return result as a Promise.

For instance, when using an SQL string:

```js
const rows = await conn.query('SELECT NOW()');
console.log(rows); //[ { 'NOW()': 2018-07-02T17:06:38.000Z } ]
```

Alternatively, you could use the JSON object:

```js
const rows = await conn.query({
    dateStrings: true, 
    sql: 'SELECT NOW()'
});
console.log(rows); //[ { 'NOW()': '2018-07-02 19:06:38' } ]
```

### Placeholder

To prevent SQL Injection attacks, queries permit the use of question marks as placeholders. The Connection escapes values according to their type. Values can be of native JavaScript types, Buffers, Readables, objects with `toSQLString` methods, or objects that can be stringified (that is, `JSON.stringify`).

When streaming, objects that implement Readable are streamed automatically. But, there are two server system variables that may interfere:

- [`net_read_timeout`](https://mariadb.com/kb/en/library/server-system-variables/#net_read_timeout): The server must receive queries before reaching this timeout, which defaults to 30 seconds.
- [`max_allowed_packet`](https://mariadb.com/kb/en/library/server-system-variables/#max_allowed_packet): This system variable defines the maximum amount of data the Connector can send to the server.

For instance,

```js
const res = await connection.query("INSERT INTO someTable VALUES (?, ?, ?)", [
  1,
  Buffer.from("c327a97374", "hex"),
  "mariadb",
]);
//will send INSERT INTO someTable VALUES (1, _BINARY '.\'.st', 'mariadb')
```


In the case of streaming, 

```js
const https = require('https');
//3Mb page
https.get(
    'https://node.green/#ES2018-features-Promise-prototype-finally-basic-support',
    readableStream => conn.query('INSERT INTO StreamingContent (b) VALUE (?)', [readableStream])
);
```

### JSON Result-sets 

Queries return two different kinds of results, depending on the type of query you execute. When you execute write statements (such as `INSERT`, `DELETE` and `UPDATE`), the method returns a JSON object with the following properties:

* `affectedRows`: The number of rows affected by the operation
* `insertId`: The auto-increment ID generated by the operation (for the first inserted row when multiple rows are inserted)
* `warningStatus`: A flag indicating whether the query generated warnings

```js
await connection.query('CREATE TABLE animals (' +
                       'id MEDIUMINT NOT NULL AUTO_INCREMENT,' +
                       'name VARCHAR(30) NOT NULL,' +
                       'PRIMARY KEY (id))');
const res = await connection.query('INSERT INTO animals(name) value (?)', ['sea lions']);
//res : { affectedRows: 1, insertId: 1, warningStatus: 0 }
```

### Array Result-sets 

When executing a `SELECT` statement, the method returns the result-set as an array of JSON objects. Each object in the array represents a row from the result-set, with column names as property keys.

The result also includes a special non-enumerable `meta` property containing an array of [column metadata](#column-metadata) information.

```javascript
const res = await connection.query('select * from animals');
// res : [
//    { id: 1, name: 'sea lions' }, 
//    { id: 2, name: 'bird' }, 
// ]
const meta = res.meta;
//    meta: [ ... ]
```

### Query options

The following options can be set at either the query level or the connection level. When set at the connection level, they apply to all subsequent queries.

#### `timeout`

*number, timeout in ms*

Sets a timeout for query execution. Only available for MariaDB server >= 10.1.2.

The driver implements this using `SET STATEMENT max_statement_time=<timeout> FOR <command>`, which allows the server to cancel operations that exceed the specified timeout.

**Important limitation**: When using multiple statements (with the `multipleStatements` option enabled), only the first query will be subject to the timeout.

The implementation of `max_statement_time` is engine-dependent and may behave differently across storage engines. For example, with the Galera engine, commits ensure replication to other nodes is completed, which might exceed the timeout to maintain proper server state.

```javascript
try {
    // Query that would normally take more than 100ms
    await connection.query({
        sql: 'SELECT * FROM information_schema.tables, information_schema.tables as t2', 
        timeout: 100 
    });
} catch (err) {
  // Error will be:
  // SqlError: (conn:2987, no: 1969, SQLState: 70100) Query execution was interrupted (max_statement_time exceeded)
  // ...
}
```

#### `namedPlaceholders`

*boolean, default false*

Enables the use of named placeholders instead of question mark placeholders. When enabled, the values parameter must be an object with keys matching the placeholder names in the query.

```javascript
await connection.query(
    { namedPlaceholders: true, sql: 'INSERT INTO someTable VALUES (:id, :img, :db)' },
    { id: 1, img: Buffer.from('c327a97374', 'hex'), db: 'mariadb' }
);
```

#### `rowsAsArray`

*boolean, default false*

Returns rows as arrays instead of objects, which can improve performance by 5-10% with local databases and reduces memory usage by avoiding the need to parse column metadata completely.

```javascript
const res = await connection.query({ rowsAsArray: true, sql: 'select * from animals' });
// res = [ 
//    [ 1, 'sea lions' ], 
//    [ 2, 'bird' ],
// ]
const meta = res.meta;
//    meta: [...]
```

#### `metaAsArray`

*boolean, default false*

A compatibility option that causes the Promise to return an array `[rows, metadata]` instead of rows with a `meta` property. This option is primarily for mysql2 compatibility.

```javascript
const [rows, meta] = await connection.query({ metaAsArray: true, sql: 'select * from animals' });
// rows = [ 
//    {'id': 1, 'name': 'sea lions' }, 
//    {'id': 2, 'name': 'bird' },
// ]
// meta = [...]
```

#### `nestTables`

*boolean / string, default false*

Helps resolve column name conflicts in joins by grouping data by table. When set to `true`, results are grouped by table name. When set to a string value, it's used as a separator between table name and column name.

With boolean value:
```javascript
const res = await connection.query({
    nestTables: true, 
    sql: 'select a.name, a.id, b.name from animals a, animals b where b.id=1'
});
// res = [ 
//  { 
//     a: { name: 'sea lions', id: 1 }, 
//     b: { name: 'sea lions' } 
//  },
//  { 
//     a: { name: 'bird', id: 2 }, 
//     b: { name: 'sea lions' } 
//  }
//]
```

With string value:
```javascript
const res = await connection.query({
    nestTables: '_', 
    sql: 'select a.name, a.id, b.name from animals a, animals b where b.id=1'
});
// res = [ 
//  { a_name: 'sea lions', a_id: 1, b_name: 'sea lions' }, 
//  { a_name: 'bird', a_id: 2, b_name: 'sea lions' }
//]
```

#### `dateStrings`

*boolean, default: false*

Whether you want the Connector to retrieve date values as strings, rather than `Date` objects.


#### `bigIntAsNumber`

*boolean, default: true*

Whether the query should return javascript ES2020 [BigInt](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt) 
for [BIGINT](https://mariadb.com/kb/en/bigint/) data type. 
This ensures having expected value even for value > 2^53 (see [safe](/documentation/connection-options.md#big-integer-support) range).
This option can be set to query level, supplanting connection option `supportBigInt` value. 

this option is for compatibility for driver version < 3

```javascript
await shareConn.query('CREATE TEMPORARY TABLE bigIntTable(id BIGINT)');
await shareConn.query("INSERT INTO bigIntTable value ('9007199254740993')");
const res = await shareConn.query('select * from bigIntTable');
// res :  [{ id: 9007199254740993n }] (exact value)
const res2 = await shareConn.query({sql: 'select * from bigIntTable', supportBigInt: false});
// res :  [{ id: 9007199254740992 }] (not exact value)
```


#### `decimalAsNumber`

*boolean, default: false*

Whether the query should return decimal as Number. 
If enable, this might return approximate values. 


#### `typeCast`

*Experimental*

*function(column, next)*

In the event that you need certain values returned as a different type, you can use this function to cast the value into that type yourself.

For instance, casting all `TINYINT(1)` values as boolean values:

```javascript
const tinyToBoolean = (column, next) => {
  if (column.type == 'TINY' && column.columnLength === 1) {
    const val = column.tiny();
    return val === null ? null : val === 1;
  }
  return next();
};
connection.query({ typeCast: tinyToBoolean, sql: '...' });
```

### Column Metadata

* `collation`: Object indicates the column collation.  It has the properties: `index`, `name`, `encoding`, and `maxlen`.  For instance, `33, "UTF8_GENERAL_CI", "utf8", 3`
* `columnLength`: Shows the column's maximum length if there's a limit and `0` if there is no limit, (such as with a `BLOB` column).
* `type`: 
Shows the column type as a String value. For more information on the relevant values, see	[`field-type.js`](/lib/const/field-type.js)
* `columnType`: Shows the column type as an integer value. For more information on the relevant values, see	[`field-type.js`](/lib/const/field-type.js)
* `scale`: Provides the decimal part length.
* `flags`: Shows the byte-encoded flags.  For more information, see [`field-detail.js`](/lib/const/field-detail.js).
* `db()`: Name of the database schema.    You can also retrieve this using `schema()`.
* `table()`: Table alias.
* `orgTable()`: Real table name.
* `name()`: Column alias. 
* `orgName()`: Real column name.

When using typeCast, additional function are available on Column, in order to decode value : 
* `string(): string` : decode [VARCHAR](https://mariadb.com/kb/en/varchar/)/[CHAR](https://mariadb.com/kb/en/char/)/[TEXT](https://mariadb.com/kb/en/text/) value
* `buffer(): Buffer` : decode [BINARY](https://mariadb.com/kb/en/binary/)/[BLOB](https://mariadb.com/kb/en/blob/) value
* `float(): float` : decode [FLOAT](https://mariadb.com/kb/en/float/) value
* `tiny(): int` : decode [TINY](https://mariadb.com/kb/en/tinyint/) value
* `short(): int` : decode [SMALLINT](https://mariadb.com/kb/en/smallint/) value
* `int(): int` : decode [INTEGER](https://mariadb.com/kb/en/int/) value
* `long(): bigint` : decode [BIGINT](https://mariadb.com/kb/en/bigint/) value
* `decimal(): string` : decode [DECIMAL](https://mariadb.com/kb/en/decimal/) value
* `date(): date` : decode [DATE](https://mariadb.com/kb/en/date/) value
* `datetime(): date` : decode [TIMESTAMP](https://mariadb.com/kb/en/timestamp/)/[DATETIME](https://mariadb.com/kb/en/datetime/) value
* `geometry(): geojson` : decode [GEOMETRY](https://mariadb.com/kb/en/geometry-types/) value

```js
const rows = await connection.query("SELECT 1, 'a'");
// rows = [ 
//   { '1': 1, a: 'a' }
// ]
const meta = rows.meta;
//   meta: [ 
//     { 
//       collation: [Object],
//       columnLength: 1,
//       columnType: 8,
//       scale: 0,
//       type: 'LONGLONG',
//       flags: 129,
//       db: [Function],
//       schema: [Function],
//       table: [Function],
//       orgTable: [Function],
//       name: [Function],
//       orgName: [Function] 
//     },
//     { 
//       collation: [Object],
//       columnLength: 4,
//       columnType: 253,
//       scale: 39,
//       type: 'VAR_STRING',
//       flags: 1,
//       db: [Function],
//       schema: [Function],
//       table: [Function],
//       orgTable: [Function],
//       name: [Function],
//       orgName: [Function] 
//     } 
//   ] 

```


## `connection.queryStream(sql[, values]) → Emitter`

> * `sql`: *string | JSON* SQL string value or JSON object to supersede default connections options.  JSON objects must have an `"sql"` property.  For instance, `{ dateStrings: true, sql: 'SELECT now()' }`
> * `values`: *array | object* Defines placeholder values. This is usually an array, but in cases of only one placeholder, it can be given as a string. 
>
> Returns an Emitter object that emits different types of events:
> * error : Emits an [`Error`](#error) object when the query fails. (No `"end"` event will then be emitted).
> * fields : Emits when column metadata from the result-set are received (the parameter is an array of [Metadata](#metadata-field) fields).
> * data : Emits each time a row is received (parameter is a row). 
> * end : Emits when the query ends (no parameter). 
> a method: close() : permits closing stream (since 3.0)
> 

### Streaming large result sets

When using the `query()` method, the Connector returns the entire result-set with all its data in a single call. While this works well for small result sets, it can become problematic for queries returning millions of rows, potentially causing memory issues.

The `queryStream()` method solves this by using Node.js's event-driven architecture to process rows one by one, significantly reducing memory usage for large result sets.

**Important**: The stream handles backpressure automatically, pausing the socket when data handling takes time to prevent Node.js socket buffers from growing indefinitely. If you're using a pipeline and your data handling throws an error, you must explicitly call `queryStream.close()` to prevent connection hangs.

### Streaming implementation options

There are several ways to implement streaming:

#### Using for-await-of (Node.js 10+)

The simplest approach using modern JavaScript syntax:

```javascript
async function streamingFunction() {
 const queryStream = connection.queryStream('SELECT * FROM mysql.user');
 try {
   for await (const row of queryStream) {
     console.log(row);
   }
 } catch (e) {
   queryStream.close();
   throw e;
 }
}
```

#### Using event listeners

Traditional Node.js event-based approach:

```javascript
connection.queryStream('SELECT * FROM mysql.user')
      .on("error", err => {
        console.log(err); // handle error
      })
      .on("fields", meta => {
        console.log(meta); // metadata array
      })
      .on("data", row => {
        console.log(row); // process each row
      })
      .on("end", () => {
        console.log("Query completed"); // all rows received
      });
```

#### Using Node.js streams

For advanced use cases, you can integrate with Node.js streams API:

```javascript
const stream = require('stream');
const fs = require('fs');

// Create a transform stream to convert rows to JSON strings
const transformStream = new stream.Transform({
  objectMode: true, // Important! queryStream produces objects
  transform: function transformer(row, encoding, callback) {
    callback(null, JSON.stringify(row) + '\n');
  }
});

// Create output file stream
const fileStream = fs.createWriteStream('./query-results.jsonl');

// Start the query stream
const queryStream = connection.queryStream('SELECT * FROM mysql.user');

// Using pipeline (Node.js 10+) to handle errors and cleanup
stream.pipeline(
  queryStream, 
  transformStream, 
  fileStream, 
  (err) => {
    if (err) {
      console.error('Pipeline failed:', err);
    } else {
      console.log('Pipeline succeeded');
    }
    queryStream.close(); // Always close the query stream
  }
);
```

## `connection.prepare(sql) → Promise`
> * `sql`: *string | JSON* SQL string value or JSON object to supersede default connections options.  JSON objects must have an `"sql"` property.  For instance, `{ dateStrings: true, sql: 'SELECT now()' }`
>
> Returns a promise that :
> * resolves with a [Prepare](#prepareobject) object.
> * rejects with an [Error](#error).

This permit to [PREPARE](https://mariadb.com/kb/en/prepare-statement/) a command that permits to be executed many times. 
After use, prepare.close() method MUST be call, in order to properly close object. 


### Prepare object

Public variables : 
* `id`: Prepare statement Identifier
* `query`: sql command
* `database`: database it applies to. 
* `parameters`: parameter array information.
* `columns`: columns array information. 

Public methods :
#### `execute(values) → Promise`
> * `values`: *array | object* Defines placeholder values. This is usually an array, but in cases of only one placeholder, it can be given as a string.
>
> Returns a promise that :
> * resolves with a JSON object for update/insert/delete or a [result-set](#result-set-array) object for result-set.
> * rejects with an [Error](#error).


#### `executeStream(values) → Promise`
> * `values`: *array | object* Defines placeholder values. This is usually an array, but in cases of only one placeholder, it can be given as a string.
>
> Returns an Emitter object that emits different types of events:
> * error : Emits an [`Error`](#error) object when the query fails. (No `"end"` event will then be emitted).
> * data : Emits each time a row is received (parameter is a row).
> * end : Emits when the query ends (no parameter).
> a method: close() : permits closing stream (since 3.0)

This is the equivalent of `queryStream` using execute.

When using the `execute()` method, documented above, the Connector returns the entire result-set with all its data in a single call. 
While this is fine for queries that return small result-sets, it can grow unmanageable in cases of huge result-sets. 
Instead of retrieving all the data into memory, you can use the `executeStream()` method, which uses the event drive architecture to process rows one by one, which allows you to avoid putting too much strain on memory.

You may want to consider updating the [`net_read_timeout`](https://mariadb.com/kb/en/library/server-system-variables/#net_read_timeout) server system variable. 
The resultSet must be totally received before this timeout, which defaults to 30 seconds.

* for-await-of

simple use with for-await-of only available since Node.js 10 (note that this must be use within async function) :

```javascript
async function streamingFunction() {
  const prepare = await shareConn.prepare('SELECT * FROM mysql.user where host = ?');
  const stream = prepare.executeStream(['localhost']);    
  try {
    for await (const row of stream) {
      console.log(row);
    }
  } catch (e) {
    queryStream.close();
  }
  prepare.close();
}
```

* Events

```javascript
  const prepare = await shareConn.prepare('SELECT * FROM mysql.user where host = ?');
  prepare.executeStream(['localhost'])
      .on("error", err => {
        console.log(err); //if error
      })
      .on("fields", meta => {
        console.log(meta); // [ ...]
      })
      .on("data", row => {
        console.log(row);
      })
      .on("end", () => {
        //ended
        prepare.close();  
      });
```



#### `close() → void`
This close the prepared statement. 
Each time a Prepared object is used, it must be closed. 

In case prepare cache is enabled (having option `prepareCacheLength` > 0 (default)), 
Driver will either really close Prepare or keep it in cache. 


```javascript
const prepare = await conn.prepare('INSERT INTO mytable(id,val) VALUES (?,?)');
await prepare.execute([1, 'val1'])
prepare.close();
```

## `connection.execute(sql[, values]) → Promise`
> * `sql`: *string | JSON* SQL string or JSON object to supersede default connection options.  When using JSON object, object must have a "sql" key. For instance, `{ dateStrings: true, sql: 'SELECT now()' }`
> * `values`: *array | object* Placeholder values. Usually an array, but in cases of only one placeholder, it can be given as is.
>
> Returns a promise that :
> * resolves with a JSON object for update/insert/delete or a [result-set](#result-set-array) object for result-set.
> * rejects with an [Error](#error).

This is quite similar to [`connection.query(sql[, values]) → Promise`](#connectionquerysql-values---promise) method, with a few differences : 
Execute will in fact [PREPARE](https://mariadb.com/kb/en/prepare-statement/) + [EXECUTE](https://mariadb.com/kb/en/execute-statement/) + [CLOSE](https://mariadb.com/kb/en/deallocate-drop-prepare/) command.

It makes sense to use this only if the command will often be used and if prepare cache is enabled (default).
If PREPARE result is already in cache, only [EXECUTE](https://mariadb.com/kb/en/execute-statement/) command is executed.
MariaDB server 10.6 even avoid resending result-set metadata if not changed since, permitting even faster results.

 
```javascript
const res = await conn.execute('SELECT * FROM mytable WHERE someVal = ? and otherVal = ?', [1, 'val1']);
```


## `connection.batch(sql, values) → Promise`

> * `sql`: *string | JSON* SQL string value or JSON object to supersede default connections options.  JSON objects must have an `"sql"` property.  For instance, `{ dateStrings: true, sql: 'SELECT now()' }`
> * `values`: *array* Array of parameter (array of array or array of object if using named placeholders). 
>
> Returns a promise that :
> * resolves with a JSON object.
> * rejects with an [Error](#error).

Implementation depend of server type and version. 
for MariaDB server version 10.2.7+, implementation use dedicated bulk protocol. 

For other, insert queries will be rewritten for optimization.
example:
insert into ab (i) values (?) with first batch values = 1, second = 2 will be rewritten
insert into ab (i) values (1), (2). 

If query cannot be re-writen will execute a query for each values.

An option `fullResult` permit to indicate if user wants to retrieve individual batch results (in order to retrieve generated ids). 
This might change the performance of bathing if set, depending on server version (for server 11.5.1 and above with [MDEV-30366](https://jira.mariadb.org/browse/MDEV-30366), bulk will be use, or pipelining if not)

For instance,
```javascript
connection.query(
    'CREATE TEMPORARY TABLE batchExample(id int, id2 int, id3 int, t varchar(128), id4 int)'
);
const res = await connection.batch('INSERT INTO `batchExample` values (1, ?, 2, ?, 3)', [
    [1, 'john'],
    [2, 'jack']
]);
console.log(res.affectedRows); // 2
```

## `connection.beginTransaction() → Promise`

>Returns a promise that :
>  * resolves (no argument)
>  * rejects with an [Error](#error).

Begins a new transaction.

## `connection.commit() → Promise`

>Returns a promise that :
>  * resolves (no argument)
>  * rejects with an [Error](#error).

Commits the current transaction, if there is one active.  The Connector tracks the current transaction state on the server.  In the event that you issue the `commit()` method when there's no active transaction, it ignores the method and sends no commands to MariaDB. 


## `connection.release() → Promise`

_When connection comes from pool only_
connection.release() is an async method returning an empty promise success. This function will never throw an error.
default behavior is that if there is a transaction still open, a rollback command will be issued, and connection will be release to pool.

2 options might interfere: 
* `resetAfterUse` when set, connection will completely be reset like a fresh connection
* `noControlAfterUse` when set, no control (rollback or reset) will be done on release

```javascript
const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  await conn.query("INSERT INTO testTransaction values ('test')");
  await conn.query("INSERT INTO testTransaction values ('test2')");
  await conn.commit();
  
} finally {
  conn.release();
}
```

## `connection.rollback() → Promise`

>Returns a promise that :
>  * resolves (no argument)
>  * rejects with an [Error](#error).

Rolls back the current transaction, if there is one active.  The Connector tracks the current transaction state on the server.  In the event that you issue the `rollback()` method when there's no active transaction, it ignores the method and sends no commands to MariaDB. 

```javascript
try {
    
  await conn.beginTransaction();
  await conn.query("INSERT INTO testTransaction values ('test')");
  await conn.query("INSERT INTO testTransaction values ('test2')");
  await conn.commit();
  
} catch(err) {
  await conn.rollback();
}
```
 
## `connection.changeUser(options) → Promise`

> * `options`: *JSON*, subset of [connection option documentation](#connection-options) = database / charset / password / user
>
> Returns a promise that :
>   * resolves without result
>   * rejects with an [Error](#error).

Resets the connection and re-authorizes it using the given credentials.  It is the equivalent of creating a new connection with a new user, reusing the open socket.

```javascript
try {
    await conn.changeUser({
        user: 'changeUser', 
        password: 'mypassword'
    });
    //connection user is now changed. 
} catch (e) {
  // ...  
}
```

## `connection.ping() → Promise`

>Returns a promise that :
>  * resolves (no argument)
>  * rejects with an [Error](#error).

Sends a packet to the database containing one byte to check that the connection is still active.

```javascript
conn.ping()
  .then(() => {
    //connection is valid
  })
  .catch(err => {
    //connection is closed
  })
```

## `connection.reset() → Promise`

>Returns a promise that :
>  * resolves (no argument)
>  * rejects with an [Error](#error).

reset the connection. Reset will:

   * rollback any open transaction
   * reset transaction isolation level
   * reset session variables
   * delete user variables
   * remove temporary tables
   * remove all PREPARE statement
   
This command is only available for MariaDB >=10.2.4 or MySQL >= 5.7.3.
function will be rejected with error "Reset command not permitted for server XXX" if version doesn't permit reset.

For previous MariaDB version, reset connection can be done using [`connection.changeUser(options) → Promise`](#connectionchangeuseroptions--promise) that do the same + redo authentication phase.   

## `connection.isValid() → boolean`

> Returns a boolean

Indicates the connection state as the Connector knows it.  If it returns false, there is an issue with the connection, such as the socket disconnected without the Connector knowing about it.

## `connection.end() → Promise`

>Returns a promise that :
>  * resolves (no argument)
>  * rejects with an [Error](#error).

Closes the connection gracefully, after waiting for any currently executing queries to finish.

```javascript
conn.end()
  .then(() => {
    //connection has ended properly
  })
  .catch(err => {
    //connection was closed but not due of current end command
  })
```


## `connection.destroy()`

Closes the connection without waiting for any currently executing queries.  These queries are interrupted.  MariaDB logs the event as an unexpected socket close.

```javascript
try {
    // long query > 20s
    conn.query(
        'select * from information_schema.columns as c1, information_schema.tables, information_schema.tables as t2'
    );
    conn.destroy(); //will immediately close the connection, before previous command end (no `await` in previous command)
} catch (err) {
    //Error: Connection destroyed, command was killed
    //    ...
    //  fatal: true,
    //  errno: 45004,
    //  sqlState: '08S01',
    //  code: 'ER_CMD_NOT_EXECUTED_DESTROYED'
}
```

## `connection.escape(value) → String`

This function permit to escape a parameter properly according to parameter type to avoid injection. 
See [mariadb String literals](https://mariadb.com/kb/en/library/string-literals/) for escaping. 

Escaping has some limitation :
- doesn't permit [Stream](https://nodejs.org/api/stream.html#stream_readable_streams) parameters
- this is less efficient compare to using standard conn.query(), that will stream data to socket, avoiding string concatenation and using memory unnecessary     

escape per type:
* boolean: explicit `true` or `false`
* number: string representation. ex: 123 => '123'
* Date: String representation using `YYYY-MM-DD HH:mm:ss.SSS` format
* Buffer: _binary'<escaped buffer>'
* object with toSqlString function: String escaped result of toSqlString
* Array: list of escaped value. ex: `[true, "o'o"]` => `('true', 'o\'o')` 
* geoJson: MariaDB transformation to corresponding geotype. ex: `{ type: 'Point', coordinates: [20, 10] }` => `"ST_PointFromText('POINT(20 10)')"`
* JSON: Stringification of JSON, or if `permitSetMultiParamEntries` is enable, key escaped as identifier + value
* String: escaped value, (\u0000, ', ", \b, \n, \r, \t, \u001A, and \ characters are escaped with '\')   

Escape is done for [sql_mode](https://mariadb.com/kb/en/library/sql-mode/) value without NO_BACKSLASH_ESCAPES that disable \ escaping (default);  
Escaping API are meant to prevent [SQL injection](https://en.wikipedia.org/wiki/SQL_injection). However, privilege the use of [`connection.query(sql[, values]) → Promise`](#connectionquerysql-values---promise) and avoid building the command manually.   

```javascript
const myColVar = "let'go";
const myTable = 'table:a'
const cmd = 'SELECT * FROM ' + conn.escapeId(myTable) + ' where myCol = ' + conn.escape(myColVar);
//or using template literals
const cmd2 = `SELECT * FROM ${conn.escapeId(myTable)} where myCol = ${conn.escape(myColVar)}`;
// cmd = cmd2 = "SELECT * FROM `table:a` where myCol = 'let\\'s go'"
```

## `connection.escapeId(value) → String`

This function permit to escape a Identifier properly . See [Identifier Names](https://mariadb.com/kb/en/library/identifier-names/) for escaping. 
Value will be enclosed by '`' character if content doesn't satisfy: 
* ASCII: [0-9,a-z,A-Z$_] (numerals 0-9, basic Latin letters, both lowercase and uppercase, dollar sign, underscore)
* Extended: U+0080 .. U+FFFF
and escaping '`' character if needed. 


```javascript
const myColVar = "let'go";
const myTable = "table:a"
const cmd = 'SELECT * FROM ' + conn.escapeId(myTable) + ' where myCol = ' + conn.escape(myColVar);
// cmd value will be:
// "SELECT * FROM `table:a` where myCol = 'let\\'s go'"

// using template literals:
const res = await con.query(`SELECT * FROM ${con.escapeId(myTable)} where myCol = ?`, [myColVar]); 
```


## `connection.pause()`

Pauses data reads.

## `connection.resume()`

Resumes data reads from a pause. 


## `connection.serverVersion()` 

> Returns a string 

Retrieves the version of the currently connected server.  Throws an error when not connected to a server.

```javascript
  console.log(connection.serverVersion()); //10.2.14-MariaDB
```


## `connection.importFile(options) → Promise`

> * `options` *JSON*: 
> ** file: <string> file path (mandatory)
> ** database: <string> database if different that current connection database (optional)
>
> Returns a promise that :
>   * resolves without result
>   * rejects with an [Error](#error).

Import sql file. If database is set, database will be use, then after file import, database will be reverted

```javascript
try {
    await conn.importFile({
        file: '/tmp/someFile.sql', 
        database: 'myDb'
    });
} catch (e) {
  // ...  
}
```

## `Error`

When the Connector encounters an error, Promise returns an [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error) object. In addition to the standard properties, this object has the following properties:

* `fatal`: A boolean value indicating whether the connection remains valid.
* `errno`: The error number corresponding to the MariaDB/MySQL error code.
* `sqlState`: The SQL state code following the ANSI SQL standard.
* `code`: The error code as a string identifier.

### Error handling best practices

When working with the MariaDB connector, implementing proper error handling is crucial for building robust applications. Here are some recommended practices:

#### 1. Always use try/catch with async/await

```javascript
async function executeQuery() {
  let connection;
  try {
    connection = await mariadb.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'password'
    });
    
    return await connection.query('SELECT * FROM users WHERE id = ?', [userId]);
  } catch (err) {
    // Log the error with all available information
    console.error('Database error:', {
      message: err.message,
      code: err.code,
      sqlState: err.sqlState,
      query: err.sql,
      fatal: err.fatal
    });
    
    // Rethrow or handle appropriately based on error type
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      throw new Error('Database authentication failed');
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      throw new Error('Database does not exist');
    } else {
      throw new Error('An unexpected database error occurred');
    }
  } finally {
    // Always close the connection to avoid leaks
    if (connection) await connection.end();
  }
}
```

#### 2. Check for specific error codes

The connector provides detailed error information that you can use to handle specific error scenarios:

```javascript
try {
  await connection.query('INSERT INTO users (email) VALUES (?)', [email]);
} catch (err) {
  if (err.code === 'ER_DUP_ENTRY') {
    // Handle duplicate email error
    return { success: false, message: 'Email already registered' };
  }
  // Handle other errors
  throw err;
}
```

#### 3. Distinguish between fatal and non-fatal errors

The `fatal` property indicates whether the connection is still usable:

```javascript
try {
  await connection.query('SELECT * FROM nonexistent_table');
} catch (err) {
  if (err.fatal) {
    // Connection is no longer usable
    console.error('Fatal error, connection lost:', err.message);
    // Reconnect or fail gracefully
  } else {
    // Connection is still valid despite the error
    console.error('Non-fatal error:', err.message);
    // Continue using the same connection
  }
}
```

### Error example

Here's an example of what an error object might look like when logged:

```
{
  Error: (conn:116, no: 1146, SQLState: 42S02) Table 'testdb.nonexistent_table' doesn't exist
  sql: SELECT * FROM nonexistent_table - parameters:[]
  at Socket.Readable.push (_stream_readable.js:134:10)
  at TCP.onread (net.js:559:20)
  From event:
  at Connection.query (/path/to/mariadb-connector-nodejs/lib/connection.js:183:12)
  at async function (/path/to/your/app.js:25:16)
  fatal: false,
  errno: 1146,
  sqlState: '42S02',
  code: 'ER_NO_SUCH_TABLE'
}
```

When the `trace` option is enabled, errors include the original stack trace, which helps identify where in your code the query was executed.

For a complete list of error codes and their meanings, see the [MariaDB Error Codes](https://mariadb.com/kb/en/library/mariadb-error-codes/) documentation.

## `events`

Connection object that inherits from the Node.js [`EventEmitter`](https://nodejs.org/api/events.html).  Emits an error event when the connection closes unexpectedly.

```javascript

const conn = await mariadb.createConnection({
    user: 'root', 
    password: 'myPwd', 
    host: 'localhost', 
    socketTimeout: 100
});

conn.on('error', err => {
  //will be executed after 100ms due to inactivity, socket has closed. 
  console.log(err);
  //log : 
  //{ Error: (conn:6283, no: 45026, SQLState: 08S01) socket timeout
  //    ...
  //    at Socket.emit (events.js:208:7)
  //    at Socket._onTimeout (net.js:410:8)
  //    at ontimeout (timers.js:498:11)
  //    at tryOnTimeout (timers.js:323:5)
  //    at Timer.listOnTimeout (timers.js:290:5)
  //  fatal: true,
  //  errno: 45026,
  //  sqlState: '08S01',
  //  code: 'ER_SOCKET_TIMEOUT' }
});

```


# Pool API

A connection pool is a cache of database connections maintained so that connections can be reused when future requests to the database are required. Connection pools are used to enhance the performance of executing commands on a database.

## Pool overview

Each time a connection is requested, if the pool contains an available connection, the pool will validate the connection by exchanging an empty MySQL packet with the server to ensure the connection is still valid, then provide the connection. 

The pool reuses connections intensively to improve performance. This validation is only performed if a connection has been idle for a period (specified by the `minDelayValidation` option, which defaults to 500ms).

If no connection is available, the request will be queued until either:
- A connection becomes available (through creation or release)
- The connection timeout (`acquireTimeout`) is reached

When a connection is released back to the pool, any remaining transactions will be automatically rolled back to ensure a clean state for the next use.

## `pool.getConnection() → Promise`

> * Returns a promise that:
>   * resolves with a [Connection](#connection-api) object
>   * rejects with an [Error](#error)

Retrieves a connection from the pool. If the pool is at its connection limit, the promise will wait until a connection becomes available or the `acquireTimeout` is reached.

**Example: Using a pooled connection with transactions**

```javascript
// Create a pool
const pool = mariadb.createPool({
  host: 'localhost',
  user: 'root',
  password: 'password',
  connectionLimit: 5
});

async function transferFunds(fromAccount, toAccount, amount) {
  let conn;
  try {
    // Get a connection from the pool
    conn = await pool.getConnection();
    
    // Use the connection for a transaction
    await conn.query("START TRANSACTION");
    
    // Verify sufficient funds
    const [account] = await conn.query(
      "SELECT balance FROM accounts WHERE id = ? FOR UPDATE", 
      [fromAccount]
    );
    
    if (account.balance < amount) {
      await conn.query("ROLLBACK");
      return { success: false, message: "Insufficient funds" };
    }
    
    // Perform the transfer
    await conn.query(
      "UPDATE accounts SET balance = balance - ? WHERE id = ?", 
      [amount, fromAccount]
    );
    await conn.query(
      "UPDATE accounts SET balance = balance + ? WHERE id = ?", 
      [amount, toAccount]
    );
    
    // Commit the transaction
    await conn.query("COMMIT");
    return { success: true, message: "Transfer completed" };
    
  } catch (err) {
    // Handle errors
    if (conn) await conn.query("ROLLBACK");
    console.error('Transaction failed:', err);
    return { success: false, error: err.message };
  } finally {
    // Always release the connection back to the pool
    if (conn) conn.release();
  }
}
```

## `pool.query(sql[, values]) → Promise`

> * `sql`: *string | JSON* SQL string or JSON object with query options
> * `values`: *array | object* Placeholder values
>
> Returns a promise that:
> * resolves with query results (same as [connection.query()](#connectionquerysql-values---promise))
> * rejects with an [Error](#error)

Executes a query using a connection from the pool. The connection is automatically acquired and released, making this method ideal for simple queries.

**Example: Simple query with error handling**

```javascript
// Simple query using the pool directly
async function getProductsByCategory(category) {
  try {
    const rows = await pool.query(
      'SELECT * FROM products WHERE category = ? ORDER BY price ASC', 
      [category]
    );
    
    console.log(`Found ${rows.length} products in ${category} category`);
    return {
      success: true,
      count: rows.length,
      products: rows
    };
  } catch (err) {
    console.error('Query failed:', err);
    return {
      success: false,
      error: err.message
    };
  }
}
```

**Example: Using query options**

```javascript
async function getRecentOrders(options) {
  try {
    const rows = await pool.query({
      sql: 'SELECT * FROM orders WHERE created_at > ? LIMIT ?',
      values: [options.since, options.limit || 10],
      dateStrings: true,  // Return dates as strings
      nestTables: true    // Group results by table
    });
    
    return rows;
  } catch (err) {
    console.error('Failed to fetch recent orders:', err);
    throw err;
  }
}
```

## `pool.batch(sql, values) → Promise`

> * `sql`: *string | JSON* SQL string or JSON object with query options
> * `values`: *array* Array of parameter sets (array of arrays or array of objects for named placeholders)
>
> Returns a promise that:
> * resolves with batch operation results
> * rejects with an [Error](#error)

Executes a batch operation using a connection from the pool. The pool automatically handles connection acquisition and release.

For MariaDB server version 10.2.7+, this implementation uses a dedicated bulk protocol for improved performance.

**Example: Batch insert with generated IDs**

```javascript
async function addMultipleUsers(users) {
  try {
    // Format user data for batch insert
    const userValues = users.map(user => [
      user.name,
      user.email,
      user.password,
      user.created_at || new Date()
    ]);
    
    const result = await pool.batch({
      sql: 'INSERT INTO users(name, email, password, created_at) VALUES (?, ?, ?, ?)',
      fullResult: true  // To get individual results with generated IDs
    }, userValues);
    
    console.log(`Added ${result.affectedRows} users`);
    return {
      success: true,
      insertCount: result.affectedRows,
      insertIds: result.map(r => r.insertId)
    };
  } catch (err) {
    console.error('Batch user creation failed:', err);
    return {
      success: false,
      error: err.message
    };
  }
}
```

## `pool.end() → Promise`

> Returns a promise that:
> * resolves when all connections are closed
> * rejects with an [Error](#error) if closing fails

Gracefully closes all connections in the pool and ends the pool. This should be called when your application is shutting down to ensure all database resources are properly released.

**Example: Application shutdown handler**

```javascript
// Application shutdown handler
async function gracefulShutdown() {
  console.log('Application shutting down...');
  
  try {
    // Close database pool
    console.log('Closing database connections...');
    await pool.end();
    console.log('All database connections closed successfully');
    
    // Close other resources
    // ...
    
    console.log('Shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
```

## `pool.escape(value) → String`
This is an alias for [`connection.escape(value) → String`](#connectionescapevalue--string) to escape parameters when building queries manually.

**Example:**
```javascript
const userId = "user's-id";
const query = `SELECT * FROM users WHERE id = ${pool.escape(userId)}`;
// query = "SELECT * FROM users WHERE id = 'user\\'s-id'"
```

## `pool.escapeId(value) → String`
This is an alias for [`connection.escapeId(value) → String`](#connectionescapeidvalue--string) to escape identifiers like table or column names.

**Example:**
```javascript
const tableName = "user-data";
const columnName = "last-login";
const query = `SELECT ${pool.escapeId(columnName)} FROM ${pool.escapeId(tableName)}`;
// query = "SELECT `last-login` FROM `user-data`"
```

## `pool.importFile(options) → Promise`

> * `options` <JSON>:
>   * `file`: <string> file path (mandatory)
>   * `database`: <string> database if different from current connection database (optional)
>
> Returns a promise that:
>   * resolves without result
>   * rejects with an [Error](#error)

Imports an SQL file. If a database is specified, it will be used for the import and then reverted to the original database afterward.

**Example: Import a database dump**

```javascript
async function importDatabaseDump(filePath, targetDatabase) {
  try {
    await pool.importFile({
      file: filePath,
      database: targetDatabase
    });
    console.log(`Successfully imported ${filePath} into ${targetDatabase}`);
    return { success: true };
  } catch (err) {
    console.error(`Import failed: ${err.message}`);
    return { 
      success: false, 
      error: err.message 
    };
  }
}
```

## Pool events

The pool object inherits from Node.js [EventEmitter](https://nodejs.org/api/events.html) and emits the following events:

### `acquire`

Emitted when a connection is acquired from the pool.

```javascript
pool.on('acquire', (connection) => {
  console.log(`Connection ${connection.threadId} acquired from pool`);
});
```

### `connection`

Emitted when a new connection is created within the pool.

```javascript
pool.on('connection', (connection) => {
  console.log(`New connection ${connection.threadId} created in pool`);
  
  // You can initialize connections with specific settings
  connection.query("SET SESSION time_zone='+00:00'");
  connection.query("SET SESSION sql_mode='STRICT_TRANS_TABLES,NO_ZERO_IN_DATE'");
});
```

### `release`

Emitted when a connection is released back to the pool.

```javascript
pool.on('release', (connection) => {
  console.log(`Connection ${connection.threadId} released back to pool`);
});
```

### `error`

Emitted when an error occurs in the pool, such as failure to create a connection.

```javascript
pool.on('error', (err) => {
  console.error('Pool error:', err);
  // Implement monitoring or recovery logic
  notifyAdministrator(`Database pool error: ${err.message}`);
});
```

## Pool monitoring methods

The pool provides several methods to monitor its state:

```javascript
// Get current number of active connections
const active = pool.activeConnections(); 

// Get total number of connections (used and unused)
const total = pool.totalConnections();  

// Get current number of unused connections
const idle = pool.idleConnections();    

// Get size of pending connection requests queue
const queued = pool.taskQueueSize();   

console.log(`Pool status: ${active}/${total} connections active, ${idle} idle, ${queued} requests queued`);
```

## Pool best practices

1. **Right-size your connection pool**:
   - Set `connectionLimit` based on your application's concurrency needs and database server capacity
   - Too few connections can create bottlenecks
   - Too many connections can overload the database server
   - Start with a connection limit of 10-20 and adjust based on performance testing

2. **Handle connection leaks**:
   ```javascript
   const pool = mariadb.createPool({
     // ...connection options
     connectionLimit: 10,
     leakDetectionTimeout: 30000  // Log potential leaks after 30 seconds
   });
   ```

3. **Always release connections**:
   ```javascript
   let conn;
   try {
     conn = await pool.getConnection();
     // Use connection...
   } catch (err) {
     // Handle error...
   } finally {
     if (conn) conn.release();  // Always release in finally block
   }
   ```

4. **Use connection validation wisely**:
   ```javascript
   const pool = mariadb.createPool({
     // ...connection options
     minDelayValidation: 500,  // Only validate connections unused for 500ms
     pingTimeout: 1000         // Timeout for ping validation
   });
   ```

5. **Prefer pool.query() for simple operations**:
   - For single queries, use `pool.query()` instead of manually acquiring and releasing connections
   - Only use `getConnection()` when you need to maintain context across multiple queries

6. **Implement proper error handling**:
   - Listen for 'error' events on the pool
   - Implement reconnection strategies for fatal errors
   - Consider using a circuit breaker pattern for persistent database issues

7. **Close the pool during application shutdown**:
   - Always call `pool.end()` when your application terminates
   - Use process signal handlers (SIGINT, SIGTERM) to ensure proper cleanup

# Pool cluster API

A pool cluster manages multiple database connection pools and provides high availability and load balancing capabilities. It allows your application to:

- Connect to multiple database servers (for primary/replica setups)
- Automatically handle failover if a database server goes down
- Distribute queries across multiple servers
- Group servers by pattern for targeted operations

## Pool cluster overview

The cluster manages a collection of connection pools, each identified by a name. You can select pools using pattern matching and specify different load balancing strategies (selectors) to determine which pool to use for each connection request.

When a connection fails, the cluster can automatically retry with another pool matching the same pattern. If a pool fails consistently, it can be temporarily blacklisted or even removed from the cluster configuration.

## `createPoolCluster(options) → PoolCluster`

> * `options`: *JSON* [poolCluster options](#poolcluster-options)
>
> Returns a [PoolCluster](#poolcluster-api) object

Creates a new pool cluster to manage multiple database connection pools.

**Example: Creating a basic primary/replica setup**

```javascript
const mariadb = require('mariadb');

// Create the cluster
const cluster = mariadb.createPoolCluster({
  removeNodeErrorCount: 5,      // Remove a node after 5 consecutive connection failures
  restoreNodeTimeout: 1000,     // Wait 1 second before trying a failed node again
  defaultSelector: 'ORDER'      // Use nodes in order (first working node in the list)
});

// Add database nodes to the cluster
cluster.add('primary', {
  host: 'primary-db.example.com', 
  user: 'app_user',
  password: 'password',
  connectionLimit: 10
});

cluster.add('replica1', {
  host: 'replica1-db.example.com', 
  user: 'app_user',
  password: 'password',
  connectionLimit: 20
});

cluster.add('replica2', {
  host: 'replica2-db.example.com', 
  user: 'app_user',
  password: 'password',
  connectionLimit: 20
});
```

## `poolCluster.add(id, config)`

> * `id`: *string* node identifier. Example: `'primary'`, `'replica1'`
> * `config`: *JSON* [pool options](#pool-options) to create the pool
>
> Returns: void

Adds a new connection pool to the cluster with the specified identifier and configuration.

**Example: Adding nodes with descriptive identifiers**

```javascript
// Create an empty cluster
const cluster = mariadb.createPoolCluster();

// Add a primary database node
cluster.add('primary', {
  host: 'primary-db.example.com',
  user: 'app_user',
  password: 'password',
  connectionLimit: 10
});

// Add multiple read-only replica nodes
cluster.add('replica-east', {
  host: 'replica-east.example.com',
  user: 'readonly_user',
  password: 'password',
  connectionLimit: 20
});

cluster.add('replica-west', {
  host: 'replica-west.example.com',
  user: 'readonly_user',
  password: 'password',
  connectionLimit: 20
});
```

## `poolCluster.remove(pattern)`

> * `pattern`: *string* Regex pattern to select pools. Example: `'replica*'`
>
> Returns: void

Removes and ends all pools whose identifiers match the specified pattern.

**Example: Removing nodes from the cluster**

```javascript
// Create a cluster with multiple nodes
const cluster = mariadb.createPoolCluster();
cluster.add('primary', { host: 'primary-db.example.com', user: 'app_user' });
cluster.add('replica1', { host: 'replica1.example.com', user: 'readonly_user' });
cluster.add('replica2', { host: 'replica2.example.com', user: 'readonly_user' });
cluster.add('analytics', { host: 'analytics-db.example.com', user: 'analytics_user' });

// Later, remove all replica nodes
cluster.remove('replica*');

// Remove a specific node
cluster.remove('analytics');
```

## `poolCluster.getConnection([pattern], [selector]) → Promise`

> * `pattern`: *string* Regex pattern to select pools. Default: `'*'` (all pools)
> * `selector`: *string* Selection strategy: 'RR' (round-robin), 'RANDOM', or 'ORDER'. Default: value of the `defaultSelector` option
>
> Returns a promise that:
> * resolves with a [Connection](#connection-api) object
> * rejects with an [Error](#error)

Gets a connection from a pool in the cluster that matches the pattern using the specified selection strategy.

**Example: Using different selectors for different connection patterns**

```javascript
async function executeQuery(sql, params) {
  let conn;
  
  try {
    // For write operations, always use the primary
    if (sql.toLowerCase().startsWith('insert') || 
        sql.toLowerCase().startsWith('update') || 
        sql.toLowerCase().startsWith('delete')) {
      conn = await cluster.getConnection('primary');
    } 
    // For read operations, use round-robin among replicas
    else {
      conn = await cluster.getConnection('replica*', 'RR');
    }
    
    const result = await conn.query(sql, params);
    return result;
  } finally {
    if (conn) conn.release();
  }
}

// Usage
const users = await executeQuery('SELECT * FROM users WHERE status = ?', ['active']);
await executeQuery('UPDATE users SET last_login = NOW() WHERE id = ?', [userId]);
```

**Example: Handling failover gracefully**

```javascript
async function executeQueryWithRetry(sql, params, maxRetries = 3) {
  let attempts = 0;
  let lastError;
  
  while (attempts < maxRetries) {
    let conn;
    attempts++;
    
    try {
      conn = await cluster.getConnection('*', 'ORDER');  // Try nodes in order
      const result = await conn.query(sql, params);
      return result;
    } catch (err) {
      lastError = err;
      console.warn(`Query attempt ${attempts} failed:`, err.message);
      
      // Only retry on connection errors, not query syntax errors
      if (!err.fatal) throw err;
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
      if (conn) conn.release();
    }
  }
  
  throw new Error(`All ${maxRetries} query attempts failed. Last error: ${lastError.message}`);
}
```

## `poolCluster.of(pattern, [selector]) → FilteredPoolCluster`

> * `pattern`: *string* Regex pattern to select pools. Example: `'replica*'`
> * `selector`: *string* Selection strategy: 'RR' (round-robin), 'RANDOM', or 'ORDER'
>
> Returns a [FilteredPoolCluster](#filteredpoolcluster) object

Creates a new filtered pool cluster that only includes pools matching the specified pattern. This allows you to create specialized interfaces for different database roles.

**Example: Creating dedicated interfaces for read and write operations**

```javascript
// Create interfaces for different database roles
const primaryPool = cluster.of('primary');  // Only the primary node
const replicaPool = cluster.of('replica*', 'RANDOM');  // All replicas with random selection

async function readData(userId) {
  let conn;
  try {
    // Get connection from any replica randomly
    conn = await replicaPool.getConnection();
    return await conn.query('SELECT * FROM users WHERE id = ?', [userId]);
  } finally {
    if (conn) conn.release();
  }
}

async function writeData(userData) {
  let conn;
  try {
    // Always write to primary
    conn = await primaryPool.getConnection();
    await conn.query('INSERT INTO users SET ?', userData);
    return { success: true };
  } finally {
    if (conn) conn.release();
  }
}
```

## `poolCluster.end() → Promise`

> Returns a promise that:
> * resolves when all pools in the cluster are closed
> * rejects with an [Error](#error) if closing fails

Gracefully closes all connection pools in the cluster.

**Example: Application shutdown with clustered connections**

```javascript
// Application shutdown handler
async function gracefulShutdown() {
  console.log('Application shutting down...');
  
  try {
    // Close database connection pool cluster
    console.log('Closing database connections...');
    await cluster.end();
    console.log('All database connections closed successfully');
    
    // Close other resources
    // ...
    
    console.log('Shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
```

## FilteredPoolCluster

A filtered pool cluster is a subset of the main cluster that only includes pools matching a specific pattern. It provides a simplified interface for working with logically grouped database nodes.

### `filteredPoolCluster.getConnection() → Promise`

> Returns a promise that:
> * resolves with a [Connection](#connection-api) object
> * rejects with an [Error](#error)

Gets a connection from one of the pools in the filtered cluster using the selector specified when the filtered cluster was created.

**Example:**

```javascript
// Create a filtered cluster with only replica nodes
const replicas = cluster.of('replica*', 'RR');  // Round-robin among replicas

async function getReadOnlyData() {
  let conn;
  try {
    // This will automatically use round-robin selection among replica nodes
    conn = await replicas.getConnection();
    return await conn.query('SELECT * FROM some_large_table LIMIT 1000');
  } finally {
    if (conn) conn.release();
  }
}
```

### `filteredPoolCluster.query(sql[, values]) → Promise`

> * `sql`: *string | JSON* SQL string or JSON object with query options
> * `values`: *array | object* Placeholder values
>
> Returns a promise that:
> * resolves with query results
> * rejects with an [Error](#error)

Shorthand method to get a connection from the filtered cluster, execute a query, and release the connection.

**Example:**

```javascript
// Create filtered clusters for different roles
const primary = cluster.of('primary');
const replicas = cluster.of('replica*', 'RR');

// Read from replicas using the shorthand query method
async function getUserById(id) {
  try {
    return await replicas.query('SELECT * FROM users WHERE id = ?', [id]);
  } catch (err) {
    console.error('Failed to get user:', err);
    throw err;
  }
}

// Write to primary
async function updateUserStatus(id, status) {
  try {
    return await primary.query(
      'UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );
  } catch (err) {
    console.error('Failed to update user status:', err);
    throw err;
  }
}
```

## Pool Cluster Events

The pool cluster inherits from Node.js [EventEmitter](https://nodejs.org/api/events.html) and emits the following events:

### `remove`

Emitted when a node is removed from the cluster configuration. This happens when a node fails to connect more than `removeNodeErrorCount` times (if this option is defined).

```javascript
cluster.on('remove', (nodeId) => {
  console.warn(`Database node '${nodeId}' has been removed from the cluster`);
  
  // You might want to send alerts or trigger monitoring
  notifyAdministrators(`Database node ${nodeId} has been removed from the cluster due to repeated connection failures`);
});
```

## Selection Strategies

The pool cluster supports three different selection strategies for choosing which database node to use:

1. **Round-Robin (`'RR'`)**: Uses pools in rotation, ensuring an even distribution of connections.
2. **Random (`'RANDOM'`)**: Selects a random pool for each connection request.
3. **Order (`'ORDER'`)**: Always tries pools in sequence, using the first available one. Useful for primary/fallback setups.

## Pool Cluster Best Practices

1. **Use meaningful node identifiers**:
   - Choose clear identifiers that indicate the node's role (e.g., 'primary', 'replica1')
   - This makes pattern matching more intuitive and maintenance easier

2. **Implement role-based access with patterns**:
   ```javascript
   // Direct write operations to primary
   const primary = cluster.of('primary');
   
   // Direct read operations to replicas
   const replicas = cluster.of('replica*', 'RR');
   
   async function saveData(data) {
     // Writes go to primary
     return await primary.query('INSERT INTO table SET ?', [data]);
   }
   
   async function getData(id) {
     // Reads come from replicas
     return await replicas.query('SELECT * FROM table WHERE id = ?', [id]);
   }
   ```

3. **Use appropriate selectors for different scenarios**:
   - `'ORDER'` for high availability with failover (tries primary first, then fallbacks)
   - `'RR'` for load balancing across equivalent nodes (like replicas)
   - `'RANDOM'` when pure distribution is needed

4. **Configure node removal thresholds appropriately**:
   ```javascript
   const cluster = mariadb.createPoolCluster({
     removeNodeErrorCount: 5,    // Remove after 5 consecutive failures
     restoreNodeTimeout: 10000,  // Wait 10 seconds before retrying failed nodes
     canRetry: true              // Enable retry on different nodes
   });
   ```

5. **Monitor removed nodes**:
   ```javascript
   // Track cluster health
   let clusterHealth = {
     removedNodes: [],
     lastIncident: null
   };
   
   cluster.on('remove', (nodeId) => {
     clusterHealth.removedNodes.push(nodeId);
     clusterHealth.lastIncident = new Date();
     
     // Alert operations team
     alertOps(`Database node ${nodeId} removed from cluster at ${clusterHealth.lastIncident}`);
   });
   ```

6. **Implement graceful degradation**:
   - Design your application to function with reduced capabilities when some nodes are unavailable
   - Use fallback strategies when specific node patterns become unavailable

7. **Always close the cluster during application shutdown**:
   - Call `cluster.end()` to properly release all resources
   - Use process signal handlers to ensure cleanup
