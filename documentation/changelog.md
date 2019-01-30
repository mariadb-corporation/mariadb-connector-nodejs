#### 2.0.3 - 30-01-2019 

* [CONJS-56] TypeError: Cannot read property 'totalConnections' of undefined
* [CONJS-59] pool now throw `ER_ACCESS_DENIED_ERROR` in place of basic timeout error
* [CONJS-60] handling pipe error for stream, avoiding hang in case of pipe error.
* [CONJS-55] Connector throw an error when using incompatible options


#### 2.0.2-rc - 11-12-2018 

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


#### 2.0.1-alpha - 15-11-2018 

* [CONJS-52] (Bug) Commit not executed when in transaction and autocommit is enabled
* [CONJS-50] (Bug) race condition when using authentication plugins
* [CONJS-21] add bulk insert method
* [CONJS-38] Add connection reset
* [CONJS-41] Handle multiple server pools with failover capabilities
* [CONJS-49] test connector with maxscale
* [CONJS-51] Permit use of connection string to provide options
* [CONJS-48] Add option to permit query command when establishing a connection

#### 2.0.0-alpha - 20-09-2018 

* [CONJS-42] check other connections in pool when an unexpected connection error occur
* [CONJS-44] Create option to permit setting Object to one prepareStatement parameter
* [CONJS-43] Callback API is missing
* [CONJS-39] support geometric GeoJSON structure format
* [CONJS-24] new option "sessionVariables" to permit setting session variable at connection
* [misc] connection.end() immediate resolution on socket QUIT packet send.
* [misc] improve documentation and set Promise API documentation to a dedicated page.
* [misc] change pool implementation to permit node 6 compatibility (removal of async await)
 

#### 0.7.0 - 18-07-2018 

* First alpha version 
