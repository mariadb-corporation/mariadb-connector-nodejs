
<p align="center">
  <a href="http://mariadb.org/">
    <img src="https://mariadb.com/themes/custom/mariadb/logo.svg">
  </a>
</p>

[![Linux Build](https://travis-ci.org/rusher/mariadb-connector-nodejs.svg?branch=master)](https://travis-ci.org/rusher/mariadb-connector-nodejs)
[![Windows status](https://ci.appveyor.com/api/projects/status/nuvvbkx82ixfhp12?svg=true)](https://ci.appveyor.com/project/rusher/mariadb-connector-nodejs)
[![License (LGPL version 2.1)](https://img.shields.io/badge/license-GNU%20LGPL%20version%202.1-green.svg?style=flat-square)](http://opensource.org/licenses/LGPL-2.1)


#### table of contents

TODO have automatically generated table of contents


## MariaDB node.js driver
MariaDB node.js connector is a &ge; 4.0 node driver to connect MariaDB and MySQL databases. 
MariaDB node.js connector is LGPL version 2.1 licensed.

Why a new driver ?! There is already some good community driver (like [mysql](https://www.npmjs.com/package/mysql) and [mysql2](https://www.npmjs.com/package/mysql2) ), but core implementation has flaws : use string concatenation, doesn't permit streaming...

TODO add tracker link

## Connection

common API to mysql/mysql2:

* `connect(callback)`: Connect event with callback
* `changeUser(options, callback)`: change current connection user
* `beginTransaction(options, callback)`: begin transaction
* `commit(options, callback)`: commit current transaction
* `rollback(options, callback)`: rollback current transaction
* `ping(options, callback)`: send an empty packet to server to ensure connection
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

escape function are not implemented, since it can lead to injection. 
statistic method is public in mysql, but not documented. 
 
## Query
`connection.query(sql[, values][,callback])`


* `sql` : string / object
* `values`: object / array of placeholder values
* `callback`: function that will be called after reception of error/results. see [description](#callback)
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
         
* fatal : boolean indicating if connection is still valid
* errno = error number. 
* sqlState = sql state code

see [error codes](https://mariadb.com/kb/en/library/mariadb-error-codes/) for error number and sql state signification.


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

*the options have been set on query level for better understanding, but can be set on connection level*

### Field metadata
properties
* `schema`: field schema
* `table`: field table alias
* `orgTable`: field table
* `name`: field alias
* `orgName`: field name

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


 
 
TODO
why good perf ? 
- avoiding string concatenation
- buffer are send are binary, not hexa string

TODO explain query timeout using SET STATEMENT max_statement_time=XXX FOR
TODO explain debug option print hexa

TODO difference
- error print command + parameters
- changedRows resultset that depend on language not defined (available if disabling foundRows).



//TODO explain Bigint options :
for fields type DECIMAL and BIGINT: javascript does not support precise int value for value >=2^53 or < 2^53 (IEEE-754).
no option : big integer (>=2^53) may return approximate value
option bigNumberStrings => all BIGinteger are return as string
option supportBigNumbers => return int if comprise in -(2^53 -1) et 2^53 -1), or a long object (from https://www.npmjs.com/package/long) to permit having exact value
 


 
