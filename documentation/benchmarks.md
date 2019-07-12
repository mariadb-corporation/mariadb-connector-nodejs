# Benchmark 

Benchmarks for the MariaDB Node.js Connector are done using the [benchmark](https://www.npmjs.com/package/benchmark) package.   You can find the source code for our benchmarks in the [`benchmarks/`](../benchmarks) folder.

You can run benchmarks using npm.  To run it on the `mariadb` Connector only, use the following command:

```
$ npm run benchmark
```

Npm runs a series on the MariaDB Server then returns the execution times.  While this may give you a rough idea of how it performs, it's better to compare to other MySQL connector packages, like [mysql](https://www.npmjs.com/package/mysql) and [mysql2](https://www.npmjs.com/package/mysql2) packages. 

Install them, then re-run the benchmarks:

```
$ npm install mysql mysql2
$ npm run benchmark
``` 

The [mysql](https://www.npmjs.com/package/mysql) package doesn't implement Promise.  If you need to test Promise, use the [promise-mysql](https://www.npmjs.com/package/promise-mysql) package.

```
$ npm install mysql mysql2 promise-mysql
$ npm run benchmark
```

## Results

Benchmarks were run on two Digital Ocean hosts with 8GB of memory and 4 virtual CPU's, running Ubuntu 18.04.

* **Server Host**: MariaDB 10.4 under the default configuration with the [`collation_server`](https://mariadb.com/kb/en/library/server-system-variables#collation_server)system variable set to `utf8mb4_unicode_ci` and the [`character_set_server`](https://mariadb.com/kb/en/library/server-system-variables#character_set_server) system variable set to `utf8mb4`.
* **Client Host**: Node.js version v10.16.0

The MariaDB Node.js Connector was then tested along side the following MySQL connectors:

* [**mysql**](https://www.npmjs.com/package/mysql): version 2.17.1
* [**mysql2**](https://www.npmjs.com/package/mysql2): version 1.6.5
* [**promise-mysql**](https://www.npmjs.com/package/promise-mysql): version 3.1.1

``` 

> mariadb@2.1.0 benchmark /root/mariadb-connector-nodejs
> node ./benchmarks/benchmarks.js

{ user: 'root',
  database: 'testn',
  host: '167.71.37.131',
  connectTimeout: 1000,
  port: 3306,
  charsetNumber: 224,
  trace: false,
  noControlAfterUse: true }
Ignoring invalid configuration option passed to Connection: noControlAfterUse. This is currently a warning, but in future versions of MySQL2, an error will be thrown if you pass an invalid configuration options to a Connection
Ignoring invalid configuration option passed to Connection: noControlAfterUse. This is currently a warning, but in future versions of MySQL2, an error will be thrown if you pass an invalid configuration options to a Connection
benchmark: ./benchs/bench_do.js
benchmark: ./benchs/bench_promise_do.js
benchmark: ./benchs/bench_promise_insert.js
benchmark: ./benchs/bench_promise_insert_batch.js
benchmark: ./benchs/bench_promise_insert_pipelining.js
benchmark: ./benchs/bench_promise_select_collation.js
benchmark: ./benchs/bench_promise_select_one_user.js
benchmark: ./benchs/bench_promise_select_one_user_random.js
benchmark: ./benchs/bench_promise_select_param.js
benchmark: ./benchs/bench_promise_select_random_param.js
benchmark: ./benchs/bench_promise_select_random_param_pool.js
benchmark: ./benchs/bench_select_one_user.js
benchmark: ./benchs/bench_select_one_user_random.js
benchmark: ./benchs/bench_select_param.js
benchmark: ./benchs/bench_select_random_param.js
driver for mysql connected (1/6)
driver for mysql2 connected (2/6)
Ignoring invalid configuration option passed to Connection: noControlAfterUse. This is currently a warning, but in future versions of MySQL2, an error will be thrown if you pass an invalid configuration options to a Connection
driver for promise mysql2 connected (3/6)
driver for mariadb connected (4/6)
driver for promise-mariadb connected (5/6)
driver for promise-mysql connected (6/6)
start : init test : 15
initializing test data 1/15
initializing test data 2/15
initializing test data 3/15
initializing test data 4/15
initializing test data 5/15
initializing test data 6/15
initializing test data 7/15
initializing test data 8/15
initializing test data 9/15
initializing test data 10/15
initializing test data 11/15
initializing test data 12/15
initializing test data 13/15
initializing test data 14/15
initializing test data 15/15
initializing test data done
do ? using callback - warmup x 6,099 ops/sec Â±2.63% (269 runs sampled)
do ? using callback - mysql x 6,137 ops/sec Â±2.45% (270 runs sampled)
do ? using callback - mysql2 x 6,109 ops/sec Â±2.65% (263 runs sampled)
do ? using callback - mariadb x 6,266 ops/sec Â±2.47% (268 runs sampled)
do ? using promise - warmup x 6,583 ops/sec Â±2.36% (267 runs sampled)
do ? using promise - promise-mysql x 5,569 ops/sec Â±2.44% (267 runs sampled)
do ? using promise - promise mysql2 x 5,517 ops/sec Â±2.02% (269 runs sampled)
do ? using promise - promise mariadb x 6,426 ops/sec Â±2.43% (270 runs sampled)
insert 10 parameters of 100 characters using promise - warmup x 3,736 ops/sec Â±1.43% (268 runs sampled)
insert 10 parameters of 100 characters using promise - promise-mysql x 3,458 ops/sec Â±1.49% (267 runs sampled)
insert 10 parameters of 100 characters using promise - promise mysql2 x 3,332 ops/sec Â±1.37% (266 runs sampled)
insert 10 parameters of 100 characters using promise - promise mariadb x 3,687 ops/sec Â±1.35% (266 runs sampled)
100 * insert 100 characters using promise and batch method (for mariadb only, since doesn't exist for others) - warmup x 1,466 ops/sec Â±4.49% (255 runs sampled)
100 * insert 100 characters using promise and batch method (for mariadb only, since doesn't exist for others) - promise-mysql x 48.56 ops/sec Â±1.56% (256 runs sampled)
100 * insert 100 characters using promise and batch method (for mariadb only, since doesn't exist for others) - promise mysql2 x 44.77 ops/sec Â±1.63% (264 runs sampled)
100 * insert 100 characters using promise and batch method (for mariadb only, since doesn't exist for others) - promise mariadb x 1,448 ops/sec Â±5.76% (256 runs sampled)
100 * insert 100 characters using promise - warmup x 195 ops/sec Â±2.84% (261 runs sampled)
100 * insert 100 characters using promise - promise-mysql x 47.12 ops/sec Â±1.85% (254 runs sampled)
100 * insert 100 characters using promise - promise mysql2 x 42.39 ops/sec Â±1.65% (264 runs sampled)
100 * insert 100 characters using promise - promise mariadb x 202 ops/sec Â±2.78% (263 runs sampled)
select multiple collation using promise - warmup x 537 ops/sec Â±1.63% (258 runs sampled)
select multiple collation using promise - promise-mysql x 418 ops/sec Â±1.58% (259 runs sampled)
select multiple collation using promise - promise mysql2 x 495 ops/sec Â±1.67% (262 runs sampled)
select multiple collation using promise - promise mariadb x 520 ops/sec Â±1.52% (258 runs sampled)
select one mysql.user and 1 integer using promise - warmup x 954 ops/sec Â±2.98% (262 runs sampled)
select one mysql.user and 1 integer using promise - promise-mysql x 646 ops/sec Â±2.20% (251 runs sampled)
select one mysql.user and 1 integer using promise - promise mysql2 x 746 ops/sec Â±2.35% (257 runs sampled)
select one mysql.user and 1 integer using promise - promise mariadb x 961 ops/sec Â±2.82% (262 runs sampled)
select one mysql.user and a random number (no caching client side) using promise - warmup x 981 ops/sec Â±2.75% (264 runs sampled)
select one mysql.user and a random number (no caching client side) using promise - promise-mysql x 597 ops/sec Â±2.03% (256 runs sampled)
select one mysql.user and a random number (no caching client side) using promise - promise mysql2 x 306 ops/sec Â±1.89% (263 runs sampled)
select one mysql.user and a random number (no caching client side) using promise - promise mariadb x 941 ops/sec Â±2.90% (265 runs sampled)
select number using promise - warmup x 5,777 ops/sec Â±2.07% (265 runs sampled)
select number using promise - promise-mysql x 4,868 ops/sec Â±1.84% (267 runs sampled)
select number using promise - promise mysql2 x 4,841 ops/sec Â±1.60% (267 runs sampled)
select number using promise - promise mariadb x 5,516 ops/sec Â±1.96% (265 runs sampled)
select random number using promise - warmup x 5,527 ops/sec Â±2.29% (262 runs sampled)
select random number using promise - promise-mysql x 4,843 ops/sec Â±2.15% (267 runs sampled)
select random number using promise - promise mysql2 x 4,696 ops/sec Â±1.88% (261 runs sampled)
select random number using promise - promise mariadb x 5,620 ops/sec Â±1.98% (266 runs sampled)
select random number using promise and pool - warmup x 3,782 ops/sec Â±1.43% (265 runs sampled)
select random number using promise and pool - promise-mysql x 1,738 ops/sec Â±1.73% (258 runs sampled)
select random number using promise and pool - promise mysql2 x 3,526 ops/sec Â±1.78% (266 runs sampled)
select random number using promise and pool - promise mariadb x 3,840 ops/sec Â±1.69% (267 runs sampled)
select one mysql.user and 1 integer using callback - warmup x 813 ops/sec Â±2.48% (255 runs sampled)
select one mysql.user and 1 integer using callback - mysql x 615 ops/sec Â±2.15% (256 runs sampled)
select one mysql.user and 1 integer using callback - mysql2 x 774 ops/sec Â±2.31% (259 runs sampled)
select one mysql.user and 1 integer using callback - mariadb x 821 ops/sec Â±2.53% (263 runs sampled)
select one mysql.user and a random number (no caching client side) using callback - warmup x 986 ops/sec Â±2.78% (268 runs sampled)
select one mysql.user and a random number (no caching client side) using callback - mysql x 641 ops/sec Â±2.04% (258 runs sampled)
select one mysql.user and a random number (no caching client side) using callback - mysql2 x 330 ops/sec Â±1.88% (257 runs sampled)
select one mysql.user and a random number (no caching client side) using callback - mariadb x 805 ops/sec Â±2.33% (257 runs sampled)
select number - warmup x 5,727 ops/sec Â±1.94% (265 runs sampled)
select number - mysql x 5,338 ops/sec Â±2.02% (266 runs sampled)
select number - mysql2 x 5,390 ops/sec Â±2.08% (265 runs sampled)
select number - mariadb x 5,608 ops/sec Â±2.15% (265 runs sampled)
select random number - warmup x 5,564 ops/sec Â±1.85% (267 runs sampled)
select random number - mysql x 5,193 ops/sec Â±2.01% (268 runs sampled)
select random number - mysql2 x 5,433 ops/sec Â±2.26% (264 runs sampled)
select random number - mariadb x 5,420 ops/sec Â±1.97% (264 runs sampled)
completed
ending connectors


--- BENCHMARK RESULTS ---
/* travis bench are not to take as is, because VM might run some other testing script that can change results */

bench : do ? using callback ( sql: do ? )
              mysql :  6,137.4 ops/s  
             mysql2 :  6,109.2 ops/s   (   -0.5% )
            mariadb :  6,266.1 ops/s   (   +2.1% )

bench : do ? using promise ( sql: do ? )
      promise-mysql :  5,569.4 ops/s  
     promise mysql2 :  5,516.5 ops/s   (     -1% )
    promise mariadb :  6,426.1 ops/s   (  +15.4% )

bench : insert 10 parameters of 100 characters using promise ( sql: INSERT INTO testn.perfTestText VALUES (<100 ?>) (into BLACKHOLE ENGINE) )
      promise-mysql :  3,457.8 ops/s  
     promise mysql2 :    3,332 ops/s   (   -3.6% )
    promise mariadb :  3,686.9 ops/s   (   +6.6% )

bench : 100 * insert 100 characters using promise and batch method (for mariadb only, since doesn't exist for others) ( sql: INSERT INTO testn.perfTestTextPipe VALUES (?) (into BLACKHOLE ENGINE) )
      promise-mysql :     48.6 ops/s  
     promise mysql2 :     44.8 ops/s   (   -7.8% )
    promise mariadb :  1,447.6 ops/s   ( +2,881.3% )

bench : 100 * insert 100 characters using promise ( sql: INSERT INTO testn.perfTestTextPipe VALUES (?) (into BLACKHOLE ENGINE) )
      promise-mysql :     47.1 ops/s  
     promise mysql2 :     42.4 ops/s   (  -10.1% )
    promise mariadb :    202.4 ops/s   ( +329.6% )

bench : select multiple collation using promise ( sql: select * from information_schema.COLLATIONS )
      promise-mysql :    417.8 ops/s  
     promise mysql2 :      495 ops/s   (  +18.5% )
    promise mariadb :    519.7 ops/s   (  +24.4% )

bench : select one mysql.user and 1 integer using promise ( sql: select <all mysql.user fields>, 1 from mysql.user u LIMIT 1 )
      promise-mysql :      646 ops/s  
     promise mysql2 :    746.1 ops/s   (  +15.5% )
    promise mariadb :    961.4 ops/s   (  +48.8% )

bench : select one mysql.user and a random number (no caching client side) using promise ( sql: select <all mysql.user fields>, <random field> from mysql.user u LIMIT 1 )
      promise-mysql :      597 ops/s  
     promise mysql2 :    305.9 ops/s   (  -48.8% )
    promise mariadb :    941.3 ops/s   (  +57.7% )

bench : select number using promise ( sql: select 10000000 )
      promise-mysql :  4,868.4 ops/s  
     promise mysql2 :  4,841.1 ops/s   (   -0.6% )
    promise mariadb :  5,516.1 ops/s   (  +13.3% )

bench : select random number using promise ( sql: select ? )
      promise-mysql :  4,842.8 ops/s  
     promise mysql2 :  4,696.2 ops/s   (     -3% )
    promise mariadb :  5,620.2 ops/s   (  +16.1% )

bench : select random number using promise and pool ( sql: select ? )
      promise-mysql :  1,738.5 ops/s  
     promise mysql2 :  3,526.3 ops/s   ( +102.8% )
    promise mariadb :  3,839.9 ops/s   ( +120.9% )

bench : select one mysql.user and 1 integer using callback ( sql: select <all mysql.user fields>, 1 from mysql.user u LIMIT 1 )
              mysql :    614.6 ops/s  
             mysql2 :    774.2 ops/s   (    +26% )
            mariadb :    821.1 ops/s   (  +33.6% )

bench : select one mysql.user and a random number (no caching client side) using callback ( sql: select <all mysql.user fields>, <random field> from mysql.user u LIMIT 1 )
              mysql :    641.2 ops/s  
             mysql2 :      330 ops/s   (  -48.5% )
            mariadb :    804.7 ops/s   (  +25.5% )

bench : select number ( sql: select ? )
              mysql :  5,337.5 ops/s  
             mysql2 :  5,390.3 ops/s   (     +1% )
            mariadb :  5,608.3 ops/s   (   +5.1% )

bench : select random number ( sql: select ? )
              mysql :  5,193.2 ops/s  
             mysql2 :  5,432.9 ops/s   (   +4.6% )
            mariadb :  5,419.8 ops/s   (   +4.4% )
```

Note, the [mysql2](https://www.npmjs.com/package/mysql2) package uses metadata client caching, so queries with metadata in cache are faster than new queries.
