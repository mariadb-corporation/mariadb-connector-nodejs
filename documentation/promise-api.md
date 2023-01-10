
# Documentation

There are two different connection implementation: one, the default, uses Promise and the other uses Callback, allowing for compatibility with the mysql and mysql2 API's.  

The documentation provided on this page is the promise API (default).  
If you want information on the Callback API, see the  [CALLBACK API](./callback-api.md). 


## Quick Start

Install the mariadb Connector using npm

```
$ npm install mariadb
```

You can then use the Connector in your application code with the Promise API.  For instance,

```js
const mariadb = require('mariadb');

async function asyncFunction() {
 const conn = await mariadb.createConnection({
  host: 'mydb.com',
  user: 'myUser',
  password: 'myPwd'
 });

 try {
  const res = await conn.query('select 1', [2]);
  console.log(res); // [{ "1": 1 }]
  return res;
 } finally {
  conn.end();
 }
}

asyncFunction();
```

# Installation

In order to use the Connector you first need to install it on your system.  The installation process for Promise and Callback API's is managed with the same package through npm. 

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

|option|description|type|default| 
|---:|---|:---:|:---:| 
| **insertIdAsNumber** | Whether the query should return last insert id from INSERT/UPDATE command as BigInt or Number. default return BigInt |*boolean* | false |
| **decimalAsNumber** | Whether the query should return decimal as Number. If enabled, this might return approximate values. |*boolean* | false |
| **bigIntAsNumber** | Whether the query should return BigInt data type as Number. If enabled, this might return approximate values. |*boolean* | false |
| **checkNumberRange** | when used in conjunction of decimalAsNumber, insertIdAsNumber or bigIntAsNumber, if conversion to number is not exact, connector will throw an error (since 3.0.1) |*function*| |

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

It is recommended to activate the `trace` option in development
Since driver is asynchronous, enabling this option permits to save initial stack when calling any driver methods.
This allows to have interesting debugging information: 
example:
```js
const pool = mariadb.createPool({
  host: 'mydb.com',
  user: 'myUser',
  connectionLimit: 5
});
await pool.query('wrong query');
/* will throw an error like : 
  SqlError: (conn=15868, no: 1064, SQLState: 42000) You have an error in your SQL syntax; check the manual that corresponds to your MariaDB server version for the right syntax to use near 'wrong query' at line 1
sql: wrong query - parameters:[]
    at Object.module.exports.createError (C:\temp\mariadb-connector-nodejs2\lib\misc\errors.js:57:10)
    at ...
  text: "You have an error in your SQL syntax; check the manual that corresponds to your MariaDB server version for the right syntax to use near 'wrong query' at line 1",
  sql: 'wrong query - parameters:[]',
  fatal: false,
  errno: 1064,
  sqlState: '42000',
  code: 'ER_PARSE_ERROR'
}*/
```
Same example but with pool trace 
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
The caller method and line are now in error stack, permitting error easy debugging.

The problem is this error stack is created using [Error.captureStackTrace](https://nodejs.org/api/errors.html#errorcapturestacktracetargetobject-constructoropt) that is very very slow. 
To give an idea, this slows down by 10% a query like 'select * from mysql.user LIMIT 1', so not recommended in production.

### Timezone consideration

Client and database can have a different timezone.

The connector has different solutions when this is the case.
the `timezone` option can have the following value:
* 'local' (default) : connector doesn't do any conversion. If the database has a different timezone, there will be an offset issue. 
* 'auto' : connector retrieve server timezone. Dates will be converted if server timezone differs from client
* IANA timezone / offset, example 'America/New_York' or '+06:00'. 

##### IANA timezone / offset

When using IANA timezone, the connector will set the connection timezone to the timezone. 
this can throw an error on connection if timezone is unknown by the server (see [mariadb timezone documentation](https://mariadb.com/kb/en/time-zones/), timezone tables might be not initialized)
If you are sure the server is using that timezone, this step can be skipped with the option `skipSetTimezone`.

If timezone correspond to javascript default timezone, then no conversion will be done

##### Timezone setting recommendation.
The best is to have the same timezone on client and database, then keep the 'local' default value. 

If different, then either client or server has to convert date. 
In general, that is best to use client conversion, to avoid putting any unneeded stress on the database. 
timezone has to be set to the IANA timezone corresponding to server timezone and disabled `skipSetTimezone` option since you are sure that the server has the corresponding timezone.

example: client use 'America/New_York' by default, and server 'America/Los_Angeles'.
execute 'SELECT @@system_time_zone' on the server. that will give the server default timezone. 
the server can return POSIX timezone like 'PDT' (Pacific Daylight Time). 
IANA timezone correspondence must be found :   (see [IANA timezone List](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones)) and configure client-side. 
This will ensure DST (automatic date saving time change will be handled) 

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
using code like : 
```js
const conn = await mariadb.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PWD
});
```
Then for example, run node.js setting those environment variable :
```
$ DB_HOST=localhost DB_USER=test DB_PASSWORD=secretPasswrd node my-app.js
```

Another solution is using `dotenv` package. Dotenv loads environment variables from .env files into the process.env variable in Node.js :
```
$ npm install dotenv
```

then configure dotenv to load all .env files
 
```js
require('dotenv').config();

const conn = await mariadb.createConnection({
 host: process.env.DB_HOST,
 user: process.env.DB_USER,
 password: process.env.DB_PWD
});
```

with a .env file containing
```
DB_HOST=localhost
DB_USER=test
DB_PWD=secretPasswrd
```
.env files must NOT be pushed into repository,  using .gitignore


### Default options consideration

For new project, enabling option `supportBigInt` is recommended (It will be in a future 3.x version).

This option permits to avoid exact value for big integer (value > 2^53) (see [javascript ES2020 
BigInt](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt) ) 


# Promise API

**Base:**

* [`createConnection(options) → Promise`](#createconnectionoptions--promise) : Creates a new connection.
* [`createPool(options) → Pool`](#createpooloptions--pool) : Creates a new Pool.
* [`createPoolCluster(options) → PoolCluster`](#createpoolclusteroptions--poolcluster) : Creates a new pool cluster.
* [`version → String`](#version--string) : Return library version.
* [`defaultOptions(options) → Json`](#defaultoptionsoptions--json) : list options with default values
  

**Connection:** 

* [`connection.query(sql[, values]) → Promise`](#connectionquerysql-values---promise): Executes a query.
* [`connection.queryStream(sql[, values]) → Emitter`](#connectionquerystreamsql-values--emitter): Executes a query, returning an emitter object to stream rows.
* [`connection.prepare(sql) → Promise`](#connectionpreparesql--promise): Prepares a query.
* [`connection.execute(sql[, values]) → Promise`](#connectionexecutesql-values--promise): Prepare and Executes a query.
* [`connection.batch(sql, values) → Promise`](#connectionbatchsql-values--promise): fast batch processing.
* [`connection.beginTransaction() → Promise`](#connectionbegintransaction--promise): Begins a transaction.
* [`connection.commit() → Promise`](#connectioncommit--promise): Commits the current transaction, if any.
* [`connection.release() → Promise`](#connectionrelease--promise): Release connection to pool if connection comes from pool.
* [`connection.rollback() → Promise`](#connectionrollback--promise): Rolls back the current transaction, if any.
* [`connection.changeUser(options) → Promise`](#connectionchangeuseroptions--promise): Changes the current connection user.
* [`connection.ping() → Promise`](#connectionping--promise): Sends a 1 byte packet to the database to validate the connection.
* [`connection.reset() → Promise`](#connectionreset--promise): reset current connection state.
* [`connection.isValid() → boolean`](#connectionisvalid--boolean): Checks that the connection is active without checking socket state.
* [`connection.end() → Promise`](#connectionend--promise): Gracefully close the connection.
* [`connection.destroy()`](#connectiondestroy): Forces the connection to close. 
* [`connection.escape(value) → String`](#connectionescapevalue--string): escape parameter 
* [`connection.escapeId(value) → String`](#connectionescapeidvalue--string): escape identifier 
* [`connection.pause()`](#connectionpause): Pauses the socket output.
* [`connection.resume()`](#connectionresume): Resumes the socket output.
* [`connection.serverVersion()`](#connectionserverversion): Retrieves the current server version.
* [`events`](#events): Subscribes to connection error events.

**Pool:**

* [`pool.getConnection() → Promise`](#poolgetconnection--promise) : Creates a new connection.
* [`pool.query(sql[, values]) → Promise`](#poolquerysql-values---promise): Executes a query.
* [`pool.batch(sql, values) → Promise`](#poolbatchsql-values---promise): Executes a batch
* [`pool.end() → Promise`](#poolend--promise): Gracefully closes the connection.
* [`pool.escape(value) → String`](#poolescapevalue--string): escape parameter 
* [`pool.escapeId(value) → String`](#poolescapeidvalue--string): escape identifier 
* `pool.activeConnections() → Number`: Gets current active connection number.
* `pool.totalConnections() → Number`: Gets current total connection number.
* `pool.idleConnections() → Number`: Gets current idle connection number.
* `pool.taskQueueSize() → Number`: Gets current stacked request.
* [`pool events`](#pool-events): Subscribes to pool events.

**PoolCluster**

* [`poolCluster.add(id, config)`](#poolclusteraddid-config) : add a pool to cluster.
* [`poolCluster.remove(pattern)`](#poolclusterremovepattern) : remove and end pool according to pattern.
* [`poolCluster.end() → Promise`](#poolclusterend--promise) : end cluster.
* [`poolCluster.getConnection(pattern, selector) → Promise`](#poolclustergetconnectionpattern-selector--promise) : return a connection from cluster.
* [`poolCluster.of(pattern, selector) → FilteredPoolCluster`](#poolclusterofpattern-selector--filteredpoolcluster) : return a subset of cluster.
* [`poolCluster events`](#poolcluster-events): Subscribes to pool cluster events.


# Base API

## `createConnection(options) → Promise`

> * `options`: *JSON/String* [connection option documentation](#connection-options)
>
> Returns a promise that :
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
  console.log("connected ! connection id is " + conn.threadId);
} catch (err) {
  console.log("not connected due to error: " + err);
}
```

### Connection options

Essential options list:

|option|description|type|default| 
|---:|---|:---:|:---:| 
| **`user`** | User to access database. |*string* | 
| **`password`** | User password. |*string* | 
| **`host`** | IP address or DNS of the database server. *Not used when using option `socketPath`*. |*string*| "localhost"|
| **`port`** | Database server port number. *Not used when using option `socketPath`*|*integer*| 3306|
| **`ssl`** | Enables TLS support. For more information, see the [`ssl` option](/documentation/connection-options.md#ssl) documentation. |*mixed*|
| **`database`** | Default database to use when establishing the connection. | *string* | 
| **`socketPath`** | Permits connections to the database through the Unix domain socket or named pipe. |  *string* | 
| **`compress`** | Compresses the exchange with the database through gzip.  This permits better performance when the database is not in the same location.  |*boolean*| false|
| **`connectTimeout`** | Sets the connection timeout in milliseconds. |*integer* | 1 000|
| **`socketTimeout`** | Sets the socket timeout in milliseconds after connection succeeds. A value of `0` disables the timeout. |*integer* | 0|
| **`queryTimeout`** | Set maximum query time in ms (an error will be thrown if limit is reached). 0 or undefined meaning no timeout. This can be superseded for a query using [`timeout`](https://github.com/mariadb-corporation/mariadb-connector-nodejs/blob/master/documentation/promise-api.md#timeout) option|*int* |0| 
| **`rowsAsArray`** | Returns result-sets as arrays, rather than JSON. This is a faster way to get results. For more information, see Query. |*boolean* | false|
| **`logger`** | Configure logger. For more information, see the [`logger` option](/documentation/connection-options.md#logger) documentation. |*mixed*|

For more information, see the [Connection Options](/documentation/connection-options.md) documentation. 

### Connecting to Local Databases 

When working with a local database (that is, cases where MariaDB and your Node.js application run on the same host), you can connect to MariaDB through the Unix socket or Windows named pipe for better performance, rather than using the TCP/IP layer.

In order to set this up, you need to assign the connection a `socketPath` value.  When this is done, the Connector ignores the `host` and `port` options.

The specific socket path you need to set is defined by the 
[`socket`](https://mariadb.com/kb/en/library/server-system-variables/#socket) server system variable.  If you don't know it off hand, you can retrieve it from the server.

```sql
SHOW VARIABLES LIKE 'socket';
```

It defaults to `/tmp/mysql.sock` on Unix-like operating systems and `MySQL` on Windows.  Additionally, on Windows, this feature only works when the server is started with the `--enable-named-pipe` option.

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
    console.log('connected ! connection id is ' + conn.threadId);
    conn.release(); //release to pool
} catch (err) {
    console.log('not connected due to error: ' + err);
}
```

### Pool options

Pool options includes [connection option documentation](#connection-options) that will be used when creating new connections. 

Specific options for pools are :

|option|description|type|default|
|---:|---|:---:|:---:|
| **`acquireTimeout`** | Timeout to get a new connection from pool. In order to have connection error information, must be higher than connectTimeout. In milliseconds. | *integer* | 10000 |
| **`connectionLimit`** | Maximum number of connection in pool. | *integer* | 10 |
| **`idleTimeout`** | Indicate idle time after which a pool connection is released. Value must be lower than [@@wait_timeout](https://mariadb.com/kb/en/library/server-system-variables/#wait_timeout). In seconds. 0 means never release. | *integer* | 1800 |
| **`initializationTimeout`** | Pool will retry creating connection in loop, emitting 'error' event when reaching this timeout. In milliseconds. | *integer* | 30000 |
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

Creates a new pool cluster. Cluster handle multiple pools, giving high availability / distributing load (using round robin / random / ordered ).

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

Specific options for pool cluster are :

|option|description|type|default| 
|---:|---|:---:|:---:| 
| **`canRetry`** | When getting a connection from pool fails, can cluster retry with other pools |*boolean* | true |
| **`removeNodeErrorCount`** | Maximum number of consecutive connection fail from a pool before pool is removed from cluster configuration. Infinity means node won't be removed. Default to Infinity since 3.0, was 5 before|*integer* | Infinity |
| **`restoreNodeTimeout`** | delay before a pool can be reused after a connection fails. 0 = can be reused immediately (in ms) |*integer*| 1000|
| **`defaultSelector`** | default pools selector. Can be 'RR' (round-robin), 'RANDOM' or 'ORDER' (use in sequence = always use first pools unless fails) |*string*| 'RR'|

## `version → String`

> Returns a String that is library version. example '2.1.2'.

## `defaultOptions(options) → Json`

> * `options`: *JSON/String* [connection option documentation](#connection-options) (non mandatory)
> 
> Returns a JSON value containing options default value. 

permit listing default option that will be used. 

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

> * `sql`: *string | JSON* SQL string or JSON object to supersede default connection options.  When using JSON object, object must have a "sql" key. For instance, `{ dateStrings: true, sql: 'SELECT now()' }`
> * `values`: *array | object* Placeholder values. Usually an array, but in cases of only one placeholder, it can be given as is. 
>
> Returns a promise that :
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

To prevent SQL Injection attacks, queries permit the use of question marks as placeholders.  The Connection escapes values according to their type.  Values can be of native JavaScript types, Buffers, Readables, objects with `toSQLString` methods, or objects that can be stringified (that is, `JSON.stringify`).

When streaming, objects that implement Readable are streamed automatically.  But, there are two server system variables that may interfere:

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
    readableStream => conn.query('INSERT INTO StreamingContent (b) VALUE (?)', [readableStream]);
)
```

### JSON Result-sets 

Queries return two different kinds of results, depending on the type of query you execute.  When you execute write statements, (such as `INSERT`, `DELETE` and `UPDATE`), the method returns a JSON object with the following properties:

* `affectedRows`: An integer listing the number of affected rows.
* `insertId`: An integer noting the auto-increment ID of the last row written to the table.
* `warningStatus`: An integer indicating whether the query ended with a warning.

```js
await connection.query('CREATE TABLE animals (' +
                       'id MEDIUMINT NOT NULL AUTO_INCREMENT,' +
                       'name VARCHAR(30) NOT NULL,' +
                       'PRIMARY KEY (id))');
const res = await connection.query('INSERT INTO animals(name) value (?)', ['sea lions']);
//res : { affectedRows: 1, insertId: 1, warningStatus: 0 }
```

### Array Result-sets 

When the query executes a `SELECT` statement, the method returns the result-set as an array. 
Each value in the array is a returned row as a JSON object. 
Additionally, the method returns a special non-enumerable property `meta` containing metadata array that contains the [column metadata](#column-metadata) information. 

The rows default to JSON objects, but two other formats are also possible with the `nestTables` and `rowsAsArray` options.

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

* [`timeout`](#timeout)
* [`namedPlaceholders`](#namedPlaceholders)
* [`typeCast`](#typeCast)
* [`rowsAsArray`](#rowsAsArray)
* [`metaAsArray`](#metaAsArray)
* [`nestTables`](#nestTables)
* [`dateStrings`](#dateStrings)
* [`bigIntAsNumber`](#bigIntAsNumber)
* [`decimalAsNumber`](#decimalAsNumber)

Those options can be set on the query level, but are usually set at the connection level, and will then apply to all queries. 


#### `timeout`

*number, timeout in ms*

This option is only permitted for MariaDB server >= 10.1.2. 

This set a timeout to query operation. 
Driver internally use `SET STATEMENT max_statement_time=<timeout> FOR <command>` permitting to cancel operation when timeout is reached, 

limitation: when use for multiple-queries (option `multipleStatements` set), only the first query will be timeout !!! 

Implementation of max_statement_time is engine dependent, so there might be some differences: For example, with Galera engine, a commits will ensure replication to other nodes to be done, possibly then exceeded timeout, to ensure proper server state. 


```javascript

try {
    //query that takes more than 20s
    await connection.query({
        sql: 'information_schema.tables, information_schema.tables as t2', 
        timeout: 100 
    });
} catch (err) {
  // error is:
  // SqlError: (conn=2987, no: 1969, SQLState: 70100) Query execution was interrupted (max_statement_time exceeded)
  // sql: select * from information_schema.columns as c1, information_schema.tables, information_schema.tables as t2 - parameters:[]
  // at Object.module.exports.createError (C:\projets\mariadb-connector-nodejs.git\lib\misc\errors.js:55:10)
  // at PacketNodeEncoded.readError (C:\projets\mariadb-connector-nodejs.git\lib\io\packet.js:510:19)
  // at Query.readResponsePacket (C:\projets\mariadb-connector-nodejs.git\lib\cmd\parser.js:46:28)
  // at PacketInputStream.receivePacketBasic (C:\projets\mariadb-connector-nodejs.git\lib\io\packet-input-stream.js:104:9)
  // at PacketInputStream.onData (C:\projets\mariadb-connector-nodejs.git\lib\io\packet-input-stream.js:160:20)
  // at Socket.emit (events.js:210:5)
  // at addChunk (_stream_readable.js:309:12)
  // at readableAddChunk (_stream_readable.js:290:11)
  // at Socket.Readable.push (_stream_readable.js:224:10)
  // at TCP.onStreamRead (internal/stream_base_commons.js:182:23) {
  //     fatal: true,
  //         errno: 1969,
  //         sqlState: '70100',
  //         code: 'ER_STATEMENT_TIMEOUT'
  // }
}
```

#### `namedPlaceholders`

*boolean, default false*

While the recommended method is to use the question mark [placeholder](#placeholder), you can alternatively allow named placeholders by setting this query option.  Values given in the query must contain keys corresponding  to the placeholder names. 

```javascript
await connection.query(
	{ namedPlaceholders: true, sql: 'INSERT INTO someTable VALUES (:id, :img, :db)' },
	{ id: 1, img: Buffer.from('c327a97374', 'hex'), db: 'mariadb' }
);
```

#### `rowsAsArray`

*boolean, default false*

Using this option causes the Connector to format rows in the result-set  as arrays, rather than JSON objects. 
Doing so allows you to save memory and avoid having the Connector parse [column metadata](#column-metadata) completely.  It is the fastest row format, (by 5-10%), with a local database.

Default format : `{ id: 1, name: 'sea lions' }`
with option `rowsAsArray` : `[ 1, 'sea lions' ]`

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

Compatibility option, causes Promise to return an array object, `[rows, metadata]` rather than the rows as JSON objects with a `meta` property.
This option is mainly for mysql2 compatibility.

```javascript
const [rows, meta] = await connection.query({ metaAsArray: true, sql: 'select * from animals' });
// rows = [ 
//    [ 1, 'sea lions' ], 
//    [ 2, 'bird' ],
// ]
// meta = [...]
```

#### `nestTables`

*boolean / string, default false*

Occasionally, you may have issue with queries that return columns with the **same** name.  The standard JSON format does not permit key duplication.  To get around this, you can set the `nestTables` option to `true`.  This causes the Connector to group data by table.  When using string parameters, it prefixes the JSON field name with the table name and the `nestTables` value.

For instance, when using a boolean value:

```javascript
const res = await connection.query({
    nestTables:true, 
    sql:'select a.name, a.id, b.name from animals a, animals b where b.id=1'
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
const meta = res.meta;
//    meta: [...]
```

Alternatively, using a string value:

```javascript
const res = await connection.query({
    nestTables: '_', 
    sql:'select a.name, a.id, b.name from animals a, animals b where b.id=1'
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
  if (column.type == "TINY" && column.length === 1) {
    const val = column.int();
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
Shows the column type as an integer value.  For more information on the relevant values, see	[`field-type.js`](/lib/const/field-type.js)
* `columnType`: Shows the column type as a string value.  For more information on the relevant values, see	[`field-type.js`](/lib/const/field-type.js)
* `scale`: Provides the decimal part length.
* `flags`: Shows the byte-encoded flags.  For more information, see [`field-detail.js`](/lib/const/field-detail.js).
* `db()`: Name of the database schema.    You can also retrieve this using `schema()`.
* `table()`: Table alias.
* `orgTable()`: Real table name.
* `name()`: Column alias. 
* `orgName()`: Real column name.

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
When using the `query()` method, documented above, the Connector returns the entire result-set with all its data in a single call.  While this is fine for queries that return small result-sets, it can grow unmanageable in cases of huge result-sets.  Instead of retrieving all of the data into memory, you can use the `queryStream()` method, which uses the event drive architecture to process rows one by one, which allows you to avoid putting too much strain on memory.

Query times and result handlers take the same amount of time, but you may want to consider updating the [`net_read_timeout`](https://mariadb.com/kb/en/library/server-system-variables/#net_read_timeout) server system variable.  The query must be totally received before this timeout, which defaults to 30 seconds.

!! Warning !!
Querystream handle backpressure, meaning that if data handling takes some amount of time, socket is pause to avoid having node socket buffer growing indefinitely.
When using pipeline, if data handling throws an error, user must explicilty close queryStream to ensure not having connection hangs. 




There is different methods to implement streaming:

* for-await-of

simple use with for-await-of only available since Node.js 10 (note that this must be use within async function) :

```javascript
async function streamingFunction() {
 const queryStream = connection.queryStream('SELECT * FROM mysql.user');
 try {
   for await (const row of queryStream) {
     console.log(row);
   }
 } catch (e) {
   queryStream.close();
 }
}
```

* Events

```javascript
connection.queryStream('SELECT * FROM mysql.user')
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
      });
```

* streams

Note that queryStream produced Object data, so Transform/Writable implementation must be created with [`objectMode`](https://nodejs.org/api/stream.html#stream_object_mode) set to true.<br/>  
(example use [`stream.pipeline`](https://nodejs.org/api/stream.html#stream_stream_pipeline_streams_callback) only available since Node.js 10)

```javascript
const stream = require('stream');
const fs = require('fs');

//...create connection...

const someWriterStream = fs.createWriteStream('./someFile.txt');

const transformStream = new stream.Transform({
  objectMode: true,
  transform: function transformer(chunk, encoding, callback) {
    callback(null, JSON.stringify(chunk));
  }
});

const queryStream = connection.queryStream('SELECT * FROM mysql.user');

stream.pipeline(queryStream, transformStream, someWriterStream, (err) => { queryStream.close(); });

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

result difference compared to execute multiple single query insert is that only first generated insert id will be returned. 

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

## `Error`

When the Connector encounters an error, Promise returns an [`Error`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error) object.  In addition to the standard properties, this object has the following properties:
* `fatal`: A boolean value indicating whether the connection remains valid.
* `errno`: The error number. 
* `sqlState`: The SQL state code.
* `code`: The error code.

Example on `console.log(error)`: 
```
{ Error: (conn=116, no: 1146, SQLState: 42S02) Table 'testn.falsetable' doesn't exist
  sql: INSERT INTO falseTable(t1, t2, t3, t4, t5) values (?, ?, ?, ?, ?)  - parameters:[1,0x01ff,'hh','01/01/2001 00:00:00.000',null]
      ...
      at Socket.Readable.push (_stream_readable.js:134:10)
      at TCP.onread (net.js:559:20)
    From event:
      at C:\mariadb-connector-nodejs\lib\connection.js:185:29
      at Connection.query (C:\mariadb-connector-nodejs\lib\connection.js:183:12)
      at Context.<anonymous> (C:\mariadb-connector-nodejs\test\integration\test-error.js:250:8)
    fatal: false,
    errno: 1146,
    sqlState: '42S02',
    code: 'ER_NO_SUCH_TABLE' } }
```

Errors contain an error stack, query and parameter values (the length of which is limited to 1,024 characters, by default).  To retrieve the initial stack trace (shown as `From event...` in the example above), you must have the Connection option `trace` enabled.

For more information on error numbers and SQL state signification, see the [MariaDB Error Code](https://mariadb.com/kb/en/library/mariadb-error-codes/) documentation.


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
  //{ Error: (conn=6283, no: 45026, SQLState: 08S01) socket timeout
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

Each time a connection is asked, if the pool contains a connection that is not used, the pool will validate the connection, 
exchanging an empty MySQL packet with the server to ensure the connection state, then give the connection. 
The pool reuses connection intensively, so this validation is done only if a connection has not been used for a period 
(specified by the "minDelayValidation" option with the default value of 500ms).

If no connection is available, the request for a connection will be put in a queue until connection timeout. 
When a connection is available (new creation or released to the pool), it will be used to satisfy queued requests in FIFO order.

When a connection is given back to the pool, any remaining transactions will be rolled back.

## `pool.getConnection() → Promise`

>
> Returns a promise that :
> * resolves with a [Connection](#connection-api) object,
> * raises an [Error](#error).

Creates a new [Connection](#connection-api) object with an additional release method. 
Calling connection.release() will give back connection to pool.  

connection.release() is an async method returning an empty promise success  

Connection must be given back to pool using this connection.release() method.

**Example:**

```javascript
const pool = mariadb.createPool({ 
    host: 'mydb.com', 
    user:'myUser' 
});

let conn;
try {
    conn = await pool.getConnection();
    console.log("connected ! connection id is " + conn.threadId);
    await conn.release(); //release to pool
} catch (err) {
    console.log("not connected due to error: " + err);
}
```

## `pool.query(sql[, values])` -> `Promise`

> * `sql`: *string | JSON* SQL string or JSON object to supersede default connection options.  When using JSON object, object must have an "sql" key. For instance, `{ dateStrings: true, sql: 'SELECT now()' }`
> * `values`: *array | object* Placeholder values. Usually an array, but in cases of only one placeholder, it can be given as is. 
>
> Returns a promise that :
> * resolves with a JSON object for update/insert/delete or a [result-set](#result-set-array) object for result-set.
> * rejects with an [Error](#error).

This is a shortcut to get a connection from pool, execute a query and release connection.

```javascript
const mariadb = require('mariadb');
const pool = mariadb.createPool({ host: 'mydb.com', user:'myUser' });
pool
   .query("SELECT NOW()")
   .then(rows => {
    console.log(rows); //[ { 'NOW()': 2018-07-02T17:06:38.000Z } ]
   })
   .catch(err => {
    //handle error
   });
```

## `pool.batch(sql, values) -> Promise`

> * `sql`: *string | JSON* SQL string or JSON object to supersede default connection options.  When using JSON object, object must have an "sql" key. For instance, `{ dateStrings: true, sql: 'SELECT now()' }`
> * `values`: *array* array of Placeholder values. Usually an array of array, but in cases of only one placeholder per value, it can be given as a single array. 
>
> Returns a promise that :
> * resolves with a JSON object.
> * rejects with an [Error](#error).

This is a shortcut to get a connection from pool, execute a batch and release connection.

```javascript
const mariadb = require('mariadb');
const pool = mariadb.createPool({ host: 'mydb.com', user:'myUser' });
pool.query(
  "CREATE TABLE parse(autoId int not null primary key auto_increment, c1 int, c2 int, c3 int, c4 varchar(128), c5 int)"
);
let res = await pool.batch(
    "INSERT INTO `parse`(c1,c2,c3,c4,c5) values (1, ?, 2, ?, 3)", 
    [[1, "john"], [2, "jack"]]
);
//res = { affectedRows: 2, insertId: 1, warningStatus: 0 }

assert.equal(res.affectedRows, 2);
res = await pool.query("select * from `parse`");
/*
res = [ 
    { autoId: 1, c1: 1, c2: 1, c3: 2, c4: 'john', c5: 3 },
    { autoId: 2, c1: 1, c2: 2, c3: 2, c4: 'jack', c5: 3 },
  }
*/ 
```

## `pool.end() → Promise`

>Returns a promise that :
>  * resolves (no argument)
>  * rejects with an [Error](#error).

Closes the pool and underlying connections gracefully.

```javascript
pool.end()
  .then(() => {
    //connections have been ended properly
  })
  .catch(err => console.log);
```

## `pool.escape(value) → String`
This is an alias for [`connection.escape(value) → String`](#connectionescapevalue--string) to escape parameters

## `pool.escapeId(value) → String` 
This is an alias for [`connection.escapeId(value) → String`](#connectionescapeidvalue--string) to escape Identifier

## Pool events

|event|description|
|---:|---|
| **`acquire`** | This event emits a connection is acquired from pool.  |
| **`connection`** | This event is emitted when a new connection is added to the pool. Has a connection object parameter |
| **`enqueue`** | This event is emitted when a command cannot be satisfied immediately by the pool and is queued. |
| **`release`** | This event is emitted when a connection is released back into the pool. Has a connection object parameter|
| **`error`** | When pool fails to create new connection after reaching `initializationTimeout` timeout |

**Example:**

```javascript
pool.on('connection', (conn) => console.log(`connection ${conn.threadId} has been created in pool`);
```

# Pool cluster API

Cluster handle multiple pools according to patterns and handle failover / distributed load (round robin / random / ordered ).

## `poolCluster.add(id, config)`

> * `id`: *string* node identifier. example : 'master'
> * `config`: *JSON* [pool options](#pool-options) to create pool. 
>

Add a new Pool to cluster.

**Example:**

```javascript
const mariadb = require('mariadb');
const cluster = mariadb.createPoolCluster();
cluster.add("master", { host: 'mydb1.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave1", { host: 'mydb2.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave2", { host: 'mydb3.com', user: 'myUser', connectionLimit: 5 });
```

## `poolCluster.remove(pattern)`

> * `pattern`: *string* regex pattern to select pools. Example, `"slave*"`
>
remove and end pool(s) configured in cluster.


## `poolCluster.end() → Promise`

> Returns a promise that :
>  * resolves (no argument)
>  * rejects with an [Error](#error).

Closes the pool cluster and underlying pools.

```javascript
poolCluster.end()
  .then(() => {
    //pools have been ended properly
  })
  .catch(err => console.log);
```



## `poolCluster.getConnection(pattern, selector) → Promise`

> * `pattern`:  *string* regex pattern to select pools. Example, `"slave*"`. default `'*'`
> * `selector`: *string* pools selector. Can be 'RR' (round-robin), 'RANDOM' or 'ORDER' (use in sequence = always use first pools unless fails). default to the  
> 
> Returns a promise that :
> * resolves with a [Connection](#connection-api) object,
> * raises an [Error](#error).

Creates a new [Connection](#connection-api) object.
Connection must be given back to pool with the connection.end() method.

**Example:**

```javascript
const mariadb = require('mariadb');
const cluster = mariadb.createPoolCluster();
cluster.add("master", { host: 'mydb1.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave1", { host: 'mydb2.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave2", { host: 'mydb3.com', user: 'myUser', connectionLimit: 5 });
cluster.getConnection("slave*")
```

## `poolCluster events`

PoolCluster object inherits from the Node.js [`EventEmitter`](https://nodejs.org/api/events.html). 
Emits 'remove' event when a node is removed from configuration if the option `removeNodeErrorCount` is defined 
(default to 5) and connector fails to connect more than `removeNodeErrorCount` times. 
(if other nodes are present, each attemps will wait for value of the option `restoreNodeTimeout`)

```javascript
const mariadb = require('mariadb');
const cluster = mariadb.createPoolCluster({ removeNodeErrorCount: 20, restoreNodeTimeout: 5000 });
cluster.add("master", { host: 'mydb1.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave1", { host: 'mydb2.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave2", { host: 'mydb3.com', user: 'myUser', connectionLimit: 5 });
cluster.on('remove', node => {
  console.log(`node ${node} was removed`);
})
```

## `poolCluster.of(pattern, selector) → FilteredPoolCluster`

> * `pattern`:  *string* regex pattern to select pools. Example, `"slave*"`. default `'*'`
> * `selector`: *string* pools selector. Can be 'RR' (round-robin), 'RANDOM' or 'ORDER' (use in sequence = always use first pools unless fails). default to the  
>
> Returns :
> * resolves with a [filtered pool cluster](#filteredpoolcluster) object,
> * raises an [Error](#error).

Creates a new [filtered pool cluster](#filteredpoolcluster) object that is a subset of cluster.


**Example:**

```javascript
const mariadb = require('mariadb');

const cluster = mariadb.createPoolCluster();
cluster.add("master-north", { host: 'mydb1.com', user: 'myUser', connectionLimit: 5 });
cluster.add("master-south", { host: 'mydb2.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave1-north", { host: 'mydb3.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave2-north", { host: 'mydb4.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave1-south", { host: 'mydb5.com', user: 'myUser', connectionLimit: 5 });

const masterCluster = cluster.of('master*');
const northSlaves = cluster.of(/^slave?-north/, 'RANDOM');

const conn = await northSlaves.getConnection();
// use that connection

```

### `filtered pool cluster`

* `filteredPoolCluster.getConnection() → Promise` : Creates a new connection from pools that corresponds to pattern .
* `filteredPoolCluster.query(sql[, values]) → Promise` : this is a shortcut to get a connection from pools that corresponds to pattern, execute a query and release connection.

## Stored procedure with output parameter

Output parameters can be retrieved with 2 differents ways:

### Using simple query
solution is to define output parameters as user-defined variables and retrieving them afterwhile.

```javascript
//CREATE OR REPLACE PROCEDURE multiplyBy2 (IN p1 INT, OUT p2 INT)
// begin set p2 = p1 * 2; end
await shareConn.query('call multiplyBy2(?,@myOutputValue)', [2]);
const res = await shareConn.query('SELECT @myOutputValue');
// res = [{ '@myOutputValue': 4n }]
```

### Using execute
(only when using 3.x version or the driver)
execute use another protocol that permits to return output parameters directly.
(OUT parameters must have null value) 

```javascript
//CREATE OR REPLACE PROCEDURE multiplyBy2 (IN p1 INT, OUT p2 INT)
// begin set p2 = p1 * 2; end
const res = await shareConn.execute('call multiplyBy2(?, ?)', [2, null]);
// res = [
//   [ { p2: 4 }],
//   OkPacket { affectedRows: 0, insertId: 0n, warningStatus: 0 }
// ]
```
