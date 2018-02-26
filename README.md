<p align="center">
  <a href="http://mariadb.org/">
    <img src="https://mariadb.com/themes/custom/mariadb/logo.svg">
  </a>
</p>

# Under Construction

# MariaDB Node connector

MariaDB node.js connector is a &ge; 4.0 node driver, used to connect MariaDB and MySQL databases. 
MariaDB node.js connector is LGPL version 2.1 licensed.

Tracker link TODO add tracker link

## Status
[![Linux Build](https://travis-ci.org/rusher/node-mariadb.svg?branch=master)](https://travis-ci.org/rusher/node-mariadb)
[![Windows Build](https://ci.appveyor.com/api/projects/status/nkvfmixam8tciem4?svg=true)](https://ci.appveyor.com/project/rusher/node-mariadb)
[![License (LGPL version 2.1)](https://img.shields.io/badge/license-GNU%20LGPL%20version%202.1-green.svg?style=flat-square)](http://opensource.org/licenses/LGPL-2.1)


TODO change CI link to mariadb repos

__Table of contents__

TODO
why new driver ? 
2 good existing drivers, but not the same perf than C connector wrapper : we expect better, particularly when query has a result-set.
Goal is to have an efficient driver, and provide additional feature : 
- TODO list feature: streaming, ...
 
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
 

## Query

API : connection.query(sql[, values][,callback])

* sql: string / object.
  object can be used to supersede default option
  object must then have sql property.  
* values: object / array of placeholder values
* callback function

return : command object

Examples :
```javascript
//simple example
connection.query('INSERT INTO mytable VALUES (?)', ['data'], (err, res) => {
  //...
});

//with options
connection.query({dateStrings:true, sql:'SELECT now()', (err, res, fields) => {
  //...
});
```

### callback
parameters :
* Error  
* results
* column metadata

#### Error 
An Error Object with the following additional properties : 
* fatal : boolean indicating if connection is still valid
* errno = error number. 
* sqlState = sql state code
see https://mariadb.com/kb/en/library/mariadb-error-codes/ for error number and sql state signification.

#### results
for insert/delete/update commands, results is an object with the following properties: 

* affectedRows: number of affected rows
* insertId: last auto increment insert id
* warningStatus: indicating if query ended with warning. 
Examples :
```javascript
connection.query('CREATE TABLE animals (' +
                       'id MEDIUMINT NOT NULL AUTO_INCREMENT,' +
                       'name VARCHAR(30) NOT NULL,' +
                       'PRIMARY KEY (id)');

//with options
connection.query('INSERT INTO animals(name) value (?)', ['sea lions'], (err, res, fields) => {
  //...
});
```

for query returning a result-set, returning data in array. 
 


### event
Event can be set on returning command object.
List of events :
| event name  | event arguments |
| ----------- | ------------- |
| "error"     | Error object  |
| "fields"    | Column array  |
| "result"    | row data  |
| "end"       | -  |

Examples :
```javascript
//simple example
let query = connection.query('SELECT host, user FROM mysql.user');
query.on('error', (err) => console.log(err));
query.on('result', (res) => console.log(res.host + '/' + res.user));
```


 

 


