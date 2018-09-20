
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


## Callback API

The Connector with the Callback API is similar to the one using Promise, but with a few differences.


**Create Connection:**

* [`createConnection(options) → Connection`](#createconnectionoptions--connection): Creates a connection to a MariaDB Server.


**Connection:**

* [`query(sql[, values][, callback]) → Emitter`](#querysql-values-callback---emitter): Executes a [query](#query).
* [`beginTransaction([callback])`](#begintransaction-callback): Begins a transaction
* [`commit([callback])`](#commit-callback): Commit the current transaction, if any.
* [`rollback([callback])`](#rollback-callback): Rolls back the current transaction, if any.
* [`changeUser(options[, callback])`](#changeuseroptions-callback): Changes the current connection user.
* [`ping([callback]) → Promise`](#ping-callback): Sends an empty packet to the server to check that connection is active.
* [`end([callback])`](#end-callback): Gracefully closes the connection.


### `createConnection(options) → Connection`

> * `options`: *JSON* Uses the same options as Promise API. For a complete list, see [option documentation](/documentation/connection-options.md).
>
>Returns a Connection object

Creates a new connection.

The difference between this method and the same with the Promise API is that this method returns a `Connection` object, rather than a Prromise that resolves to a `Connection` object.

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
 
### `query(sql[, values][, callback])` -> `Emitter`

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

#### Placeholder

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

#### Query Results

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

##### Result-set array

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

#### Streaming

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

### `beginTransaction([callback])`

> * `callback`: *function* Callback function with argument [Error](../README.me#error) if any error.

Begins a new transaction.

## `commit([callback])`

> * `callback`: *function* callback function with argument [Error](../README.me##error) if any error.

Commits the current transaction, if there is one active.  The Connector keeps track of the current transaction state on the server.  When there isn't an active transaction, this method sends no commands to the server.


### `rollback([callback])`

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
 
### `changeUser(options[, callback])`

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

### `ping([callback])`

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

### `end([callback])`

> * `callback`: *function* Callback function with argument [Error](../README.me##error) if any error.

Closes the connection gracefully.  That is, the Connector waits for current queries to finish their execution then closes the connection.

```javascript
conn.end(err => {
  //handle error
})
```
