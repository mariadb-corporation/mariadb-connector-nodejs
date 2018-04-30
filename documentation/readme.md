
#### table of contents

TODO have automatically generated table of contents


## Connection

common API to mysql/mysql2:

* `connect(callback)`: Connect event with callback
* `changeUser(options, callback)`: change current connection user
* `beginTransaction(options, callback)`: begin transaction
* `commit(options, callback)`: commit current transaction if any
* `rollback(options, callback)`: rollback current transaction if any
* `ping(options, callback)`: send an empty packet to server to check that connection is active
* `query(sql[, values][,callback])`: execute a [query](#query).
* `pause()`: pause socket output.
* `resume()`: resume socket output.
* `on(eventName, listener)`: register to connection event
* `once(eventName, listener)`: register to next connection event
* `end(callback)`: gracefully end connection
* `destroy()`: force connection ending. 


Not implemented : 

* `escape(value)`
* `escapeId(value)`
* `format(sql, value)`
* `stats(options, callback)`

escape function are not intentionally implemented, since it can lead to injection. use Connection.query(sql, values), it will be more secure and faster
statistic method is public in mysql, but not documented. 

### Initiate a connection

For faster connections when database is on localhost, either the Unix socket file to use (default /tmp/mysql.sock), 
or, on Windows where the server has been started with the --enable-named-pipe option, the name (case-insensitive) of the named pipe to use (default MySQL).

This is done by setting the option 'socketPath' (host and port option are then ignored).
This permit to avoid TCP-IP layer. 

If not on localhost, then hostname must be set, port is optional with default 3306, connector will then use TCP/IP socket. 

```javascript
const mariadb      = require('mariadb');

//localhost on windows
const conn1 = mariadb.createConnection({socketPath: '\\\\.\\pipe\\MySQL'});

//localhost on unix
const conn2 = mariadb.createConnection({socketPath: '/tmp/mysql.sock'});

//not localhost
const conn3 = mariadb.createConnection({host: 'mydb.com', port:9999});
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
* `typeCast`: permit casting results type  
 
## Query
`connection.query(sql[, values][,callback])`


* `sql` : *string / object*
* `values`: *object / array* of placeholder values
* `callback`: *function* that will be called after reception of error/results. see [description](#callback)
* `return`: command object that emits event. see [query events](#query-events) list  

sql parameter Object can be used to supersede default option.
Object must then have sql property.
example : {dateStrings:true, sql:'SELECT now()'}


```javascript
connection.query('SELECT 1', (err, res, fields) => {
  //...
});

//with placeholder
connection.query('INSERT INTO mytable VALUES (?,?)', ['data', 5], (err, res) => {
  //...
});

//with options
connection.query({dateStrings:true, sql:'SELECT now()'}, (err, res, fields) => {
  //...
});
```

## Query callback function
* `Error`: an [Error](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error) object
* `results`: a resultset. See [callback results](#callback-results).
* `column metadatas`: an array describing the fields. see [Field metadata](#field-metadata)

### Error
The [Error](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error) may have the following additional properties :
         
* fatal : *boolean* indicating if connection is still valid
* errno = error number. 
* sqlState = sql state code

see [error codes](https://mariadb.com/kb/en/library/mariadb-error-codes/) for error number and sql state signification.

### Placeholder

To avoid SQL Injection, queries permit using question mark place holder. Values will be escaped accordingly to their type.

example :  
```javascript
connection.query('INSERT INTO someTable VALUES (?, ?, ?)', [1, Buffer.from("D6E742F72", "hex"), 'mariadb']);
//will send INSERT INTO someTable VALUES (1, _BINARY '..B.', 'mariadb'); 
```
The option "namedPlaceholders" permit using named placeholder. 
Values must then have the key corresponding to placeholder names. 

(Question mark still is the recommended method, particularly using execute, avoiding query parsing.)
 
example :  
```javascript
connection.query({namedPlaceholders:true, 'INSERT INTO someTable VALUES (:id, :img, :db)', { id: 1, img: Buffer.from("D6E742F72", "hex"), db: 'mariadb'});
//will send INSERT INTO someTable VALUES (1, _BINARY '..B.', 'mariadb'); 
``` 

### Callback results
There is 2 different kind of results : a "change" result and a result-set.

for insert/delete/update commands, results is a "change" result object with the following properties: 

* affectedRows: number of affected rows
* insertId: last auto increment insert id
* warningStatus: indicating if query ended with warning. 

```javascript
connection.query('CREATE TABLE animals (' +
                       'id MEDIUMINT NOT NULL AUTO_INCREMENT,' +
                       'name VARCHAR(30) NOT NULL,' +
                       'PRIMARY KEY (id))');
connection.query('INSERT INTO animals(name) value (?)', ['sea lions'], (err, res, fields) => {
  console.log(res); 
  //log : ChangeResult { affectedRows: 1, insertId: 1, warningStatus: 0 }
});
```

For result-set, an array representing the data of each rows. Data results format can differ according to options nestTables and rowsAsArray.

default return an array containing a json object of data.
Examples :
```javascript
connection.query('select * from animals', (err, res, fields) => {
  console.log(res); 
  //log : 
  // [ 
  //    { id: 1, name: 'sea lions' }, 
  //    { id: 2, name: 'bird' } 
  // ]
});
```

using option nestTables, return an array of a json object is returned, separated by tables
Examples :
```javascript
connection.query({nestTables:true, 
                sql:'select a.name, a.id, b.name from animals a, animals b where b.id=1'}, 
                (err, res, fields) => {
  console.log(res); 
  //log : 
  //[ 
  // { 
  //   a: { name: 'sea lions', id: 1 }, 
  //   b: { name: 'sea lions' } 
  // },
  // { 
  //   a: { name: 'bird', id: 2 }, 
  //   b: { name: 'sea lions' } 
  // }
  //]
});
```

using option rowsAsArray is fastest (by 5-10% with local database), return an array of data array :
(driver do not parse metadata to read names)
Examples :
```javascript
connection.query({rowsAsArray:true, sql:'select * from animals'}, (err, res, fields) => {
  console.log(res); 
  //log : 
  // [ 
  //    [ 1, 'sea lions' ], 
  //    [ 2, 'bird' ] 
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

## query events
Event can be set on returning command object.
List of events :

| event name  | event arguments |
| ----------- | ------------- |
| "error"     | Error object  |
| "fields"    | Column array  |
| "result"    | row data  |
| "end"       | -  |

```javascript
let query = connection.query('SELECT host, user FROM mysql.user');
query.on('error', (err) => console.log(err));
query.on('result', (res) => console.log(res.host + '/' + res.user));
```

### Transaction
* `connection.beginTransaction(options, callback)`: begin transaction
* `connection.commit(options, callback)`: commit current transaction
* `connection.rollback(options, callback)`: rollback current transaction

Driver does know current transaction state, if no transaction is active, 
commit/rollback commands won't send any command to server. 

```javascript
conn.beginTransaction();
conn.query("INSERT INTO testTransaction values ('test')");
conn.query("INSERT INTO testTransaction values ('test2')", (err) => {
  if (err) return conn.rollback();
  conn.commit();
});
```
 
TODO difference
- error print command + parameters
- changedRows resultset that depend on language not defined (available if disabling foundRows).

### Change connection user

This permit to resets the connection and re-authenticates with the given credentials. 
This is equivalent of creating a new connection, reusing open socket. 

```javascript
conn.changeUser({user: 'changeUser', password: 'mypassword'}, (err) => {
  //connection user is now changed. 
});
```

