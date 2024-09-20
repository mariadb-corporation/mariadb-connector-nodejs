# Change Log

## [3.3.2](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/3.3.1) (Sept 2024)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/3.3.1...3.3.2)

## Issues Fixed
* CONJS-301 temporary disabling TLS identity validation until certificate automatic resolution
* CONJS-302 TypeScript type definition file for SqlError constructor does not match actual constructor
* CONJS-297	Typescript connection option timeout in place of queryTimeout
* CONJS-298	Typescript wrong named longlong in place of bigint

## [3.3.1](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/3.3.1) (May 2024)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/3.3.0...3.3.1)

## Issues Fixed
* CONJS-288 ensure pool timeout error give details #268
* CONJS-289 connection possibly staying in hanging state after batch execution #281
* CONJS-290 possible ECONRESET when executing batch #281
* CONJS-292 ensure String object parameter
* CONJS-286 exchanges stop when closing prepare and prepareCacheLength is set to 0
* CONJS-287	typescript missing queryoption for prepare command

## [3.3.0](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/3.3.0) (Mar 2024)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/3.2.3...3.3.0)

## Notable changes
* CONJS-284 pipeline PREPARE and EXECUTE
* CONJS-264 TLS ephemeral certificate automatic implementation
* CONJS-279 Improve text encoding decoding

## Issues Fixed
* CONJS-281 cannot connect to 11.3+ server with character-set-collations = utf8mb4=uca1400_ai_ci		
* CONJS-277 using connection.importFile when connection is not connected to database result in error		
* CONJS-278 Possible buffer overwrite when sending query bigger than 16M
* CONJS-282 error when using mysql_clear_test password authentication plugin		
* CONJS-283 wrong decoding of binary unsigned MEDIUMINT
* CONJS-285 DECIMAL field wrong decoding with deprecated option 'supportBigNumbers' set

## [3.2.3](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/3.2.3) (Dec 2023)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/3.2.2...3.2.3)

* CONJS-207 Add support for connection redirection
* CONJS-271 wrong binary decoding of 00:00:00 TIME values
* CONJS-272 Error doesn't always have parameters according to option
* CONJS-273 Bulk insert error when last bunch of parameters is reaching max_allowed_packet
* CONJS-274 permit disabling BULK insert for one batch
* CONJS-207 Add support for connection redirection


## [3.2.2](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/3.2.2) (Oct 2023)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/3.2.1...3.2.2)

## Issues Fixed
* CONJS-270 Always send connection attributes, even when connectAttributes is not set
* CONJS-269 avoid useless "set names utf8mb4" on connection creation if not needed
* CONJS-268 importFile method doesn't always throw error when imported commands fails #253
* CONJS-267 Ensure that option collation with id > 255 are respected


## [3.2.1](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/3.2.1) (Sep 2023)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/3.2.0...3.2.1)

## Notable changes
* CONJS-262 Binary result-set parsing performance improvement, avoiding to chromium slow issue https://bugs.chromium.org/p/v8/issues/detail?id=7161 
* CONJS-265 permit configuration of console warning message to be exported
* CONJS-266 Option `infileStreamFactory` addition for compatibility

## Issues Fixed
* CONJS-261 TypeScript missing logParam connection option
* CONJS-263 ensure respecting server collation


## [3.2.0](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/3.2.0) (Jun 2023)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/3.1.2...3.2.0)

## Notable changes
* CONJS-250	'undefined' parameters are now permitted, for compatibility with mysql/mysql2 behavior
* CONJS-257	permit to import sql file directly

#### new APIs:
  [importFile(options) → Promise](./documentation/promise-api.md#importfileoptions--promise)
  [connection.importFile({file:'...', 'database': '...'}) → Promise](./documentation/promise-api.md##connectionimportfileoptions--promise)
  [pool.importFile({file:'...', 'database': '...'}) → Promise](./documentation/promise-api.md#poolimportfileoptions--promise)

example: 
```javascript
    await conn.importFile({
        file: '/tmp/someFile.sql', 
        database: 'myDb'
    });
```

## Issues Fixed
* CONSJ-252 missing deprecated option supportBigNumbers and bigNumberStrings in Typescript
* CONJS-254 ensuring option connectTimeout is respected : timeout is removed when socket is successfully established, in place of returning connection object. Wasn't set when using pipe/unix socket
* CONJS-255	In some case, pipelining was use even option explicitly disable it
* CONJS-256 method changeUser can lead to error when using multi-authentication and pipelining
* CONJS-258	All eventEmitters methods are not available on connections

## [3.1.2](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/3.1.2) (May 2023)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/3.1.1...3.1.2)

## Notable changes
* CONJS-249	add connection.listeners function to permit TypeORM compatibility

## Issues Fixed
* CONJS-247	Improve error message when having set named parameter option and executing standard question mark command
* CONJS-248	Ensuring not using importing file after pool.end()

## [3.1.1](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/3.1.1) (Mar 2023)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/3.1.0...3.1.1)

## Issues Fixed
* CONJS-246 pool not listening to 'error' event might exit application on error
* CONJS-240 Repeating calling the same procedure gets a release prepare error.
* CONJS-244 correction for node.js 12 compatibility
* CONJS-245 batch failing when using bulk and metaAsArray


## [3.1.0](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/3.1.0) (Feb 2023)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/3.0.2...3.1.0)

## Notable changes

### Timezone handling (CONJS-237)

Connector now set session timezone, solving issue with [time function](https://mariadb.com/kb/en/time-zones/#time-zone-effects-on-functions), 
removing needs of client side conversion.

This requires that when using timezone options, to having server TZ data filled in case client timezone differ from server.

### Performance
* CONJS-230 better metadata parsing performance
* CONJS-229 performance improvement when parsing lots of parameter
* CONJS-238 faster execution for known length packet

### Other changes
* CONJS-225 Make result set's meta property non-enumerable
* CONJS-235 Allow to pass TypeScript generic types without need of "as"

## Issues Fixed
* CONJS-231 executing batch and when parameter can be too long to fit in one mysql packet, parameter can have 4 byte missing 
* CONJS-236 datatype TIME wrong binary decoding when not having microseconds
* CONJS-239 When using connection with callback, pre-commands (like `initSql`) might not always be executed first
* CONJS-232 in case of a long query running, connection.destroy() will close connection, but leaving server still running query for some time
* CONJS-240 adding a Prepare result wrapper to avoid multiple close issue with cache
* CONJS-241 metaAsArray missing option in typescript description


## [3.0.2](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/3.0.2) (Oct 2022)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/3.0.1...3.0.2)

## Notable changes
* CONJS-222	permit streaming prepare statement result
example : 
```javascript
const prepare = await shareConn.prepare('SELECT * FROM mysql.user where host = ?');
const stream = prepare.executeStream(['localhost']);    
try {
  for await (const row of stream) {
    console.log(row);
  }
} catch (e) {
  queryStream.close();
}
prepare.close();
```

## Issues Fixed
* CONJS-223	Metadata column name gets sporadic corrupted
* CONJS-211	Session timezone unset on connection re-use with connection pool
* CONJS-212	when throwing an error when using option `leakDetectionTimeout`, might result in throwing wrong error with `Cannot read properties of null (reading 'leaked')`
* CONJS-217	caching_sha2_password never succeed using FAST AUTHENTICATION. With correction, one less exchanges is done when connecting to a MySQL server
* CONJS-219	prepare cache was not limited to `prepareCacheLength` but can increase up to 2x the `prepareCacheLength` value, leading to possible ER_MAX_PREPARED_STMT_COUNT_REACHED
* CONJS-228	improving prepare cache performance
* CONJS-226	missing typescript metaAsArray option and documentation
* CONJS-213	update error code with recent MariaDB server
* CONJS-215	Executing after prepare close throw an undescriptive error
* CONJS-221	option debugLen and logParam are not documented
* CONJS-227	Allow setting idleTimeout to 0
* CONJS-214	missing pool.closed typescript definition
* CONJS-216	remove please-upgrade-node dependency
* CONJS-224	missing typescript checkNumberRange option definition


## [3.0.1](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/3.0.1) (Jul 2022)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/3.0.0...3.0.1)

## Notable changes
* Error description improvement
  * Pool might return a common error ‘retrieve connection from pool timeout after XXXms’ in place of real error.[CONJS-200]
  * [CONJS-209] Trace option now works when using pool/cluster. It is recommended to activate the trace option in development Since driver is asynchronous, enabling this option to save initial stack when calling any driver methods. This allows having the caller method and line in the error stack, permitting error easy debugging. The problem is this error stack is created using Error.captureStackTrace that is very very slow. To give an idea, this slows down by 10% a query like 'select * from mysql.user LIMIT 1', so not recommended in production.
      ```javascript
      const pool = mariadb.createPool({
      host: 'mydb.com',
      user: 'myUser',
      connectionLimit: 5,
      trace: true
      });
      await pool.query('wrong query');
      /* will throw an error like :
        SqlError: (conn:15868, no: 1064, SQLState: 42000) You have an error in your SQL syntax; check the manual that corresponds to your MariaDB server version for the right syntax to use near 'wrong query' at line 1
          sql: wrong query - parameters:[]
            at Object.module.exports.createError (errors.js:57:10)
            at ...
          From event:
            at Function._PARAM (\integration\test-pool.js:60:18)
            at …
          text: "You have an error in your SQL syntax; check the manual that corresponds to your MariaDB server version for the right syntax to use near 'wrong query' at line 1",
          sql: 'wrong query - parameters:[]',
          fatal: false,
          errno: 1064,
          sqlState: '42000',
          code: 'ER_PARSE_ERROR'
      */
      ```
  * Pool error description is improved indicating pool information, like [CONJS-208]:
    ```javascript
    SqlError: (conn:-1, no: 45028, SQLState: HY000) retrieve connection from pool timeout after 200ms
      (pool connections: active=1 idle=0 limit=1)
      at Object.module.exports.createError
      …
    ```
* node.js 18 supported [CONJS-197]
* New option `checkNumberRange`. When used in conjunction of `decimalAsNumber`, `insertIdAsNumber` or `bigIntAsNumber`, if conversion to number is not exact, connector will throw an error [CONJS-198]. This permits easier compatibility with mysql/mysql2 and 2.x version driver version.
* Performance enhancement for multi-rows resultset. Internal benchmarks show improved performance by 10% for a result-set of 1000 rows.[CONJS-210]

## Issues Fixed

* Wrong error returned "Cannot read properties of undefined… … (reading 'charset')" when error during handshake [CONJS-193]
* [CONJS-194] Charset change using parameterized query fails with "Uncaught TypeError: opts.emit is not a function"
* [CONJS-195] Error "cannot mix BigInt and other types" when parsing negative bigint
* [CONJS-196] connection.close() is now really an alias or connection.release()
* [CONJS-199] wrong return type for batch() on typescript
* [CONJS-201] typecast geometry parsing error
* [CONJS-202] support pre 4.1 error format for 'too many connection' error
* [CONJS-203] encoding error for connection attributes when using changeUser with connection attributes
* [CONJS-206] possible race condition on connection destroy when no other connection can be created
* [CONJS-204] handle password array when using authentication plugin “pam_use_cleartext_plugin”
* [CONJS-205] query hanging when using batch with option timeout in place of error thrown


## [3.0.0](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/3.0.0) (Jan 2022)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/3.0.0-rc...3.0.0)

* merged correction from 2.5.6
* [CONJS-185] considering BIT(1) as boolean (option bitOneIsBoolean permit to disable that behavior for compatibility)
* reliability: pool ensuring multi-request process order
* performance: set parser function once per result-set 
* documentation improvement

## [2.5.6](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.5.6) (Jan 2022)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.5.5...2.5.6)

* [CONJS-181] Local infile file validation doesn't take in account escaped value
* [CONJS-183] change default connection timeout value 1 second to permit pools to send correct error
* update documentation with for-await-of use #189
* correct character_set_client unexpect error parsing OK_Packet #177

## [3.0.0-rc](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/3.0.0-rc) (19 Oct 2021)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/3.0.0-beta...3.0.0-rc)

Notable change:
* [CONJS-168] stream backpressure not handled well
* [CONJS-172] performance improvement for multi-line result-set + update perf result with recent mysql/mysql2 drivers see [dedicated part](https://github.com/mariadb-corporation/mariadb-connector-nodejs/blob/maintenance/3.x/documentation/benchmarks.md) results. 
* [CONJS-168] correct stream backpressure
* [CONJS-176] Change Pool cluster default option removeNodeErrorCount value to Infinity
* [CONJS-175] Missing leakDetectionTimeout option in Typescript description
* [CONJS-178] Update code to recent Ecma version
* [CONJS-179] better pool option `resetAfterUse` default value
* [CONJS-180] compatibility: support mysql2 `stream` option
* 
* Corrections:
* [CONJS-125] permit using batch with returning clause
* [CONJS-170] Pool.query(undefined) never release connection
* [CONJS-173] not permitting providing null as a value without an array

## [3.0.0-beta](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/3.0.0-beta) (11 Jun 2021)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.5.4...3.0.0-beta)

Migrating from 2.x or mysql/mysql2 driver have some breaking changes, see [dedicated part](./documentation/promise-api.md#migrating-from-2x-or-mysqlmysql2-to-3x) documentation.

* [CONJS-153] support Prepared statement with 10.6 new feature metadata skip
* [CONJS-165] Adding initial message error value on Error object
* [CONJS-166] Restrict authentication plugin list
* [CONJS-167] Permit custom logger configuration

New Connection options

|option|description|type|default|
|---:|---|:---:|:---:| 
| **insertIdAsNumber** | Whether the query should return last insert id from INSERT/UPDATE command as BigInt or Number. default return BigInt |*boolean* | false |
| **decimalAsNumber** | Whether the query should return decimal as Number. If enable, this might return approximate values. |*boolean* | false |
| **bigIntAsNumber** | Whether the query should return BigInt data type as Number. If enable, this might return approximate values. |*boolean* | false |
| **logger** | Permit custom logger configuration. For more information, see the [`logger` option](#logger) documentation. |*mixed*|
| **prepareCacheLength** | Define prepare LRU cache length. 0 means no cache |*int*| 256 |

new Connection methods
* [`connection.prepare(sql) → Promise`](https://github.com/mariadb-corporation/mariadb-connector-nodejs/blob/master/documentation/promise-api.md#connectionpreparesql---promise): Prepares a query.
* [`connection.execute(sql[, values]) → Promise`](https://github.com/mariadb-corporation/mariadb-connector-nodejs/blob/master/documentation/promise-api.md#connectionexecutesql-values--promise): Prepare and Executes a query.

This methods are compatible with mysql2 with some differences:
* permit streaming parameters
* execute use by default a prepared cache that hasn't infinite length.
* implement mariadb 10.6 skipping metadata when possible for better performance
* Doesn't have a unprepare methods.

## [2.5.5](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.5.5) (19 Oct 2021)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.5.4...2.5.5)

* [CONJS-170] Pool.query(undefined) never release connection
* [CONJS-173] not permitting providing null as a value without an array
* [CONJS-175] Missing leakDetectionTimeout option in Typescript description

## [2.5.4](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.5.4) (08 Jun 2021)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.5.3...2.5.4)

* [CONJS-163] Authentication plugin failing doesn't always return error
* [CONJS-164] Add API that list options default value
* [CONJS-161] escaping correction
* update iconv-lite dependency to 0.6.3
  
## [2.5.3](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.5.3) (16 Feb 2021)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.5.2...2.5.3)

* [CONJS-157] Batch error when setting maxAllowedPacket less than an insert parameter value
* [CONJS-158] use BigInt constructor in place of literal to ensure maximum compatibility		
* [CONJS-160] Wrong definition for typescript PoolConnection.release
* [CONJS-159] test 10.6 server latest build


## [2.5.2](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.5.2) (04 Dec 2020)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.5.1...2.5.2)

* [CONJS-151] bulk batch error (parameter truncation) #137
* [CONJS-152] correction when enabling the `permitLocalInfile` option and some initial commands
* [CONJS-154] Timezone support correction and clarification
* [CONJS-155] correction to support for node.js 10.13 to 10.19
* [CONJS-156] Ensure setting capability PLUGIN_AUTH only if server has it

documentation improvement

## [2.5.1](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.5.1) (23 Oct 2020)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.5.0...2.5.1)

* CONJS-149 - [CONJS-149] correcting possible TypeError [ERR_UNKNOWN_ENCODING], Node v15 compatibility


## [2.5.0](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.5.0) (15 Oct 2020)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.4.2...2.5.0)

* CONJS-148 - permit setting socket keep alive (option `keepAliveDelay`)
* CONJS-145 - batch rewrite error when packet reach maxAllowedPacket
* CONJS-146 - Using callback API, batch, avoid return error if connection not established
* CONJS-144 - TypeScript type ssl wrong definitions
* CONJS-143 - Array parameter escaping differ from mysql/mysql2
* CONJS-133	- Support ES2020 BigInt object (option `supportBigInt`)
* CONJS-77 - Support MySQL caching_sha256_password authentication 
* CONJS-76 - Support MySQL sha256_password authentication
 
  
New Options

|option|description|type|default| 
|---:|---|:---:|:---:| 
| **`arrayParenthesis`** | Indicate if array are included in parenthesis. This option permit compatibility with version < 2.5|*boolean* | false |
| **`rsaPublicKey`** | Indicate path/content to MySQL server RSA public key. use requires Node.js v11.6+ |*string* | |
| **`cachingRsaPublicKey`** | Indicate path/content to MySQL server caching RSA public key. use requires Node.js v11.6+ |*string* | |
| **`allowPublicKeyRetrieval`** | Indicate that if `rsaPublicKey` or `cachingRsaPublicKey` public key are not provided, if client can ask server to send public key. |*boolean* | false |
| **`supportBigInt`** | Whether resultset should return javascript ES2020 [BigInt](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt) for [BIGINT](https://mariadb.com/kb/en/bigint/) data type. This ensures having expected value even for value > 2^53 (see [safe](documentation/connection-options.md#support-for-big-integer) range). |*boolean* | false |
| **`keepAliveDelay`** | permit to enable socket keep alive, setting delay. 0 means not enabled. Keep in mind that this don't reset server [@@wait_timeout](https://mariadb.com/kb/en/library/server-system-variables/#wait_timeout) (use pool option idleTimeout for that). in ms |*int* | |

CONJS-143 is a breaking change. Queries that have a IN parameter with array parameters format change. 
previous format did not accept parenthesis : 
```
conn.query('SELECT * FROM arrayParam WHERE id = ? AND val IN ?', [1, ['b', 'c']]);
```

now, format is 
```
conn.query('SELECT * FROM arrayParam WHERE id = ? AND val IN (?)', [1, ['b', 'c']]);
```
same than mysql/mysql2 drivers.
previous behaviour can be reverted setting option `arrayParenthesis` to true.  



## [2.4.2](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.4.2) (23 Jul 2020)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.4.1...2.4.2)

* CONJS-142 - Number parsing loss of precision


## [2.4.1](https://github.com/mariadb-corporation/mariadb-connector-nodejs/tree/2.4.1) (01 Jul 2020)
[Full Changelog](https://github.com/mariadb-corporation/mariadb-connector-nodejs/compare/2.4.0...2.4.1)

* CONJS-138 - pool.getConnection() might not timeout even with acquireTimeout set
* CONJS-139 - createConnection(string)` does not support URL-encoded credentials
* CONJS-140	- Support passing null values in array when doing queries. thanks to @koendeschacht
* CONJS-141 - set default value of option `restoreNodeTimeout` to 1000 to avoid using blacklisted pool in cluster

	
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
