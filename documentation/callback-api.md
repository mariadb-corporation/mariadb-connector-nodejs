
# Documentation

There is 2 different connection implementation Promise (default) and callback for compatibility with mysql/mysql2 API.
The following documentation describe the callback API.

## Install

Using npm:

```javascript
npm install mariadb
```

import is not `require('mariadb')`, but `require('mariadb/callback')`
Callback API is similar to the Promise one, with this difference : 

## Callback API

Create Connection

* [`createConnection(options) → Connection`](#createconnectionoptions--connection) : create connection

Connection : 

* [`query(sql[, values][, callback]) → Emitter`](#querysql-values-callback---emitter): execute a [query](#query).
* [`beginTransaction([callback])`](#begintransaction-callback): begin transaction
* [`commit([callback])`](#commit-callback): commit current transaction if any
* [`rollback([callback])`](#rollback-callback): rollback current transaction if any
* [`changeUser(options[, callback])`](#changeuseroptions-callback): change current connection user
* [`ping([callback]) → Promise`](#ping-callback): send an empty packet to server to check that connection is active
* [`end([callback])`](#end-callback): gracefully end connection


## `createConnection(options) → Connection`

> * `options`: *JSON* same option than Promise API. See [option documentation](/documentation/connection-options.md) for complete list.  
>
>Returns a Connection object

Create a new connection.
Difference compared to Promise API is that it return a Connection object, not a Promise that resolve with a Connection Object. 

Example : 
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
 
## `query(sql[, values][, callback])` -> `Emitter`

> * `sql`: *string | JSON* sql string value or JSON object to supersede default connections options.
>           if JSON object, must have a "sql" property
>           example : {dateStrings:true, sql:'SELECT now()'}
> * `values`: *array | object* placeholder values. usually an array, but in case of only one placeholder, can be given as is. 
> * `callback`: *function* callback function with arguments (error, results, metadata).
>
>Returns an Emitter object that emit different type of event:
>  * error : emit an [Error](#error) object when query failed.
>  * columns : emit when columns metadata from result-set are received (parameter is an array of [Metadata fields](#metadata-field)).
>  * data : emit each time a row is received (parameter is a row). 
>  * end : emit query ended (no parameter). 


Send a query to database with callback function when done. 
For huge result-set, that mean stored all data in memory, the prefered way is then to use the Emitter object to handle a row one by one, avoiding overload memory.  

example with sql string:
```js
   connection.query("SELECT now()", (err, rows, meta) => {
      if (err) throw err;
      console.log(rows); //[ { 'now()': 2018-07-02T17:06:38.000Z } ]
   });
```

example with json options:
```js
    connection.query({dateStrings:true, sql:'SELECT now()'}, (err, rows, meta) => {
      if (err) throw err;
      console.log(rows); //[ { 'now()': '2018-07-02 19:06:38' } ]
   });
```

### Placeholder

To avoid SQL Injection, queries permit using question mark place holder. Values will be escaped accordingly to their type.
Values can be of native javascript type, Buffer, Readable or object with toSqlString method. if not object will be stringified (JSON.stringify). 

For streaming, Objects that implement Readable will be streamed automatically. 
You may look at 2 server option that might interfere : 
- [@@net_write_timeout](https://mariadb.com/kb/en/library/server-system-variables/#net_write_timeout) : Query must be received totally sent before reaching this timeout (default to 30s)
- [@@max_allowed_packet](https://mariadb.com/kb/en/library/server-system-variables/#max_allowed_packet) : Maximum data size send to server. 
  

example :  
```js
    //will send INSERT INTO someTable VALUES (1, _BINARY '.\'.st', 'mariadb')
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


example streaming: 
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

### Query result

There is 2 different kind of results depending on queries. 
For insert/delete/update commands, results is a JSON object with the following properties: 

* affectedRows: number of affected rows
* insertId: last auto increment insert id
* warningStatus: indicating if query ended with warning. 

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

For result-set, an array representing the data of each rows. Data results format can differ according to options nestTables and rowsAsArray.
default return an array containing a json object of each row.

Examples :
```javascript
    connection.query('select * from animals', (err, res, meta) => {
      console.log(res); 
      // [ 
      //    { id: 1, name: 'sea lions' }, 
      //    { id: 2, name: 'bird' }, 
      //    meta: [ 
      //         ColumnDefinition {name: 'id', ...},
      //         ColumnDefinition {name: 'name', ...}
      //    ]
      // ]  
    });
```

### streaming

example : 
```javascript
connection.query("SELECT * FROM mysql.user")
      .on("error", err => {
        console.log(err); //when error
      })
      .on("columns", meta => {
        console.log(meta);
        //    meta: [ 
        //         ColumnDefinition {name: 'Host', ...},
        //         ColumnDefinition {name: 'User', ...},
        //         ... 
        //    ]

      })
      .on("data", row => {
        console.log(row);
      })
      .on("end", () => {
        //ended
      });
```

## `beginTransaction([callback])`

> * `callback`: *function* callback function with argument [Error](../README.me#error) if any error.

Begin a new transaction.

## `commit([callback])`

> * `callback`: *function* callback function with argument [Error](../README.me##error) if any error.

Commit current transaction, if there is any active.
(Driver does know current transaction state: if no transaction is active, no commands will be send to database) 


## `rollback([callback])`

> * `callback`: *function* callback function with argument [Error](../README.me##error) if any error.

Rollback current transaction, if there is any active.
(Driver does know current transaction state: if no transaction is active, no commands will be send to database) 

Example : 
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

This permit to resets the connection and re-authenticates with the given credentials. 
This is equivalent of creating a new connection with a new user, reusing open socket. 

Example : 
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

> * `callback`: *function* callback function with argument [Error](../README.me##error) if any error.

Send to database a packet containing one byte to check that the connection is active.

Example : 
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

> * `callback`: *function* callback function with argument [Error](../README.me##error) if any error.

Gracefully end the connection. Connector will wait for current query, then close connection. 

Example : 
```javascript
conn.end(err => {
  //handle error
})
```
