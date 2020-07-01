# Change Log
## [2.4.0](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.4.0) (24 May 2020)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.3.1...2.4.0)

This version remove compatibility with Node.js 6, needing 10+ version !

* CONJS-86  - Support extension type format
* CONJS-128	- Error when using multipleStatements with metaAsArray
* CONJS-129	- Support 10.5 pluggable type
* CONJS-131	- checkDuplicate option is indicated in error when having dupplicate
* CONJS-132	- performance improvement
* CONJS-136	- typescript SqlError interface
	

## [2.3.1](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.3.1) (19 Mar. 2020)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.3.0...2.3.1)

Corrective release of 2.3.0, changing new connection option `timeout` to `queryTimeout` to avoid any confusion.

## [2.3.0](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.3.0) (19 Mar. 2020)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.2.0...2.3.0)
* CONJS-127 - Resultset with same identifier skip data. Now an error will be thrown.
* CONJS-126 - permit setting session query timeout per option
* CONJS-124 - Force connection.escapeId to emit backtick #101
* CONJS-123 - exporting SqlError class to permit instanceOf checks #100
* CONJS-122 - fix undefined localTz with timezone: 'Z' issue #92
* CONJS-121 - Connection.escapeId must always quote value to permit reserved words

misc:
* appveyor testing server version upgrade
* better debug logging trace format
* correct ssl test

## [2.2.0](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.2.0) (03 Feb. 2020)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.1.5...2.2.0)

    
##### CONJS-119	Add an option to detect Server version using a dedicated SELECT @@version

    Azure is using a proxy that will return a MySQL handshake not reflecting real server.
    A new option `forceVersionCheck` is added to permit issuing a new `SELECT @@Version` command on connection creation, 
    to retrieve the correct server version. Connector will then act according to that server version.

##### CONJS-20 add query timeout implementation

    This option is only permitted for MariaDB server >= 10.1.2, and permits to set a timeout to query operation. 
    Driver internally use `SET STATEMENT max_statement_time=<timeout> FOR <command>` permitting to cancel operation when timeout is reached, 
   
    Implementation of max_statement_time is engine dependent, so there might be some differences: For example, with Galera engine, a commits will ensure replication to other nodes to be done, possibly then exceeded timeout, to ensure proper server state.
     
#####  CONJS-110 fast-authentication improvement: 

      * add mysql_native_password to fast-authentication path
      * plugin 'mysql_native_password' is used by default if default server plugin is unknown
      * unexpected packet type during handshake result will throw a good error.
      
##### CONJS-117 Implement a pool leak detection

    A new option `leakDetection` permits to indicate a timeout to log connection borrowed from pool.
    When a connection is borrowed from pool and this timeout is reached, a message will be logged to console indicating a possible connection leak.
    Another message will tell if the possible logged leak has been released.
    A value of 0 (default) meaning Leak detection is disable   
    Additionally, some error messages have improved:
    - Connection timeout now indicate that this correspond to socket failing to establish
    - differentiate timeout error when closing pool to standard connection retrieving timeout


misc:
* CONJS-120 Permit values in SQL object to permits compatibility with mysql/mysql2
* CONJS-118 missing import for Error when asking for connection when pool is closed. Thanks to @WayneMDB
* correcting typescript import of @types/node to version >8 thanks to @SimonSchick
* dependencies update

## [2.1.5](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.1.5) (07 Jan. 2020)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.1.4...2.1.5)

* CONJS-115 Batch improvement 
  - supporting array of parameters if only one parameter per query, not only array of array
  - supporting empty array for query without parameters
* correction on licence tag: LGPL-2.1-or-later (was tag LGPL-2.1+ that is deprecated)
* dependencies update

## [2.1.4](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.1.4) (02 Dec. 2019)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.1.3...2.1.4)

* CONJS-112 use pool reset only for corrected COM_RESET_CONNECTION
* CONJS-111 missing pool event definition
* dependencies update


## [2.1.3](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.1.3) (14 Nov. 2019)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.1.2...2.1.3)

* CONJS-109 Missing mysql only collation definition
* CONJS-108 typescript escape/escapeId definition
* CONJS-107 Change user callback function not called when no option is set and changing collation only if collation option is correct
* CONJS-106 properly escape boolean parameter false
* CONJS-105 Typecast provided date function erroneous parsing
* CONJS-104 Pam authentication must permit to provide multiple passwords

misc:

* better cluster error when pool is full
* adding test coverage


## [2.1.2](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.1.2) (17 Oct. 2019)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.1.1...2.1.2)

Implemented enhancements:
* CONJS-101	Escape functions API
* CONJS-100	Improve performance using reusable Object type for column definition result
* CONJS-102 Expose library version to API

Use milestone to specify in which version bug was fixed #22
Fixed bugs:
* CONJS-96	TypeScript definition typecast correction
* CONJS-95	Pool idle maintainer error
* CONJS-98	Missing collation option in typescript definition
* CONJS-99	Improve documentation for best practice concerning credential
* CONJS-97	Remove coverage comment on github pull request

## [2.1.1](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.1.1) (06 Sep. 2019)

[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.1.0...2.1.1)

* node.je v12 CI testing
* cluster ordered selector bug fix on failover (thanks to @kkx)
* bump dependencies
* documentation update with node.js v12 minimum TLSv1.2 default support
* connection.reset() error message improvement (and documentation)
* small performance improvement when debug not enable

## [2.1.0](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.1.0) (11 Jul. 2019)

[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.0.5...2.1.0)

* [CONJS-19]	implement Ed25519 plugin		
* [CONJS-57]	Multiple alternative authentication methods for the same user		
* [CONJS-61]	Permit handling expired password		
* [CONJS-85]	Implement pool events according to mysql/mysql2 API		
* [CONJS-87]	Array parameter automatic conversion		
* [CONJS-88]	Charset collation option mismatch		
* [CONJS-89]	Performance improvement on decoding string	
* [CONJS-74]	Types definition must be string, not byte		
* [CONJS-75]	Missing import dependencies for typeScript		
* [CONJS-79]	Read errors while processing LOCAL INFILE causes process crash		
* [CONJS-83]	Add poolCluster 'remove' event		
* [CONJS-84]	option `restoreNodeTimeout` is not respected when removeNodeErrorCount is set		
* [CONJS-73]	Setting timezone to current IANA might provoque server automatic retrieval		

New Options

|option|description|type|default| 
|---:|---|:---:|:---:| 
| **`collation`** | (used in replacement of charset) Permit to defined collation used for connection. This will defined the charset encoding used for exchanges with database and defines the order used when comparing strings. It's mainly used for micro-optimizations|*string* |UTF8MB4_UNICODE_CI| 
| **`permitConnectionWhenExpired`** | Permit a user with expired password to connect. Only possible operation in this case will be to change password ('SET PASSWORD=PASSWORD('XXX')')|*boolean* |false|


## [2.0.5](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.0.5) (10 May 2019)

[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.0.4...2.0.5)

* [CONJS-71] TypeScript definition is not exported

## [2.0.4](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.0.4) (07 May 2019)

[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.0.3...2.0.4)

* [CONJS-69] permit set numeric parameter bigger than javascript 2^53-1 limitation
* [CONJS-68] error when reading datetime data and timezone option is set
* [CONJS-58] parse Query when receiving LOAD LOCAL INFILE, to prevent man in the middle attack 
* [CONJS-62] support named timezones and daylight savings time
* [CONJS-63] add type definitions for typescript
* [CONJS-64] handle Error packet during resultset to permit query timeout with SET STATEMENT max_statement_time=<val> FOR <query>
* [CONJS-66] SET datatype handling (returning array)
* [CONJS-67] Changing user does not takes in account connector internal state (transaction status)

#### Pool improvement

New Options

|option|description|type|default| 
|---:|---|:---:|:---:| 
| **`idleTimeout`** | Indicate idle time after which a pool connection is released. Value must be lower than [@@wait_timeout](https://mariadb.com/kb/en/library/server-system-variables/#wait_timeout). In seconds (0 means never release) |*integer* | 1800 |
| **`minimumIdle`** | Permit to set a minimum number of connection in pool. **Recommendation is to use fixed pool, so not setting this value**.|*integer* | *set to connectionLimit value* |

This permits to set a minimum pool size, meaning that after a period of inactivity, pool will decrease inner number of connection to a minimum number of connection (defined with `minimumIdle`). 
By default, connections not used after `idleTimeout` (default to 30 minutes) will be discarded, avoiding reaching server [@@wait_timeout](https://mariadb.com/kb/en/library/server-system-variables/#wait_timeout). 

Pool handle connection creation automatically, with now some delayed after failing to establish a connection, to avoid using CPU unnecessary. 
Authentication error in pool have now a better handling.


## [2.0.3](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.0.3) (30 Jan. 2019)

[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.0.2-rc...2.0.3)

* [CONJS-56] TypeError: Cannot read property 'totalConnections' of undefined
* [CONJS-59] pool now throw `ER_ACCESS_DENIED_ERROR` in place of basic timeout error
* [CONJS-60] handling pipe error for stream, avoiding hang in case of pipe error.
* [CONJS-55] Connector throw an error when using incompatible options


#### 2.0.2-rc - 11-12-2018 
## [2.0.2-rc](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.0.2-rc) (30 Jan. 2019)

[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.0.1-beta...2.0.2-rc)

##### Changes

* new option `noControlAfterUse` permitting to disable reset or rollback when giving back a connection pool. 

##### Correction 

* using option `connectAttributes` value `_server_host` is correctly filled on Performance Schema.
* batch improvement
	 * error thrown when no values
	 * BULK better handling when socket error during process
	 * Object with toSqlString function parameter support
	 * null value correction when using BULK
	 * timezone correction when not using "local" default values
	 * now support very long parameter (> 16M)
	 * rewrite support "\\" in parameter
* `timezone` option parsing correction (correctly handle negative values)	
* test coverage improvement
* minor performance improvement
* pool end() now correctly wait for all connections ending


#### 2.0.1-alpha - 15 Nov. 2018 

* [CONJS-52] (Bug) Commit not executed when in transaction and autocommit is enabled
* [CONJS-50] (Bug) race condition when using authentication plugins
* [CONJS-21] add bulk insert method
* [CONJS-38] Add connection reset
* [CONJS-41] Handle multiple server pools with failover capabilities
* [CONJS-49] test connector with maxscale
* [CONJS-51] Permit use of connection string to provide options
* [CONJS-48] Add option to permit query command when establishing a connection

#### 2.0.0-alpha - 20 Sep. 2018 

* [CONJS-42] check other connections in pool when an unexpected connection error occur
* [CONJS-44] Create option to permit setting Object to one prepareStatement parameter
* [CONJS-43] Callback API is missing
* [CONJS-39] support geometric GeoJSON structure format
* [CONJS-24] new option "sessionVariables" to permit setting session variable at connection
* [misc] connection.end() immediate resolution on socket QUIT packet send.
* [misc] improve documentation and set Promise API documentation to a dedicated page.
* [misc] change pool implementation to permit node 6 compatibility (removal of async await)
 

#### 0.7.0 - 18 Jul. 2018 

* First alpha version 
