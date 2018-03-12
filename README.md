<p align="center">
  <a href="http://mariadb.org/">
    <img src="https://mariadb.com/themes/custom/mariadb/logo.svg">
  </a>
</p>

# MariaDB java connector

MariaDB node.js connector is 100% javascript and [mysql](https://www.npmjs.com/package/mysql) compatible driver, used to connect applications developed in Java to MariaDB and MySQL databases. MariaDB Connector/J is LGPL licensed.

Extended documentation of API : [Complete documentation](/documentation/readme.md)

## Status
[![Linux Build](https://travis-ci.org/rusher/mariadb-connector-nodejs.svg?branch=master)](https://travis-ci.org/rusher/mariadb-connector-nodejs)
[![Windows status](https://ci.appveyor.com/api/projects/status/nuvvbkx82ixfhp12?svg=true)](https://ci.appveyor.com/project/rusher/mariadb-connector-nodejs)
[![License (LGPL version 2.1)](https://img.shields.io/badge/license-GNU%20LGPL%20version%202.1-green.svg?style=flat-square)](http://opensource.org/licenses/LGPL-2.1)


## Benchmarks

Goal is to best the actual most performant driver [mariasql](https://www.npmjs.com/package/mariasql) that is a C driver, and not maintained.
But a C driver with a javascript wrapper has some inherent issues : must be compiled and mostly, this wrapping of all data result in loss of performance for big resultset.    
 
//TODO make benchmark when version is out, with 
* mysql and mysql2 (because the most popular) 
* mariasql (because the actual more performant)
  
<p align="center">
    <img src="https://fakeimg.pl/350x200/?text=benchmark%201"/>
    <img src="https://fakeimg.pl/350x200/?text=benchmark%202"/>  
</p>

explain why good perfs compared to existing drivers (avoiding string concatenation, buffer are send are binary, not hexa string, ...)



## Obtaining the driver

Driver is compatible with node 4+.

The driver can be install using npm : 
```script
npm install <NPM NAME> --save
```

## Documentation

For a Getting started guide, API docs, recipes,  etc. see the 
* [Changelog](/documentation/changelog.md)
* [Documentation](/documentation/readme.md)


## Contributing
To get started with a development installation and learn more about contributing, please follow the instructions at our 
[Developers Guide.](/documentation/developers-guide.md)

Tracker link <a href="https://jira.mariadb.org/projects/CONJS/issues/">https://jira.mariadb.org/projects/CONJS/issues/</a>

