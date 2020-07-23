
# Documentation

There are two different connection implementation: one, the default, uses Promise and the other uses Callback, allowing for compatibility with the mysql and mysql2 API's.  The documentation provided on this page follows Callback.  If you want information on the Promise API, see the  [README](../README.md). 


## Quick Start

Install the mariadb Connector using npm

```
$ npm install mariadb
```

You can then uses the Connector in your application code with the Callback API.  For instance,

```js
  const mariadb = require('mariadb/callback');
  const conn = mariadb.createConnection({host: 'mydb.com', user:'myUser', password: 'myPwd'});
  conn.query("SELECT 1 as val", (err, rows) => {
      console.log(rows); //[ {val: 1}, meta: ... ]
      conn.query("INSERT INTO myTable value (?, ?)", [1, "mariadb"], (err, res) => {
        console.log(res); // { affectedRows: 1, insertId: 1, warningStatus: 0 }
        conn.end();
      });
  });
```


## Installation

In order to use the Connector you first need to install it on your system.  The installation process for Promise and Callback API's is managed with the same package through npm. 

```
$ npm install mariadb
```

To use the Connector, you need to import the package into your application code.  Given that the Callback API is not the default, the `require()` statement is a little different.

```js
const mariadb = require('mariadb/callback');
```

This initializes the constant `mariadb`, which is set to use the Callback API rather than the default Promise API.


## Timezone consideration

It's not recommended, but in some cases, Node.js and database are configured with different timezone. 

By default, `timezone` option is set to 'local' value, indicating to use client timezone, so no conversion will be done.

If client and server timezone differ, `timezone` option has to be set to server timezone.
- 'auto' value means client will request server timezone when creating a connection, and use server timezone afterwhile. 
- To avoid this additional command on connection, `timezone` can be set to [IANA time zone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones). 

Connector will then convert date to server timezone, rather than the current Node.js timezone. 


## Security consideration

Connection details such as URL, username, and password are better hidden into environment variables.
using code like : 
```js
  const mariadb = require('mariadb');

  const conn = mariadb.createConnection({host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PWD});
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
  const mariadb = require('mariadb');
  require('dotenv').config()
  const conn = mariadb.createConnection({host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PWD});
```

with a .env file containing
```
DB_HOST=localhost
DB_USER=test
DB_PWD=secretPasswrd
```
.env files must NOT be pushed into repository,  using .gitignore

# Callback API

The Connector with the Callback API is similar to the one using Promise, but with a few differences.


**Base:**

* [`createConnection(options) → Connection`](#createconnectionoptions--connection): Creates a connection to a MariaDB Server.
* [`createPool(options) → Pool`](#createpooloptions--pool) : Creates a new Pool.
* [`createPoolCluster(options) → PoolCluster`](#createpoolclusteroptions--poolcluster) : Creates a new pool cluster.
* [`version → String`](#version--string) : Return library version.


**Connection:**

* [`connection.query(sql[, values][, callback]) → Emitter`](#connectionquerysql-values-callback---emitter): Executes a [query](#query).
* [`connection.batch(sql, values[, callback])`](#connectionbatchsql-values--callback): fast batch processing.
* [`connection.beginTransaction([callback])`](#connectionbegintransactioncallback): Begins a transaction
* [`connection.commit([callback])`](#connectioncommitcallback): Commit the current transaction, if any.
* [`connection.rollback([callback])`](#connectionrollbackcallback): Rolls back the current transaction, if any.
* [`connection.changeUser(options[, callback])`](#connectionchangeuseroptions-callback): Changes the current connection user.
* [`connection.ping([callback])`](#connectionpingcallback): Sends an empty packet to the server to check that connection is active.
* [`connection.end([callback])`](#connectionendcallback): Gracefully closes the connection.
* [`connection.reset([callback])`](#connectionreset): reset current connection state.
* [`connection.isValid() → boolean`](#connectionisvalid--boolean): Checks that the connection is active without checking socket state.
* [`connection.destroy()`](#connectiondestroy): Forces the connection to close.
* [`connection.escape(value) → String`](#connectionescapevalue--string): escape parameter 
* [`connection.escapeId(value) → String`](#connectionescapeidvalue--string): escape identifier  
* [`connection.pause()`](#connectionpause): Pauses the socket output.
* [`connection.resume()`](#connectionresume): Resumes the socket output.
* [`connection.serverVersion()`](#connectionserverversion): Retrieves the current server version.
* [`events`](#events): Subscribes to connection error events.

**Pool:**

* [`pool.getConnection([callback])`](#poolgetconnectioncallback) : Creates a new connection.
* [`pool.query(sql[, values][, callback])`](#poolquerysql-values-callback): Executes a query.
* [`pool.batch(sql, values[, callback])`](#poolbatchsql-values-callback): Executes a batch
* [`pool.end([callback])`](#poolendcallback): Gracefully closes the connection.
* [`pool.escape(value) → String`](#poolescapevalue--string): escape parameter 
* [`pool.escapeId(value) → String`](#poolescapeidvalue--string): escape identifier 
* `pool.activeConnections() → Number`: Gets current active connection number.
* `pool.totalConnections() → Number`: Gets current total connection number.
* `pool.idleConnections() → Number`: Gets current idle connection number.
* `pool.taskQueueSize() → Number`: Gets current stacked request.
* [`pool events`](#pool-events-1): Subscribes to pool events.

**PoolCluster**

* [`poolCluster.add(id, config)`](#poolclusteraddid-config) : add a pool to cluster.
* [`poolCluster.remove(pattern)`](#poolclusterremovepattern) : remove and end pool according to pattern.
* [`poolCluster.end([callback])`](#poolclusterendcallback) : end cluster.
* [`poolCluster.getConnection([pattern, ][selector, ]callback)`](#poolclustergetconnectionpattern-selector-callback) : return a connection from cluster.
* [`poolCluster events`](#poolcluster-events): Subscribes to pool cluster events.
* [`poolCluster.of(pattern, selector) → FilteredPoolCluster`](#poolclusterofpattern-selector--filteredpoolcluster) : return a subset of cluster.


# Base API

## `createConnection(options) → Connection`

> * `options`: *JSON/String* Uses the same options as Promise API. For a complete list, see [option documentation](/documentation/connection-options.md).
>
>Returns a Connection object

Creates a new connection.

The difference between this method and the same with the Promise API is that this method returns a `Connection` object, rather than a Promise that resolves to a `Connection` object.

```javascript
const mariadb = require('mariadb/callback');
const conn = mariadb.createConnection({
      host: 'mydb.com', 
      user:'myUser',
      password: 'myPwd'
    });
conn.connect(err => {
  if (err) {
    console.log("not connected due to error: " + err);
  } else {
    console.log("connected ! connection id is " + conn.threadId);
  }
});
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
| **`connectTimeout`** | Sets the connection timeout in milliseconds. |*integer* | 10 000|
| **`socketTimeout`** | Sets the socket timeout in milliseconds after connection succeeds. A value of `0` disables the timeout. |*integer* | 0|
| **`queryTimeout`** | Set maximum query time in ms (an error will be thrown if limit is reached). 0 or undefined meaning no timeout. This can be superseded for a query using `timeout` option|*int* |0|
| **`rowsAsArray`** | Returns result-sets as arrays, rather than JSON. This is a faster way to get results. For more information, see Query. |*boolean* | false|

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
const mariadb = require('mariadb/callback');
const conn = mariadb.createConnection({ socketPath: '/tmp/mysql.sock', user: 'root' });
conn.connect(err => {
  //do something with connection
  conn.end();
});

```

It has a similar syntax on Windows: 

```javascript
const mariadb = require('mariadb/callback');
const conn = mariadb.createConnection({ socketPath: '\\\\.\\pipe\\MySQL', user: 'root' });
```


## `createPool(options) → Pool`

> * `options`: *JSON/string* [pool options](#pool-options)
>
> Returns a [Pool](#pool-api) object,

Creates a new pool.

**Example:**

```javascript
const mariadb = require('mariadb/callback');
const pool = mariadb.createPool({ host: 'mydb.com', user: 'myUser', connectionLimit: 5 });
pool.getConnection((err, conn) => {
  if (err) {
    console.log("not connected due to error: " + err);
  } else {
    console.log("connected ! connection id is " + conn.threadId);
    conn.end(); //release to pool
  }
});
```

### Pool options

Pool options includes [connection option documentation](#connection-options) that will be used when creating new connections. 

Specific options for pools are :

|option|description|type|default| 
|---:|---|:---:|:---:| 
| **`acquireTimeout`** | Timeout to get a new connection from pool in ms. |*integer* | 10000 |
| **`connectionLimit`** | Maximum number of connection in pool. |*integer* | 10 |
| **`idleTimeout`** | Indicate idle time after which a pool connection is released. Value must be lower than [@@wait_timeout](https://mariadb.com/kb/en/library/server-system-variables/#wait_timeout). In seconds (0 means never release) |*integer* | 1800 |
| **`minimumIdle`** | Permit to set a minimum number of connection in pool. **Recommendation is to use fixed pool, so not setting this value**.|*integer* | *set to connectionLimit value* |
| **`minDelayValidation`** | When asking a connection to pool, the pool will validate the connection state. "minDelayValidation" permits disabling this validation if the connection has been borrowed recently avoiding useless verifications in case of frequent reuse of connections. 0 means validation is done each time the connection is asked. (in ms) |*integer*| 500|
| **`noControlAfterUse`** | After giving back connection to pool (connection.end) connector will reset or rollback connection to ensure a valid state. This option permit to disable those controls|*boolean*| false|
| **`resetAfterUse`** | When a connection is given back to pool, reset the connection if the server allows it (only for MariaDB version >= 10.2.22 /10.3.13). If disabled or server version doesn't allows reset, pool will only rollback open transaction if any|*boolean*| true|
| **`leakDetectionTimeout`** |Permit to indicate a timeout to log connection borrowed from pool. When a connection is borrowed from pool and this timeout is reached, a message will be logged to console indicating a possible connection leak. Another message will tell if the possible logged leak has been released. A value of 0 (default) meaning Leak detection is disable |*integer*| 0|

### Pool events

|event|description|
|---:|---|
| **`acquire`** | This event emits a connection is acquired from pool.  |
| **`connection`** | This event is emitted when a new connection is added to the pool. Has a connection object parameter |
| **`enqueue`** | This event is emitted when a command cannot be satisfied immediately by the pool and is queued. |
| **`release`** | This event is emitted when a connection is released back into the pool. Has a connection object parameter|

**Example:**

```javascript
pool.on('connection', (conn) => console.log(`connection ${conn.threadId} has been created in pool`);
```


## `createPoolCluster(options) → PoolCluster`

> * `options`: *JSON* [poolCluster options](#poolCluster-options)
>
> Returns a [PoolCluster](#poolCluster-api) object,

Creates a new pool cluster. Cluster handle multiple pools, giving high availability / distributing load (using round robin / random / ordered ).

**Example:**

```javascript
const mariadb = require('mariadb/callback');

const cluster = mariadb.createPoolCluster();
cluster.add("master", { host: 'mydb1.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave1", { host: 'mydb2.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave2", { host: 'mydb3.com', user: 'myUser', connectionLimit: 5 });

//getting a connection from slave1 or slave2 using round-robin
cluster.getConnection(/^slave*$/, "RR", (err, conn) => {
  conn.query("SELECT 1", (err, rows) => {
     conn.end();
     return row[0]["@node"];
  });
});
```

 
### PoolCluster options

Pool cluster options includes [pool option documentation](#pool-options) that will be used when creating new pools. 

Specific options for pool cluster are :

|option|description|type|default| 
|---:|---|:---:|:---:| 
| **`canRetry`** | When getting a connection from pool fails, can cluster retry with other pools |*boolean* | true |
| **`removeNodeErrorCount`** | Maximum number of consecutive connection fail from a pool before pool is removed from cluster configuration. null means node won't be removed|*integer* | 5 |
| **`restoreNodeTimeout`** | delay before a pool can be reused after a connection fails. 0 = can be reused immediately (in ms) |*integer*| 1000|
| **`defaultSelector`** | default pools selector. Can be 'RR' (round-robin), 'RANDOM' or 'ORDER' (use in sequence = always use first pools unless fails) |*string*| 'RR'|


## `version → String`

> Returns a String that is library version. example '2.1.2'.


# Connection API
 
## `connection.query(sql[, values][, callback])` -> `Emitter`

> * `sql`: *string | JSON* An SQL string value or JSON object to supersede default connections options.  If  aJSON object, it must have an `"sql"` property.  For example: `{dateStrings:true, sql:'SELECT NOW()'}`
> * `values`: *array | object* Placeholder values. Usually an array, but in cases of just one placeholder, it can be given as is. 
> * `callback`: *function* Callback function with arguments (error, results, metadata).
>
>Returns an Emitter object that can emit four different types of event:
>  * error : Emits an [Error](#error) object, when query failed.
>  * columns : Emits when columns metadata from result-set are received (parameter is an array of [Metadata fields](#metadata-field)).
>  * data : Emits each time a row is received (parameter is a row). 
>  * end : Emits when the query ends (no parameter). 

Sends query to the database with a Callback function to call when done. 

In cases where the query returns huge result-sets, this means that all data is stored in  memory.  You may find it more practical to use the `Emitter` object to handle the rows one by one, to avoid overloading memory resources.


For example, issuing a query with an SQL string:

```js
connection.query("SELECT NOW()", (err, rows, meta) => {
  if (err) throw err;
  console.log(rows); //[ { 'now()': 2018-07-02T17:06:38.000Z } ]
});
```

Using JSON objects:

```js
connection.query({dateStrings:true, sql:'SELECT now()'}, (err, rows, meta) => {
  if (err) throw err;
  console.log(rows); //[ { 'now()': '2018-07-02 19:06:38' } ]
});
```

### Placeholder

To avoid SQL Injection attacks, queries permit the use of a question mark as a placeholder.  The Connector escapes values according to their type.  You can use any native JavaScript type, Buffer, Readable or any object with a `toSqlString` method in these values.  All other objects are stringified using the `JSON.stringify` method.

The Connector automatically streams objects that implement Readable.  In these cases, check the values on the following server system variables, as they may interfere:

- [`net_read_timeout`](https://mariadb.com/kb/en/library/server-system-variables/#net_write_timeout): The server must receive the query in full from the Connector before timing out.  The default value for this system variable is 30 seconds.
- [`max_allowed_packet`](https://mariadb.com/kb/en/library/server-system-variables/#max_allowed_packet): Using this system variable you can control the maximum amount of data the Connector can send to the server.


```js
// Sends INSERT INTO someTable VALUES (1, _BINARY '.\'.st', 'mariadb')
connection.query(
  "INSERT INTO someTable VALUES (?, ?, ?)",
  [1, Buffer.from("c327a97374", "hex"), "mariadb"],
  (err, result) => {
	if (err) throw err;
	console.log(result);
	//log : { affectedRows: 1, insertId: 1, warningStatus: 0 }
  }
);
```

You can also issue the same query using Streaming.

```javascript
const https = require("https");
https.get("https://node.green/#ES2018-features-Promise-prototype-finally-basic-support",
  readableStream => {
    connection.query("INSERT INTO StreamingContent (b) VALUE (?)", [readableStream], (err, res) => {
       if (err) throw err;
       //inserted
    });
  }
)
```

### Query Results

Queries issued from the Connector return two different kinds of results: a JSON object and an array, depending on the type of query you issue.  Queries that write to the database, such as `INSERT`, `DELETE` and `UPDATE` commands return a JSON object with the following properties:

* `affectedRows`: Indicates the number of rows affected by the query.
* `insertId`: Shows the last auto-increment value from an `INSERT`.
* `warningStatus`: Indicates whether the query ended with a warning.

```js
connection.query(
  "CREATE TABLE animals (" +
	"id MEDIUMINT NOT NULL AUTO_INCREMENT," +
	"name VARCHAR(30) NOT NULL," +
	"PRIMARY KEY (id))",
  err => {
	connection.query("INSERT INTO animals(name) value (?)", ["sea lions"], (err, res) => {
	  if (err) throw err;
	  console.log(res);
	  //log : { affectedRows: 1, insertId: 1, warningStatus: 0 }
	});
  }
);
```

#### Result-set array

Queries issued from the Connector return two different kinds of results: a JSON object and an array, depending on the type of query you issue.  When the query returns multiple rows, the Connector returns an array, representing the data for each row in the array.  It also returns a `meta` object, containing query metadata.

You can formt the data results using the `nestTables` and `rowsAsArray` options.  By default, it returns a JSON object for each row.

```javascript
connection.query('select * from animals', (err, res, meta) => {
  console.log(res); 
  // [ 
  //    { id: 1, name: 'sea lions' }, 
  //    { id: 2, name: 'bird' }, 
  //    meta: [ ... ]
  // ]  
});
```

### Streaming

```javascript
connection.query("SELECT * FROM mysql.user")
      .on("error", err => {
        console.log(err); //if error
      })
      .on("fields", meta => {
        console.log(meta); // [ ... ]
      })
      .on("data", row => {
        console.log(row);
      })
      .on("end", () => {
        //ended
      });
```

## `connection.batch(sql, values [, callback])`

> * `sql`: *string | JSON* SQL string value or JSON object to supersede default connections options.  JSON objects must have an `"sql"` property.  For instance, `{ dateStrings: true, sql: 'SELECT now()' }`
> * `values`: *array* Array of parameter (array of array or array of object if using named placeholders). 
> * `callback`: *function* Callback function with arguments (error, results, metadata).
>
> callback either return an [[#error|Error]] with results/metadata null or with error empty and results/metadata 

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
    "CREATE TEMPORARY TABLE batchExample(id int, id2 int, id3 int, t varchar(128), id4 int)"
  );
  connection
    .batch("INSERT INTO `batchExample` values (1, ?, 2, ?, 3)", [[1, "john"], [2, "jack"]], (err, res) => {
      if (err) {
        console.log('handle error');
      } else {
      console.log(res.affectedRows); // 2
      }
    });

```

## `connection.beginTransaction([callback])`

> * `callback`: *function* Callback function with argument [Error](#error) if any error.

Begins a new transaction.

## `connection.commit([callback])`

> * `callback`: *function* callback function with argument [Error](#error) if any error.

Commits the current transaction, if there is one active.  The Connector keeps track of the current transaction state on the server.  When there isn't an active transaction, this method sends no commands to the server.


## `connection.rollback([callback])`

> * `callback`: *function* Callback function with argument [Error](#error) if any error.

Rolls back the current transaction, if there is one active.  The Connector keeps track of the current transaction state on the server.  Where there isn't an active transaction, this method sends no commands to the server.

```javascript
conn.beginTransaction(err => {
  if (err) {
    //handle error
  } else {
    conn.query("INSERT INTO testTransaction values ('test')", (err) => {
      if (err) {
        //handle error
      } else {
        conn.query("INSERT INTO testTransaction values ('test2')", (err) => {
          if (err) {
            conn.rollback(err => {
              if (err) {
                //handle error
              }
            });
          } else {
            conn.commit(err => {
              if (err) {
                //handle error
              }
            });
          }
        });
      }
    })
  }
});
```
 
## `connection.changeUser(options[, callback])`

> * `options`: *JSON*, subset of [connection option documentation](#connection-options) = database / charset / password / user
> * `callback`: *function* callback function with argument [Error](#error) if any error.

Resets the connection and re-authenticates with the given credentials.  This is the equivalent of creating a new connection with a new user, reusing the existing open socket.

```javascript
conn.changeUser({user: 'changeUser', password: 'mypassword'}, err => {
  if (err) {
    //handle error
  } else {
    //connection user is now changed.
  }
});
```

## `connection.ping([callback])`

> * `callback`: *function* Callback function with argument [Error](#error) if any error.

Sends a one byte packet to the server to check that the connection is still active.

```javascript
conn.ping(err => {
  if (err) {
    //handle error
  } else {
    //connection is valid
  }
})
```

## `connection.end([callback])`

> * `callback`: *function* Callback function with argument [Error](#error) if any error.

Closes the connection gracefully.  That is, the Connector waits for current queries to finish their execution then closes the connection.

```javascript
conn.end(err => {
  //handle error
})
```

## `connection.reset([callback])`

> * `callback`: *function* Callback function with argument [Error](#error) if any error.

reset the connection. Reset will:

   * rollback any open transaction
   * reset transaction isolation level
   * reset session variables
   * delete user variables
   * remove temporary tables
   * remove all PREPARE statement
   
This command is only available for MariaDB >=10.2.4 or MySQL >= 5.7.3.
function will be rejected with error "Reset command not permitted for server XXX" if version doesn't permit reset.

For previous MariaDB version, reset connection can be done using [`connection.changeUser(options[, callback])`](#connectionchangeuseroptions-callback) that do the same + redo authentication phase.   

## `connection.isValid() → boolean`

> Returns a boolean

Indicates the connection state as the Connector knows it.  If it returns false, there is an issue with the connection, such as the socket disconnected without the Connector knowing about it.


## `connection.destroy()`

Closes the connection without waiting for any currently executing queries.  These queries are interrupted.  MariaDB logs the event as an unexpected socket close.


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
Escaping API are meant to prevent [SQL injection](https://en.wikipedia.org/wiki/SQL_injection). However, privilege the use of [`connection.query(sql[, values][, callback])`](#connectionquerysql-values-callback---emitter) and avoid building the command manually.   

```javascript
const myColVar = "let'go";
const myTable = "table:a"
const cmd = 'SELECT * FROM ' + conn.escapeId(myTable) + ' where myCol = ' + conn.escape(myColVar);
// cmd value will be:
// "SELECT * FROM `table:a` where myCol = 'let\\'s go'"
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
con.query(`SELECT * FROM ${con.escapeId(myTable)} where myCol = ?`, [myColVar], (err, rows) => { });
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
  const conn = mariadb.createConnection({user: 'root', password: 'myPwd', host: 'localhost', socketTimeout: 100})
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

## `pool.getConnection(callback)`

>
> * `callback`: *function* Callback function with arguments ([Error](#error), [Connection](#connection-api)).

Creates a new [Connection](#connection-api) object.
Connection must be given back to pool with the connection.end() method.

**Example:**

```javascript
const mariadb = require('mariadb/callback');
const pool = mariadb.createPool({ host: 'mydb.com', user:'myUser' });
pool.getConnection((err, conn => {
  if (err) {
    console.log("not connected due to error: " + err);
  } else {
    console.log("connected ! connection id is " + conn.threadId);
    conn.end(); //release to pool
  }
}));
```

## `pool.query(sql[, values][, callback])`

> * `sql`: *string | JSON* SQL string or JSON object to supersede default connection options.  When using JSON object, object must have an "sql" key. For instance, `{ dateStrings: true, sql: 'SELECT now()' }`
> * `values`: *array | object* Placeholder values. Usually an array, but in cases of only one placeholder, it can be given as is. 
> * `callback`: *function* Callback function with arguments (error, results, metadata).

This is a shortcut to get a connection from pool, execute a query and release connection.

```javascript
const mariadb = require('mariadb/callback');
const pool = mariadb.createPool({ host: 'mydb.com', user:'myUser' });
pool.query("SELECT NOW()", (err, results, metadata) => {
  if (err) {
    //handle error
  } else {
    console.log(rows); //[ { 'NOW()': 2018-07-02T17:06:38.000Z }, meta: [ ... ] ]
  }
});
```

## `pool.batch(sql, values[, callback])`

> * `sql`: *string | JSON* SQL string or JSON object to supersede default connection options.  When using JSON object, object must have an "sql" key. For instance, `{ dateStrings: true, sql: 'SELECT now()' }`
> * `values`: *array* array of Placeholder values. Usually an array of array, but in cases of only one placeholder per value, it can be given as a single array. 
> * `callback`: *function* Callback function with arguments (error, results, metadata).

This is a shortcut to get a connection from pool, execute a batch and release connection.

```javascript
const mariadb = require('mariadb/callback');
const pool = mariadb.createPool({ host: 'mydb.com', user:'myUser' });
pool.query(
  "CREATE TABLE parse(autoId int not null primary key auto_increment, c1 int, c2 int, c3 int, c4 varchar(128), c5 int)"
);
pool
  .batch("INSERT INTO `parse`(c1,c2,c3,c4,c5) values (1, ?, 2, ?, 3)", 
    [[1, "john"], [2, "jack"]],
    (err, res) => {
      if (err) {
        //handle error
      } else {
        //res = { affectedRows: 2, insertId: 1, warningStatus: 0 }
        assert.equal(res.affectedRows, 2);
        pool.query("select * from `parse`", (err, res) => {
            /*
            res = [ 
                { autoId: 1, c1: 1, c2: 1, c3: 2, c4: 'john', c5: 3 },
                { autoId: 2, c1: 1, c2: 2, c3: 2, c4: 'jack', c5: 3 },
                meta: ...
              }
            */ 
        });
      }
  });
```

## `pool.end([callback])`

> * `callback`: *function* Callback function with argument ([Error](#error)).

Closes the pool and underlying connections gracefully.

```javascript
pool.end(err => {
  if (err) {
    //handle error
    console.log(err);
  } else {
    //connections have been ended properly    
  }
});
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
const mariadb = require('mariadb/callback');
const cluster = mariadb.createPoolCluster();
cluster.add("master", { host: 'mydb1.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave1", { host: 'mydb2.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave2", { host: 'mydb3.com', user: 'myUser', connectionLimit: 5 });
```

## `poolCluster.remove(pattern)`

> * `pattern`: *string* regex pattern to select pools. Example, `"slave*"`
>
remove and end pool(s) configured in cluster.


## `poolCluster.end([callback])`

> * `callback`: *function* Callback function with argument ([Error](#error)).

Closes the pool cluster and underlying pools.

```javascript
poolCluster(err => {
  if (err) {
    //handle error
    console.log(err);
  } else {
    //pools have been ended properly    
  }
});
```


## `poolCluster.getConnection([pattern, ][selector, ]callback)`

> * `pattern`:  *string* regex pattern to select pools. Example, `"slave*"`. default `'*'`
> * `selector`: *string* pools selector. Can be 'RR' (round-robin), 'RANDOM' or 'ORDER' (use in sequence = always use first pools unless fails). default to the  
> * `callback`: *function* Callback function with arguments ([Error](#error), [Connection](#connection-api)).
> 

Creates a new [Connection](#connection-api) object.
Connection must be given back to pool with the connection.end() method.

**Example:**

```javascript
const mariadb = require('mariadb/callback');
const cluster = mariadb.createPoolCluster();
cluster.add("master", { host: 'mydb1.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave1", { host: 'mydb2.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave2", { host: 'mydb3.com', user: 'myUser', connectionLimit: 5 });
cluster.getConnection("slave*", (err, conn) => {
  //use connection and handle possible error
})
```

## `poolCluster events`

PoolCluster object inherits from the Node.js [`EventEmitter`](https://nodejs.org/api/events.html). 
Emits 'remove' event when a node is removed from configuration if the option `removeNodeErrorCount` is defined 
(default to 5) and connector fails to connect more than `removeNodeErrorCount` times. 
(if other nodes are present, each attemps will wait for value of the option `restoreNodeTimeout`)

```javascript
const mariadb = require('mariadb/callback');
const cluster = mariadb.createPoolCluster({ removeNodeErrorCount: 20, restoreNodeTimeout: 5000 });
cluster.add("master", { host: 'mydb1.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave1", { host: 'mydb2.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave2", { host: 'mydb3.com', user: 'myUser', connectionLimit: 5 });*
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
const mariadb = require('mariadb/callback')

const cluster = mariadb.createPoolCluster();
cluster.add("master-north", { host: 'mydb1.com', user: 'myUser', connectionLimit: 5 });
cluster.add("master-south", { host: 'mydb1.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave1-north", { host: 'mydb2.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave2-north", { host: 'mydb3.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave1-south", { host: 'mydb2.com', user: 'myUser', connectionLimit: 5 });

const masterCluster = cluster.of('master*');
const northSlaves = cluster.of(/^slave?-north/, 'RANDOM');
northSlaves.getConnection((err, conn) => {
    //use that connection
});
```

### `filtered pool cluster`

* `filteredPoolCluster.getConnection(callback)` : Creates a new connection from pools that corresponds to pattern .
* `filteredPoolCluster.query(sql[, values][, callback])` : this is a shortcut to get a connection from pools that corresponds to pattern, execute a query and release connection.

