<p align="center">
  <a href="http://mariadb.org/">
    <img src="https://mariadb.com/themes/custom/mariadb/logo.svg">
  </a>
</p>

# MariaDB Node.js connector

[![Linux Build](https://travis-ci.org/rusher/mariadb-connector-nodejs.svg?branch=master)](https://travis-ci.org/rusher/mariadb-connector-nodejs)
[![Windows status](https://ci.appveyor.com/api/projects/status/nuvvbkx82ixfhp12?svg=true)](https://ci.appveyor.com/project/rusher/mariadb-connector-nodejs)
[![License (LGPL version 2.1)](https://img.shields.io/badge/license-GNU%20LGPL%20version%202.1-green.svg?style=flat-square)](http://opensource.org/licenses/LGPL-2.1)


**Non-blocking MariaDB and MySQL client for Node.js.**

100% javascript, [mysql](https://www.npmjs.com/package/mysql) compatible driver with some additional features : 
- streaming
```script
var postFile = function (req, res) => {
    connection.query('insert into Streaming(b) values(?), [req], (err, res) => {
        //id will be res.insertId
    });
};
      
```
 
- pipelining : commands will be send without waiting for server results
```script
connection.query("INSERT INTO myTable VALUES (1)");
connection.query("INSERT INTO myTable VALUES (2)");
```
queries are not send one by one, waiting for result before sending next one. 
queries are send one after another, avoiding a lot of network latency ([detail information](/documentation/pipelining.md)). 

Extended documentation of API : [Complete documentation](/documentation/readme.md)

## Benchmarks

Goal is to best the actual most performant driver [mariasql](https://www.npmjs.com/package/mariasql) that is a C driver, and not maintained.
But a C driver with a javascript wrapper has some inherent issues : must be compiled and mostly, this wrapping of all data result in loss of performance for big resultset.    
 
//TODO make benchmark when version is out, with 
* mysql and mysql2 (because the most popular) 
* mariasql (because the best in term of performance, even if not maintained)
  
<p align="center">
    <img src="https://fakeimg.pl/350x200/?text=benchmark%201"/>
    <img src="https://fakeimg.pl/350x200/?text=benchmark%202"/>  
</p>

explain why good perfs compared to existing drivers (avoiding string concatenation, buffer are send are binary, not hexa string, ...)



## Obtaining the driver

Driver is compatible with node 4+.

The driver can be install using npm : 
```script
npm install mariadb --save
```

## Documentation

For a Getting started guide, API docs, recipes,  etc. see the 
* [Changelog](/documentation/changelog.md)
* [Documentation](/documentation/readme.md)


## Contributing
To get started with a development installation and learn more about contributing, please follow the instructions at our 
[Developers Guide.](/documentation/developers-guide.md)

Tracker link <a href="https://jira.mariadb.org/projects/CONJS/issues/">https://jira.mariadb.org/projects/CONJS/issues/</a>

