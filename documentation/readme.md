
#### table of contents

TODO have automatically generated table of contents


## Connection API

* `connect() => Promise`: connect to database. 
* `changeUser([options]) => Promise`: change current connection user
* `beginTransaction() => Promise`: begin transaction
* `commit() => Promise`: commit current transaction if any
* `rollback() => Promise`: rollback current transaction if any
* `ping() => boolean`: send an empty packet to server to check that connection is active
* `isValid() => boolean`: check that connection is active
* `query(sql[, values]) => Promise`: execute a [query](#query).
* `pause()`: pause socket output.
* `resume()`: resume socket output.
* `end() => Promise`: gracefully end connection
* `destroy()`: force connection ending. 

### Initiate a connection

For faster connections when database is on localhost, either the Unix socket file to use (default /tmp/mysql.sock), 
or, on Windows where the server has been started with the --enable-named-pipe option, the name (case-insensitive) of the named pipe to use (default MySQL).

This is done by setting the option 'socketPath' (host and port option are then ignored).
This permit to avoid TCP-IP layer. 

If not on localhost, then hostname must be set, port is optional with default 3306, connector will then use TCP/IP socket. 

```javascript
const mariadb      = require('mariadb');

//localhost on windows
mariadb.createConnection({socketPath: '\\\\.\\pipe\\MySQL'})
    .then(conn => {
      console.log("connected ! connection id is " + conn.threadId);
    })
    .catch(err => {
      console.log("not connected due to error: " + err);
    });

//localhost on unix
mariadb.createConnection({socketPath: '/tmp/mysql.sock'})
    .then(...)
    .catch(...);

//not localhost
mariadb.createConnection({host: 'mydb.com', port:9999})
    .then(...)
    .catch(...);
```

### Connection options

#### Important option 

* `user`: string. user
* `host`: string. IP or DNS of database server. default: 'localhost'
* `port`: integer. database server port number. default: 3306
* `database`: string. default database when establishing connection.
* `password`: string. user password 
* `socketPath`: string. Permits connecting to the database via Unix domain socket or named pipe, if the server allows it.
* `compress`: boolean. The exchanges with database will be gzipped. That permit better performance when database is distant (not in same location). default: false
* `connectTimeout`: integer. connection timeout in ms. default: 10 000.
* `socketTimeout`: integer. socket timeout in ms after connection succeed. default: 0 = no timeout.

Support for big integer: 

Javascript integer use IEEE-754 representation, meaning that integer not in ±9,007,199,254,740,991 range cannot be exactly represented.
MariaDB/MySQL server have data type that permit bigger integer. 
 
For those integer that are not in [safe](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isSafeInteger) range default implementation will return an integer that may be not the exact representation. 
2 options permit to have the exact value :          

* `bigNumberStrings`: if integer is not in "safe" range, the value will be return as a string. 
* `supportBigNumbers`: if integer is not in "safe" range, the value will be return as a [Long](https://www.npmjs.com/package/long) object.

#### Ssl

* `ssl`: boolean/JSON object. 

See [dedicated documentation](ssl.md).    
    
#### Other options 

* `charset`: *string* define charset exchange with server. default: UTF8MB4_UNICODE_CI
* `dateStrings`: *boolean*  indicate if date must be retrived as string (not as date). default: false
* `debug`: *boolean* when active, log all exchange wirh servers. default: false
* `foundRows`: *boolean* active, update number correspond to update rows. disable indicate real rows changed.  default: true.
* `multipleStatements`: *boolean* Permit multi-queries like "insert into ab (i) values (1); insert into ab (i) values (2)". this may be **security risk** in case of sql injection. default: false
* `namedPlaceholders`: *boolean* Permit using named placeholder, default: false
* `permitLocalInfile`: *boolean* permit using LOAD DATA INFILE command.  
this (ie: loading a file from the client) may be a security problem :
A "man in the middle" proxy server can change the actual file requested from the server so the client will send a local file to this proxy.
if someone can execute a query from the client, he can have access to any file on the client (according to the rights of the user running the client process).
default: false
* `timezone`: *string* force using indicated timezone, not current node.js timezone. possible value are 'Z' (fot UTC), 'local' or '±HH:MM' format    
* `nestTables`: *boolean/string* resultset are presented by table to avoid results with colliding fields. default: false 
* `rowsAsArray`: *boolean* default rows are defined as a JSON object. when active row is an array. default false 
* `pipelining`: *boolean* will send query one by one, but without waiting the results of previous entry ([detail information](/documentation/pipelining.md)). default true
* `trace`: *boolean* will add the stack trace at the time of query creation to error stacktrace 
* `typeCast`: permit casting results type  
 
## Query

#### `query(sql[, values])` -> `Promise`

Execute a Query.

* `sql` : *string | object*
           sql parameter Object can be used to supersede default option.
           Object must then have sql property.
           example : {dateStrings:true, sql:'SELECT now()'}
* `values`: *array | object* placeholder values

return a Promise.

example:
```js
   connection
      .query("SELECT 1 as col")
      .then(rows => {
        console.log(rows[0]); //{ col: 1 }
      })
      .catch(err => {
        //handle error
      });
```

with options:
```js
    connection.query({dateStrings:true, sql:'SELECT now()'})
    .then(...)
    .catch(...)
```

### Placeholder

To avoid SQL Injection, queries permit using question mark place holder. Values will be escaped accordingly to their type.

example :  
```js
    connection
      .query("INSERT INTO someTable VALUES (?, ?, ?)", [
        1,
        Buffer.from("c327a97374", "hex"),
        "mariadb"
      ])
      .then(...)
      .catch(...);
      //will send INSERT INTO someTable VALUES (1, _BINARY '.\'.st', 'mariadb')
```

The option "namedPlaceholders" permit using named placeholder. 
Values must then have the key corresponding to placeholder names. 

(Question mark still is the recommended method, particularly using execute, avoiding query parsing.)
 
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

### Promise results

#### Promise rejection

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
    fatal: false,
    errno: 1146,
    sqlState: '42S02',
    code: 'ER_NO_SUCH_TABLE' } }
```

Errors contain error stack, query and parameter values (length limited to 1024 characters).
To get initial stack trace, connection option "trace" must be enable.  

Example on console.log(error) with connection option trace: 
```
{ Error: (conn=116, no: 1146, SQLState: 42S02) Table 'testn.falsetable' doesn't exist
  sql: INSERT INTO falseTable(t1, t2, t3, t4, t5) values (?, ?, ?, ?, ?)  - parameters:[1,0x01ff,'hh','01/01/2001 00:00:00.000',null]
      ...
      at Socket.Readable.push (_stream_readable.js:134:10)
      at TCP.onread (net.js:559:20)
   From event:
      at C:\projects\mariadb\mariadb-connector-nodejs\lib\connection.js:185:29
      at Connection.query (C:\projects\mariadb\mariadb-connector-nodejs\lib\connection.js:183:12)
      at Context.<anonymous> (C:\projects\mariadb\mariadb-connector-nodejs\test\integration\test-error.js:250:8)
    fatal: false,
    errno: 1146,
    sqlState: '42S02',
    code: 'ER_NO_SUCH_TABLE' } }
```

See [error codes](https://mariadb.com/kb/en/library/mariadb-error-codes/) for error number and sql state signification.


#### Promise fulfilled

There is 2 different kind of results : a "change" result and a result-set.

for insert/delete/update commands, results is a "change" result object with the following properties: 

* affectedRows: number of affected rows
* insertId: last auto increment insert id
* warningStatus: indicating if query ended with warning. 

```js
connection.query('CREATE TABLE animals (' +
                       'id MEDIUMINT NOT NULL AUTO_INCREMENT,' +
                       'name VARCHAR(30) NOT NULL,' +
                       'PRIMARY KEY (id))')
connection.query('INSERT INTO animals(name) value (?)', ['sea lions'])
    .then(res => {
      console.log(res); 
      //log : ChangeResult { affectedRows: 1, insertId: 1, warningStatus: 0 }
    })
    .catch(...);
```

For result-set, an array representing the data of each rows. Data results format can differ according to options nestTables and rowsAsArray.

default return an array containing a json object of data, with metadata information.
Examples :
```javascript
connection.query('select * from animals')
    .then(res => {
      console.log(res); 
      // [ 
      //    { id: 1, name: 'sea lions' }, 
      //    { id: 2, name: 'bird' }, 
      //    meta: {...} 
      // ]
    });
```

using option nestTables, return an array of a json object is returned, separated by tables
Examples :
```javascript
connection.query({nestTables:true, 
                sql:'select a.name, a.id, b.name from animals a, animals b where b.id=1'})
    .then(res => {
      console.log(res); 
      //[ 
      // { 
      //   a: { name: 'sea lions', id: 1 }, 
      //   b: { name: 'sea lions' } 
      // },
      // { 
      //   a: { name: 'bird', id: 2 }, 
      //   b: { name: 'sea lions' } 
      // },
      // meta: {...} 
      //]
    });
```

using option rowsAsArray is fastest (by 5-10% with local database), return an array of data array :
(driver do not parse metadata to read names)
Examples :
```javascript
connection.query({rowsAsArray:true, sql:'select * from animals'})
    .then(res => {
      console.log(res); 
      // [ 
      //    [ 1, 'sea lions' ], 
      //    [ 2, 'bird' ],
      //    meta: {...} 
      // ]
    });
```

If can cast type yourself if needed using option `typeCast`.
example for casting all TINYINT(1) to boolean :
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


*the options have been set on query level for better understanding, but can be set on connection level*

### Field metadata
properties
* `db`: database schema name (alias `schema` exists for compatibilit with mysql2)
* `table`: field table alias
* `orgTable`: field table
* `name`: field alias
* `orgName`: field name
* `columnLength`: column length
* `columnType`: column type (see FieldType)
* `decimals`: decimal length (for DECIMAL field type)

methods
* `isUnsigned()`: indicate if field type is unsigned
* `canBeNull()`: indicate if field can be null
* `isPrimaryKey()`: indicate if field is part of primary key
* `isUniqueKey()`: indicate if field is part of unique key
* `isBlob()`: indicate if field is blob
* `isZeroFill()`: indicate if field is configured to fill with zero
* `isBinary()`: indicate if field contain binary data
* `isAutoIncrement()`: indicate if field is auto increment
* `getPrecision()`: return decimal precision
* `getDisplaySize()`: return max displayed size or -1 if size cannot be known


### Transaction
* `beginTransaction() => Promise`: begin transaction
* `commit() => Promise`: commit current transaction
* `rollback()`: rollback current transaction

Driver does know current transaction state: if no transaction is active, 
commit/rollback commands won't send any command to server. 

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
 
### Change connection user

This permit to resets the connection and re-authenticates with the given credentials. 
This is equivalent of creating a new connection, reusing open socket. 

```javascript
conn.changeUser({user: 'changeUser', password: 'mypassword'}, (err) => {
  //connection user is now changed. 
});
```

