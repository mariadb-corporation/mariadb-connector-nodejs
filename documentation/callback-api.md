
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
  const conn = mariadb.createConnection({host: 'mydb.com', user:'myUser'});
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


# Callback API

The Connector with the Callback API is similar to the one using Promise, but with a few differences.


**Base:**

* [`createConnection(options) → Connection`](#createconnectionoptions--connection): Creates a connection to a MariaDB Server.
* [`createPool(options) → Pool`](#createpooloptions--pool) : Creates a new Pool.
* [`createPoolCluster(options) → PoolCluster`](#createpoolclusteroptions--poolcluster) : Creates a new pool cluster.


**Connection:**

* [`query(sql[, values][, callback]) → Emitter`](#querysql-values-callback---emitter): Executes a [query](#query).
* [`beginTransaction([callback])`](#begintransaction-callback): Begins a transaction
* [`commit([callback])`](#commit-callback): Commit the current transaction, if any.
* [`rollback([callback])`](#rollback-callback): Rolls back the current transaction, if any.
* [`changeUser(options[, callback])`](#changeuseroptions-callback): Changes the current connection user.
* [`ping([callback]) → Promise`](#ping-callback): Sends an empty packet to the server to check that connection is active.
* [`end([callback])`](#end-callback): Gracefully closes the connection.


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
      user:'myUser'
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
const mariadb = require('mariadb');
const conn = mariadb.createConnection({ socketPath: '/tmp/mysql.sock', user: 'root' });
conn.connect(err => {
  //do something with connection
  conn.end();
});

```

It has a similar syntax on Windows: 

```javascript
const mariadb = require('mariadb');
const conn = mariadb.createConnection({ socketPath: '\\\\.\\pipe\\MySQL', user: 'root' });
```


### `createPool(options) → Pool`

> * `options`: *JSON/string* [pool options](#pool-options)
>
> Returns a [Pool](#pool-api) object,

Creates a new pool.

**Example:**

```javascript
const mariadb = require('mariadb');
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

#### Pool options

Pool options includes [connection option documentation](#connection-options) that will be used when creating new connections. 

Specific options for pools are :

|option|description|type|default| 
|---:|---|:---:|:---:| 
| **`acquireTimeout`** | Timeout to get a new connection from pool in ms. |*integer* | 10000 |
| **`connectionLimit`** | Maximum number of connection in pool. |*integer* | 10 |
| **`minDelayValidation`** | When asking a connection to pool, the pool will validate the connection state. "minDelayValidation" permits disabling this validation if the connection has been borrowed recently avoiding useless verifications in case of frequent reuse of connections. 0 means validation is done each time the connection is asked. (in ms) |*integer*| 500|


### `createPoolCluster(options) → PoolCluster`

> * `options`: *JSON* [poolCluster options](#poolCluster-options)
>
> Returns a [PoolCluster](#poolCluster-api) object,

Creates a new pool cluster. Cluster handle multiple pools, giving high availability / distributing load (using round robin / random / ordered ).

**Example:**

```javascript
const mariadb = require('mariadb');

const cluster = mariadb.createPoolCluster();
cluster.add("master", { host: 'mydb1.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave1", { host: 'mydb2.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave2", { host: 'mydb3.com', user: 'myUser', connectionLimit: 5 });

//getting a connection from slave1 or slave2 using round-robin
cluster.getConnection(/^slave*$, "RR", (err, conn) => {
  conn.query("SELECT 1", (err, rows) => {
     conn.end();
     return row[0]["@node"];
  });
});
```

 
#### PoolCluster options

Pool cluster options includes [pool option documentation](#pool-options) that will be used when creating new pools. 

Specific options for pool cluster are :

|option|description|type|default| 
|---:|---|:---:|:---:| 
| **`canRetry`** | When getting a connection from pool fails, can cluster retry with other pools |*boolean* | true |
| **`removeNodeErrorCount`** | Maximum number of consecutive connection fail from a pool before pool is removed from cluster configuration. |*integer* | 5 |
| **`restoreNodeTimeout`** | delay before a pool can be reused after a connection fails. 0 = can be reused immediately (in ms) |*integer*| 0|
| **`defaultSelector`** | default pools selector. Can be 'RR' (round-robin), 'RANDOM' or 'ORDER' (use in sequence = always use first pools unless fails) |*string*| 'RR'|


# Connection API
 
## `query(sql[, values][, callback])` -> `Emitter`

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

## `beginTransaction([callback])`

> * `callback`: *function* Callback function with argument [Error](../README.me#error) if any error.

Begins a new transaction.

## `commit([callback])`

> * `callback`: *function* callback function with argument [Error](../README.me##error) if any error.

Commits the current transaction, if there is one active.  The Connector keeps track of the current transaction state on the server.  When there isn't an active transaction, this method sends no commands to the server.


## `rollback([callback])`

> * `callback`: *function* Callback function with argument [Error](../README.me##error) if any error.

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
 
## `changeUser(options[, callback])`

> * `options`: *JSON*, subset of [connection option documentation](#connection-options) = database / charset / password / user
> * `callback`: *function* callback function with argument [Error](../README.me##error) if any error.

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

## `ping([callback])`

> * `callback`: *function* Callback function with argument [Error](../README.me##error) if any error.

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

## `end([callback])`

> * `callback`: *function* Callback function with argument [Error](../README.me##error) if any error.

Closes the connection gracefully.  That is, the Connector waits for current queries to finish their execution then closes the connection.

```javascript
conn.end(err => {
  //handle error
})
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
const mariadb = require('mariadb');
const pool = mariadb.createPool({ host: 'mydb.com', user:'myUser' });
pool.getConnection((err, conn => {
  if (err) {
    console.log("not connected due to error: " + err);
  } else {
    console.log("connected ! connection id is " + conn.threadId);
    conn.end(); //release to pool
  }
})
```

## `pool.query(sql[, values][, callback])`

> * `sql`: *string | JSON* SQL string or JSON object to supersede default connection options.  When using JSON object, object must have an "sql" key. For instance, `{ dateStrings: true, sql: 'SELECT now()' }`
> * `values`: *array | object* Placeholder values. Usually an array, but in cases of only one placeholder, it can be given as is. 
> * `callback`: *function* Callback function with arguments (error, results, metadata).

This is a shortcut to get a connection from pool, execute a query and release connection.

```javascript
const mariadb = require('mariadb');
const pool = mariadb.createPool({ host: 'mydb.com', user:'myUser' });
pool.query("SELECT NOW()", (err, results, metadata) => {
  if (err) {
    //handle error
  } else {
    console.log(rows); //[ { 'NOW()': 2018-07-02T17:06:38.000Z }, meta: [ ... ] ]
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

## `poolCluster.remove(pattern)``

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
const mariadb = require('mariadb');
const cluster = mariadb.createPoolCluster();
cluster.add("master", { host: 'mydb1.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave1", { host: 'mydb2.com', user: 'myUser', connectionLimit: 5 });
cluster.add("slave2", { host: 'mydb3.com', user: 'myUser', connectionLimit: 5 });
cluster.getConnection("slave*", (err, conn) => {
  //use connection and handle possible error
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

