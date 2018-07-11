<p align="center">
  <a href="http://mariadb.org/">
    <img src="https://mariadb.com/themes/custom/mariadb/logo.svg">
  </a>
</p>

# MariaDB Node.js connector

[![Linux Build](https://travis-ci.org/rusher/mariadb-connector-nodejs.svg?branch=master)](https://travis-ci.org/rusher/mariadb-connector-nodejs)
[![Windows status](https://ci.appveyor.com/api/projects/status/nuvvbkx82ixfhp12?svg=true)](https://ci.appveyor.com/project/rusher/mariadb-connector-nodejs)
[![License (LGPL version 2.1)](https://img.shields.io/badge/license-GNU%20LGPL%20version%202.1-green.svg?style=flat-square)](http://opensource.org/licenses/LGPL-2.1)
[![Coverage Status](https://coveralls.io/repos/github/rusher/mariadb-connector-nodejs/badge.svg)](https://coveralls.io/github/rusher/mariadb-connector-nodejs)

**Non-blocking MariaDB and MySQL client for Node.js.**

MariaDB and MySQL client, 100% javascript, compatible with node 7.6+, with promise API.

Why a new client when having already nice and popular [mysql](https://www.npmjs.com/package/mysql) and [mysql2](https://www.npmjs.com/package/mysql2) client ? <br/>
To offer new functionality like insert streaming, pipelining, and make no compromise on performance. 

### Streaming insert data
```javascript
    
    https.get('https://someContent', readableStream => {
        //readableStream implement Readable, driver will stream data to database 
        connection.query("INSERT INTO myTable VALUE (?)", [readableStream]);
    });
```
 
### Pipelining
  
Commands will be send without waiting for server results, preserving order<br/>
Example: executing two queries, "INSERT xxx" and "INSERT yyy"

<pre>
          │ ――――――――――――――――――――― send first insert ―――――――――――――> │ ┯ 
          │ ――――――――――――――――――――― send second insert ――――――――――――> │ │  processing first insert
          │                                                        │ │ 
Client    │ <―――――――――――――――――――― first insert result ―――――――――――― │ ▼  ┯
          │                                                        │    │ processing second insert
          │                                                        │    │
          │ <―――――――――――――――――――― second insert result ――――――――――― │    ▼ </pre>

Connector won't wait for query results to send next one.
Queries are send one after another, avoiding a lot of network latency ([detail information](/documentation/pipelining.md)). 


## Benchmarks

Comparison with popular connectors :
* [promise-mysql](https://www.npmjs.com/package/promise-mysql) version 3.3.1 + [mysql](https://www.npmjs.com/package/mysql) version 2.15.0 
* [mysql2](https://www.npmjs.com/package/mysql2) version 1.5.3

```
promise-mysql  : 1,366 ops/sec ±1.42%
mysql2         : 1,469 ops/sec ±1.63%
mariadb        : 1,802 ops/sec ±1.19%
```

<img src="./documentation/misc/bench.png" width="559" height="209"/>

[Benchmarks in details](/documentation/benchmarks.md) 

## Road-map 

Some features are not implemented yet, but will in next versions : 

    * Pooling and "PoolCluster" are not implemented in first version
    * MariaDB new ed25519 plugin authentication
    * Query timeout
    * Bulk insert (fast batch)  


## Contributing
To get started with a development installation and learn more about contributing, please follow the instructions at our 
[Developers Guide.](/documentation/developers-guide.md)

Tracker link [https://jira.mariadb.org/projects/CONJS/issues/](https://jira.mariadb.org/projects/CONJS/issues/)


# Quick Start

    npm install mariadb

Using ECMAScript < 2017:
```js
  const mariadb = require('mariadb');
  mariadb.createConnection({host: 'mydb.com', user:'myUser'})
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
    async function asyncFunction() {
      let conn;
      try {
        conn = await mariadb.createConnection({host: 'localhost', user: 'root'});
    
        const rows = await conn.query("SELECT 1 as val");
        console.log(rows); //[ {val: 1}, meta: ... ]
        const res = await conn.query("INSERT INTO myTable value (?, ?)", [1, "mariadb"]);
        console.log(res); // { affectedRows: 1, insertId: 1, warningStatus: 0 }
    
      } catch (err) {
        return Promise.reject(err);
      } finally {
        if (conn) return conn.end();
      }
      return Promise.resolve();
    }
```

# Documentation

There is 2 different API: Promise (default) and callback (for compatibility with mysql/mysql2 API).
The following documentation describe the Promise API. Check [Callback API documentation](/documentation/callback-api.md) for callback API difference.   

## Install

Using npm:

```javascript
npm install mariadb
```

## API

Create Connection

* [`createConnection(options) → Promise`](#createconnectionoptions--promise) : create a new connection

Connection API: 

* [`query(sql[, values]) → Promise`](#querysql-values---promise): execute a query.
* [`queryStream(sql[, values]) → Emitter`](#querystreamsql-values--emitter): execute a query, returning an emitter object to stream rows.
* [`beginTransaction() → Promise`](#begintransaction--promise): begin transaction
* [`commit() → Promise`](#commit--promise): commit current transaction if any
* [`rollback() → Promise`](#rollback--promise): rollback current transaction if any
* [`changeUser(options) → Promise`](#changeuseroptions--promise): change current connection user
* [`ping() → Promise`](#ping--promise): send a 1 byte packet to database to validate connection
* [`isValid() → boolean`](#isvalid--boolean): check that connection is active without checking socket state
* [`end() → Promise`](#end--promise): gracefully end connection
* [`destroy()`](#destroy): force connection ending. 
* [`pause()`](#pause): pause socket output.
* [`resume()`](#resume): resume socket output.
* [`serverVersion()`](#serverversion): get current server version 
* [`events`](#events): to subscribe to connection error event.

## `createConnection(options) → Promise`

> * `options`: *JSON* [connection option documentation](#connection-options)
>
>Returns a promise that :
>  * resolves with a [connection object](#connection-object)
>  * rejects with an [Error](#error).

Create a new connection.

Example : 
```javascript
const mariadb = require('mariadb');
mariadb.createConnection({
      host: 'mydb.com', 
      user:'myUser'
    })
    .then(conn => {
      console.log("connected ! connection id is " + conn.threadId);
    })
    .catch(err => {
      console.log("not connected due to error: " + err);
    });
```

### Connection options

Essential options list:

|option|description|type|default| 
|---:|---|:---:|:---:| 
| **user** | user to access database |*string* | 
| **password** | user password |*string* | 
| **host** | IP or DNS of database server. *Not used when using option `socketPath`*|*string*| "localhost"|  
| **port** | database server port number. *Not used when using option `socketPath`*|*integer*| 3306|
| **ssl** | tls support. see [option documentation](/documentation/connection-options.md#ssl) for detailed explanation|*mixed*|
| **database** | default database when establishing connection| *string* | 
| **socketPath** | Permits connecting to the database via Unix domain socket or named pipe|  *string* |  
| **compress** | the exchanges with database will be gzipped. That permit better performance when database is distant (not in same location)|*boolean*| false|  
| **connectTimeout** | connection timeout in ms|*integer* | 10 000|
| **socketTimeout** | socket timeout in ms after connection succeed. (0 = no timeout)|*integer* | 0|
| **rowsAsArray** | return resultset as array, not JSON. Faster way to get results. See Query for detail information|*boolean* | false|

See [option documentation](/documentation/connection-options.md) for complete list.    

### Connecting to a local database

With local database, the TCP-IP layer can be avoided to have better performance. 

This is done by setting the option 'socketPath' to either the Unix socket file or the Windows named pipe.
The `host` and `port` options are then ignored. 

The server variable [@@socket](https://mariadb.com/kb/en/library/server-system-variables/#socket) contain the socket name. 
Default is usually '/tmp/mysql.sock' on Unix and 'MySQL' on windows (the server must have been started with the --enable-named-pipe option for windows).

Example with local database on unix : 
```javascript
const mariadb = require('mariadb');
mariadb.createConnection({socketPath: '/tmp/mysql.sock'})
    .then(conn => { ... })
    .catch(err => { ... });
```

example with local database on windows :
```javascript
const mariadb = require('mariadb');
mariadb.createConnection({socketPath: '\\\\.\\pipe\\MySQL'})
    .then(conn => { ... })
    .catch(err => { ... });
```
 
## `query(sql[, values])` -> `Promise`

> * `sql`: *string | JSON* sql string or JSON object to supersede default connections options.
>           When using JSON object, object must have a "sql" key
>           example : { dateStrings: true, sql: 'SELECT now()' }
> * `values`: *array | object* placeholder values. Usually an array, but in case of only one placeholder, can be given as is. 
>
>Returns a promise that :
>  * resolves with a JSON object for update/insert/delete or a [result-set](#result-set-array) object for result-set.
>  * rejects with an [Error](#error).


Send a query to database and return result as a Promise.

example with sql string:
```js
   connection
      .query("SELECT now()")
      .then(rows => {
        console.log(rows); //[ { 'now()': 2018-07-02T17:06:38.000Z }, meta: [ ... ] ]
      })
      .catch(err => {
        //handle error
      });
```

example with json options:
```js
    connection
       .query({dateStrings:true, sql:'SELECT now()'})
       .then(rows => {
          console.log(rows); //[ { 'now()': '2018-07-02 19:06:38' }, meta: [ ... ] ]
        })
        .catch(...)
```

### Placeholder

To avoid SQL Injection, queries permit using question mark placeholders. Values will be escaped accordingly to their type.
Values can be of native javascript type, Buffer, Readable, object with toSqlString method, or object will be stringified (JSON.stringify). 

For streaming, objects that implement Readable will be streamed automatically. 
You may look at 2 server option that might interfere : 
- [@@net_read_timeout](https://mariadb.com/kb/en/library/server-system-variables/#net_write_timeout) : Query must be received totally sent before reaching this timeout (default to 30s)
- [@@max_allowed_packet](https://mariadb.com/kb/en/library/server-system-variables/#max_allowed_packet) : Maximum data size send to server. 
  

example :  
```js
    connection
      .query(
         "INSERT INTO someTable VALUES (?, ?, ?)", 
         [1,Buffer.from("c327a97374", "hex"),"mariadb"]
      )
      .then(...)
      .catch(...);
      //will send INSERT INTO someTable VALUES (1, _BINARY '.\'.st', 'mariadb')
```


example streaming: 
```javascript
const https = require("https");
//3Mb page
https.get("https://node.green/#ES2018-features-Promise-prototype-finally-basic-support",
  readableStream => {
    connection.query("INSERT INTO StreamingContent (b) VALUE (?)", [readableStream]);
      .then(res => {
        //inserted
      })
      .catch(console.log);
  }
)
```

### Query result

There is 2 different kind of results depending on queries. 
For insert/delete/update commands, results is a JSON object with the following properties: 

* affectedRows: *integer* number of affected rows
* insertId: *integer* last auto increment insert id. 
* warningStatus: *integer* indicate if query ends with warning. 

```js
connection.query('CREATE TABLE animals (' +
                       'id MEDIUMINT NOT NULL AUTO_INCREMENT,' +
                       'name VARCHAR(30) NOT NULL,' +
                       'PRIMARY KEY (id))');
connection.query('INSERT INTO animals(name) value (?)', ['sea lions'])
    .then(res => {
      console.log(res); 
      //log : { affectedRows: 1, insertId: 1, warningStatus: 0 }
    })
    .catch(...);
```

#### Result-set array

For result-set, the result is an array of rows, with an additional property "meta" containing an array of [column metadata](#column-metadata) information. 

Row default format is JSON, but 2 other formats are possible with options nestTables and rowsAsArray.

Examples :
```javascript
connection.query('select * from animals')
    .then(res => {
      console.log(res); 
      // [ 
      //    { id: 1, name: 'sea lions' }, 
      //    { id: 2, name: 'bird' }, 
      //    meta: [ ... ]
      // ]
    });
```

### Query options

* [namedPlaceholders](#namedPlaceholders)
* [typeCast](#typeCast)
* [rowsAsArray](#rowsAsArray)
* [nestTables](#nestTables)
* [dateStrings](#dateStrings)
* [supportBigNumbers](#supportBigNumbers)
* [bigNumberStrings](#bigNumberStrings)

Those options can be set on query level, but are usually set at connection level, then will apply to all queries. 

#### namedPlaceholders

*boolean, default false*

Using question mark is the recommended method, but the option "namedPlaceholders" permit using named placeholder. 
Values must contain the keys corresponding to placeholder names. 
 
example :  
```javascript
    connection
      .query(
        { namedPlaceholders: true, sql: "INSERT INTO someTable VALUES (:id, :img, :db)" },
        { id: 1, img: Buffer.from("c327a97374", "hex"), db: "mariadb" }
      )
      .then(...)
      .catch(...);
```

#### rowsAsArray

*boolean, default false*

Using option rowsAsArray permit to have row format as an array (not as JSON).
This permit to save memory and avoid connector to have to parse [column metadata](#column-metadata) completely. It is fastest row format (by 5-10% with local database).


Default format : { id: 1, name: 'sea lions' }
with option "rowsAsArray" : [ 1, 'sea lions' ]

Example :
```javascript
connection.query({ rowsAsArray: true, sql: 'select * from animals' })
    .then(res => {
      console.log(res); 
      // [ 
      //    [ 1, 'sea lions' ], 
      //    [ 2, 'bird' ],
      //    meta: [...]
      // ]
    });
```

#### nestTables

*boolean / string, default false*

Some queries could return the columns with the **same** name. The standard JSON format won't permit having 2 keys with same name.
 
Setting the option nestTables to true, data will be group by table.
When using string parameter, json field name will be prefixed by table name + nestTable value. 

Example with boolean value:
```javascript
connection.query({nestTables:true, 
                sql:'select a.name, a.id, b.name from animals a, animals b where b.id=1'})
    .then(res => {
      console.log(res); 
      //[ 
      //  { 
      //     a: { name: 'sea lions', id: 1 }, 
      //     b: { name: 'sea lions' } 
      //  },
      //  { 
      //     a: { name: 'bird', id: 2 }, 
      //     b: { name: 'sea lions' } 
      //  },
      //  meta: [...]
      //]
    });
```

Example with string value:
```javascript
connection.query({nestTables: '_', 
                sql:'select a.name, a.id, b.name from animals a, animals b where b.id=1'})
    .then(res => {
      console.log(res); 
      //[ 
      //  { a_name: 'sea lions', a_id: 1, b_name: 'sea lions' }, 
      //  { a_name: 'bird', a_id: 2, b_name: 'sea lions' },
      //  meta: [...]
      //]
    });
```

#### dateStrings

*boolean, default: false*

Indicate if date must be retrieved as a string (not as a Date object)  

#### supportBigNumbers

*boolean, default: false*

If integer is not in ["safe"](documentation/connection-options.md#support-for-big-integer) range, the value will be return as a [Long](https://www.npmjs.com/package/long) object.


#### bigNumberStrings

*boolean, default: false*

if integer is not in ["safe"](documentation/connection-options.md#support-for-big-integer) range, the value will be return as a string

#### typeCast

*Experimental*

*function(column, next)*

If can cast type yourself if needed using option `typeCast`.

Example for casting all TINYINT(1) to boolean :
```javascript
const tinyToBoolean = (column, next) => {
  if (column.type == "TINY" && column.length === 1) {
    const val = column.int();
    return val === null ? null : val === 1;
  }
  return next();
};
connection.query({typeCast: tinyToBoolean, sql:"..."});
```

## Column metadata

* `collation`: object indicating column collation. Properties : index, name, encoding, maxlen. Example : 33, "UTF8_GENERAL_CI", "utf8", 3 
* `columnLength`: column maximum length if there is a limit, 0 if not (for blob).
* `type`: column type int value. see [values](/lib/const/field-type.js)
* `columnType`: column type string value. see [values](/lib/const/field-type.js). example "DECIMAL"
* `scale`: decimal part length.  
* `flags`: byte encoded flags. see [values](/lib/const/field-detail.js) 
* `db()`: database schema name (alias `schema()` exists)
* `table()`: table alias
* `orgTable()`: real table name
* `name()`: column alias
* `orgName()`: real column name

```js
    connection
      .query("SELECT 1, 'a'")
      .then(rows => {
        console.log(rows);
        // [ 
        //   { '1': 1, a: 'a' },
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
        // ]
        assert.equal(rows.length, 1);
      })
```


## queryStream(sql[, values]) → Emitter

> * `sql`: *string | JSON* sql string value or JSON object to supersede default connections options.
>           if JSON object, must have a "sql" property
>           example : { dateStrings: true, sql: 'SELECT now()' }
> * `values`: *array | object* placeholder values. usually an array, but in case of only one placeholder, can be given as is. 
>
>Returns an Emitter object that emit different type of event:
>  * error : emit an [Error](#error) object if query failed. (No "end" event will be emit then).
>  * columns : emit when columns metadata from result-set are received (parameter is an array of [Metadata fields](#metadata-field)).
>  * data : emit each time a row is received (parameter is a row). 
>  * end : emit when query ended (no parameter). 

The function "query" return a promise returning all data at once. For huge result-set, that mean stored all data in memory. 
The function "queryStream" is very similar to query, but the event driven architecture will permit to handle a row one by one, to avoid overloading memory.   

If query time and result handle will take some amount of time, you may consider changing [@@net_read_timeout](https://mariadb.com/kb/en/library/server-system-variables/#net_read_timeout): 
Query must be received totally before this timeout (default to 60s).

example : 
```javascript
connection.queryStream("SELECT * FROM mysql.user")
      .on("error", err => {
        console.log(err); //if error
      })
      .on("columns", meta => {
        console.log(meta); // [ ...]
      })
      .on("data", row => {
        console.log(row);
      })
      .on("end", () => {
        //ended
      });
```

## `beginTransaction() → Promise`

>
>Returns a promise that :
>  * resolves (no argument)
>  * rejects with an [Error](#error).

Begin a new transaction.

## `commit() → Promise`

>
>Returns a promise that :
>  * resolves (no argument)
>  * rejects with an [Error](#error).

Commit current transaction, if there is any active.
(Driver does know current transaction state: if no transaction is active, no commands will be send to database) 


## `rollback() → Promise`

>
>Returns a promise that :
>  * resolves (no argument)
>  * rejects with an [Error](#error).

Rollback current transaction, if there is any active.
(Driver does know current transaction state: if no transaction is active, no commands will be send to database) 

Example : 
```javascript
conn.beginTransaction()
  .then(() => {
    conn.query("INSERT INTO testTransaction values ('test')");
    return conn.query("INSERT INTO testTransaction values ('test2')");
  })
  .then(() => {
    conn.commit();
  })
  .catch((err) => {
    conn.rollback();
  })
```
 
## `changeUser(options) → Promise`

> * `options`: *JSON*, subset of [connection option documentation](#connection-options) = database / charset / password / user
>
> Returns a promise that :
>   * resolves without result
>   * rejects with an [Error](#error).

This permit to resets the connection and re-authenticates with the given credentials. 
This is equivalent of creating a new connection with a new user, reusing open socket. 

Example : 
```javascript
conn.changeUser({user: 'changeUser', password: 'mypassword'})
   .then(() => {
      //connection user is now changed. 
   })
   .catch(err => {
      //error
   });
```

## `ping() → Promise`

>
>Returns a promise that :
>  * resolves (no argument)
>  * rejects with an [Error](#error).

Send to database a packet containing one byte to check that the connection is active.

Example : 
```javascript
conn.ping()
  .then(() => {
    //connection is valid
  })
  .catch(err => {
    //connection is closed
  })
```

## `isValid() → boolean`

> Returns a boolean

Indicates the state of the connection as the driver knows it.
Socket might be disconnected without connector still knowing it.

## `end() → Promise`

>Returns a promise that :
>  * resolves (no argument)
>  * rejects with an [Error](#error).

Gracefully end the connection. Connector will wait for current executing queries to finish, then close connection. 

Example : 
```javascript
conn.end()
  .then(() => {
    //connection has ended properly
  })
  .catch(err => {
    //connection was closed but not due of current end command
  })
```


## `destroy()`

Immediately close the connection. If there is a running query, it will be interrupted, and database will log this as an unexpected socket close. 

Example : 
```javascript
  conn.query(
      "select * from information_schema.columns as c1, " +
       "information_schema.tables, information_schema.tables as t2"
    )
    .then(rows => {
      //won't occur
    })
    .catch(err => {
      console.log(err);
      //Error: Connection destroyed, command was killed
      //    ...
      //  fatal: true,
      //  errno: 45004,
      //  sqlState: '08S01',
      //  code: 'ER_CMD_NOT_EXECUTED_DESTROYED' 
      done();
    });
  conn.destroy(); //will immediately close the connection, even if query above would have take a minute
```

## `pause()`

Pauses the reading of data.  

## `resume()`

Resume the pause. 


## `serverVersion()` 

> Returns a string 

Return current connected server version or throw an Error if not connected. 

Example : 
```javascript
  console.log(connection.serverVersion()); //10.2.14-MariaDB
```

## Error

On error, Promise return an [Error](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error) object with the following additional properties :
* fatal : *boolean* indicating if connection is still valid
* errno : error number. 
* sqlState : sql state code
* code : error code.

Example on console.log(error): 
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

Errors contain error stack, query and parameter values (length limited to 1024 characters by default).
To get initial stack trace (the "From event ..."  part of previous example), connection option "trace" must be enable.  

See [error codes](https://mariadb.com/kb/en/library/mariadb-error-codes/) for error number and sql state signification.

## `events`

Connection object inherit from node.js [EventEmitter](https://nodejs.org/api/events.html), to emit 'error' event when connection close unexpectedly.

Example : 
```javascript
  const mariadb = require('mariadb');
  mariadb.createConnection({user: 'root', host: 'localhost', socketTimeout: 100})
  .then(conn => {
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
  })
  .catch(done);
```


