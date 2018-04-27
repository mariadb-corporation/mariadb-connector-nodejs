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

100% javascript, compatible with [mysql client](https://www.npmjs.com/package/mysql) with some additional features : 

#### Streaming
```script
    const readable = fs.createReadStream(fileName);
    connection.query("insert into StreamingTable(b) values(?)", [readable], (err, res) => {
        //id of new record is res.insertId
    }};
```
 
#### Pipelining
  
Commands will be send without waiting for server results<br/>
Example: executing to queries, ""INSERT xxx" and "INSERT yyy"

<pre>
          │ ――――――――――――――――――――― send first insert ―――――――――――――> │ ┯ 
          │ ――――――――――――――――――――― send second insert ――――――――――――> │ │  processing first insert
          │                                                        │ │ 
Client    │ <―――――――――――――――――――― first insert result ―――――――――――― │ ▼  ┯
          │                                                        │    │ processing second insert
          │                                                        │    │
          │ <―――――――――――――――――――― second insert result ――――――――――― │    ▼ </pre>

queries are not send one by one, waiting for result before sending next one.
queries are send one after another, avoiding a lot of network latency ([detail information](/documentation/pipelining.md)). 

## Benchmarks

Comparison with popular connectors :
* mysql - https://www.npmjs.com/package/mysql (version 2.15.0)
* mysql2 - https://www.npmjs.com/package/mysql2 (version 1.5.3)

```
mysql   : 5,841 ops/sec ±0.70%
mysql2  : 6,971 ops/sec ±0.64%
mariadb : 8,526 ops/sec ±0.96%
```

<img src="./documentation/misc/bench.png" width="559" height="209"/>

_Those results are done without any caching for mariadb connector, mysql2 use some caching_

[Benchmarks in details](/documentation/benchmarks.md) //TODO 

## Roadmap 

Some features are not implemented in first beta version, but will in next beta version : 

    * Pooling and "PoolCluster" are not implemented in first version
    * MariaDB new ed25519 plugin authentication
    * Query timeout
    * Bulk insert (fast batch)  

## Obtaining the driver

Driver is compatible with node 6+.

The driver can be install using npm : 
```script
npm install mariadb --save
```

## Documentation

For a Getting started guide, API docs, recipes,  etc. see the 
* [Changelog](/documentation/changelog.md)
* [Complete API documentation](/documentation/readme.md)


## Contributing
To get started with a development installation and learn more about contributing, please follow the instructions at our 
[Developers Guide.](/documentation/developers-guide.md)

Tracker link <a href="https://jira.mariadb.org/projects/CONJS/issues/">https://jira.mariadb.org/projects/CONJS/issues/</a>

