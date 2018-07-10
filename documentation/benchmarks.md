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

Benchmarks were run on two Digital Ocean hosts with 8GB of memory and 4 virtual CPU's, running Ubuntu 16.04.

* **Server Host**: MariaDB 10.3 under the default configuration with the [`collation_server`](https://mariadb.com/kb/en/library/server-system-variables#collation_server)system variable set to `utf8mb4_unicode_ci` and the [`character_set_server`](https://mariadb.com/kb/en/library/server-system-variables#character_set_server) system variable set to `utf8mb4`.
* **Client Host**: Node.js version 8.11.3

The MariaDB Node.js Connector was then tested along side the following MySQL connectors:

* [**mysql**](https://www.npmjs.com/package/mysql): version 2.15.0
* [**mysql2**](https://www.npmjs.com/package/mysql2): version 1.5.3
* [**promise-mysql**](https://www.npmjs.com/package/promise-mysql): version 3.1.1

``` 
{ user: 'root',
  database: 'testn',
  host: '159.89.6.101',
  port: 3306,
  trace: false,
  charsetNumber: 224 }
benchmark: ./benchs/bench_do.js
benchmark: ./benchs/bench_promise_do.js
benchmark: ./benchs/bench_promise_insert.js
benchmark: ./benchs/bench_promise_insert_pipelining.js
benchmark: ./benchs/bench_promise_select_collation.js
benchmark: ./benchs/bench_promise_select_one_user.js
benchmark: ./benchs/bench_promise_select_one_user_random.js
benchmark: ./benchs/bench_promise_select_param.js
benchmark: ./benchs/bench_promise_select_random_param.js
benchmark: ./benchs/bench_select_one_user.js
benchmark: ./benchs/bench_select_one_user_random.js
benchmark: ./benchs/bench_select_param.js
benchmark: ./benchs/bench_select_random_param.js
driver for mysql connected (1/6)
driver for mysql2 connected (2/6)
driver for promise mysql2 connected (3/6)
driver for promise-mysql connected (4/6)
driver for promise-mariadb connected (5/6)
driver for mariadb connected (6/6)
start : init test : 13
initializing test data 1/13
initializing test data 2/13
initializing test data 3/13
initializing test data 4/13
initializing test data 5/13
initializing test data 6/13
initializing test data 7/13
initializing test data 8/13
initializing test data 9/13
initializing test data 10/13
initializing test data 11/13
initializing test data 12/13
initializing test data 13/13
initializing test data done
do ? using callback - warmup x 5,080 ops/sec ±1.80% (267 runs sampled)
do ? using callback - mysql x 4,826 ops/sec ±1.38% (271 runs sampled)
do ? using callback - mysql2 x 4,360 ops/sec ±1.28% (273 runs sampled)
do ? using callback - mariadb x 5,214 ops/sec ±1.31% (272 runs sampled)
do ? using promise - warmup x 5,088 ops/sec ±1.20% (272 runs sampled)
do ? using promise - promise-mysql x 4,363 ops/sec ±1.08% (273 runs sampled)
do ? using promise - promise mysql2 x 3,830 ops/sec ±1.04% (273 runs sampled)
do ? using promise - promise mariadb x 5,261 ops/sec ±1.09% (271 runs sampled)
insert 10 parameters of 100 characters using promise - warmup x 2,657 ops/sec ±1.24% (272 runs sampled)
insert 10 parameters of 100 characters using promise - promise-mysql x 2,482 ops/sec ±1.14% (275 runs sampled)
insert 10 parameters of 100 characters using promise - promise mysql2 x 2,099 ops/sec ±2.55% (272 runs sampled)
insert 10 parameters of 100 characters using promise - promise mariadb x 2,642 ops/sec ±1.20% (271 runs sampled)
100 * insert 100 characters using promise - warmup x 984 ops/sec ±2.38% (276 runs sampled)
100 * insert 100 characters using promise - promise-mysql x 357 ops/sec ±1.07% (273 runs sampled)
100 * insert 100 characters using promise - promise mysql2 x 321 ops/sec ±2.95% (265 runs sampled)
100 * insert 100 characters using promise - promise mariadb x 991 ops/sec ±1.21% (277 runs sampled)
select multiple collation using promise - warmup x 628 ops/sec ±1.05% (278 runs sampled)
select multiple collation using promise - promise-mysql x 555 ops/sec ±1.05% (275 runs sampled)
select multiple collation using promise - promise mysql2 x 573 ops/sec ±0.91% (276 runs sampled)
select multiple collation using promise - promise mariadb x 626 ops/sec ±0.88% (275 runs sampled)
select one mysql.user and 1 integer using promise - warmup x 1,724 ops/sec ±1.59% (266 runs sampled)
select one mysql.user and 1 integer using promise - promise-mysql x 1,366 ops/sec ±1.42% (268 runs sampled)
select one mysql.user and 1 integer using promise - promise mysql2 x 1,469 ops/sec ±1.63% (259 runs sampled)
select one mysql.user and 1 integer using promise - promise mariadb x 1,802 ops/sec ±1.19% (272 runs sampled)
select one mysql.user and a random number (no caching client side) using promise - warmup x 1,655 ops/sec ±1.80% (276 runs sampled)
select one mysql.user and a random number (no caching client side) using promise - promise-mysql x 1,365 ops/sec ±1.43% (270 runs sampled)
select one mysql.user and a random number (no caching client side) using promise - promise mysql2 x 423 ops/sec ±6.64% (266 runs sampled)
select one mysql.user and a random number (no caching client side) using promise - promise mariadb x 1,736 ops/sec ±1.21% (274 runs sampled)
select number using promise - warmup x 4,371 ops/sec ±4.50% (272 runs sampled)
select number using promise - promise-mysql x 3,794 ops/sec ±1.51% (265 runs sampled)
select number using promise - promise mysql2 x 3,444 ops/sec ±1.56% (270 runs sampled)
select number using promise - promise mariadb x 4,506 ops/sec ±1.10% (273 runs sampled)
select random number using promise - warmup x 4,444 ops/sec ±1.19% (274 runs sampled)
select random number using promise - promise-mysql x 3,671 ops/sec ±2.75% (271 runs sampled)
select random number using promise - promise mysql2 x 3,307 ops/sec ±1.35% (271 runs sampled)
select random number using promise - promise mariadb x 4,511 ops/sec ±1.12% (274 runs sampled)
select one mysql.user and 1 integer using callback - warmup x 1,664 ops/sec ±1.84% (269 runs sampled)
select one mysql.user and 1 integer using callback - mysql x 1,406 ops/sec ±1.59% (266 runs sampled)
select one mysql.user and 1 integer using callback - mysql2 x 1,676 ops/sec ±1.66% (261 runs sampled)
select one mysql.user and 1 integer using callback - mariadb x 1,754 ops/sec ±1.37% (272 runs sampled)
select one mysql.user and a random number (no caching client side) using callback - warmup x 1,638 ops/sec ±2.18% (256 runs sampled)
select one mysql.user and a random number (no caching client side) using callback - mysql x 1,340 ops/sec ±1.88% (257 runs sampled)
select one mysql.user and a random number (no caching client side) using callback - mysql2 x 477 ops/sec ±4.24% (268 runs sampled)
select one mysql.user and a random number (no caching client side) using callback - mariadb x 1,627 ops/sec ±1.44% (268 runs sampled)
select number - warmup x 4,196 ops/sec ±3.35% (272 runs sampled)
select number - mysql x 4,134 ops/sec ±1.21% (273 runs sampled)
select number - mysql2 x 3,990 ops/sec ±1.17% (271 runs sampled)
select number - mariadb x 4,366 ops/sec ±1.53% (274 runs sampled)
select random number - warmup x 4,285 ops/sec ±1.58% (270 runs sampled)
select random number - mysql x 4,055 ops/sec ±1.13% (273 runs sampled)
select random number - mysql2 x 3,940 ops/sec ±1.34% (273 runs sampled)
select random number - mariadb x 4,528 ops/sec ±1.59% (272 runs sampled)
ending connectors

--- BENCHMARK RESULTS ---
/* travis bench are not to take as is, because VM might run some other testing script that can change results */

bench : do ? using callback ( sql: do ? )
              mysql :  4,825.5 ops/s
             mysql2 :  4,359.9 ops/s   (   -9.6% )
            mariadb :  5,213.6 ops/s   (     +8% )

bench : do ? using promise ( sql: do ? )
      promise-mysql :  4,362.8 ops/s
     promise mysql2 :  3,830.3 ops/s   (  -12.2% )
    promise mariadb :  5,260.5 ops/s   (  +20.6% )

bench : insert 10 parameters of 100 characters using promise ( sql: INSERT INTO testn.perfTestText VALUES (<100 ?>) (into BLACKHOLE ENGINE) )
      promise-mysql :  2,481.8 ops/s
     promise mysql2 :    2,099 ops/s   (  -15.4% )
    promise mariadb :  2,641.8 ops/s   (   +6.4% )

bench : 100 * insert 100 characters using promise ( sql: INSERT INTO testn.perfTestTextPipe VALUES (?) (into BLACKHOLE ENGINE) )
      promise-mysql :    357.3 ops/s
     promise mysql2 :    320.9 ops/s   (  -10.2% )
    promise mariadb :    990.9 ops/s   ( +177.3% )

bench : select multiple collation using promise ( sql: select * from information_schema.COLLATIONS )
      promise-mysql :    555.2 ops/s
     promise mysql2 :    573.4 ops/s   (   +3.3% )
    promise mariadb :    625.5 ops/s   (  +12.7% )

bench : select one mysql.user and 1 integer using promise ( sql: select <all mysql.user fields>, 1 from mysql.user u LIMIT 1 )
      promise-mysql :  1,365.8 ops/s
     promise mysql2 :  1,469.1 ops/s   (   +7.6% )
    promise mariadb :  1,802.2 ops/s   (    +32% )

bench : select one mysql.user and a random number (no caching client side) using promise ( sql: select <all mysql.user fields>, <random field> from mysql.user u LIMIT 1 )
      promise-mysql :  1,364.8 ops/s
     promise mysql2 :      423 ops/s   (    -69% )
    promise mariadb :  1,736.3 ops/s   (  +27.2% )

bench : select number using promise ( sql: select 10000000 )
      promise-mysql :  3,794.3 ops/s
     promise mysql2 :  3,443.8 ops/s   (   -9.2% )
    promise mariadb :  4,506.4 ops/s   (  +18.8% )

bench : select random number using promise ( sql: select ? )
      promise-mysql :  3,671.1 ops/s
     promise mysql2 :  3,307.3 ops/s   (   -9.9% )
    promise mariadb :  4,510.8 ops/s   (  +22.9% )

bench : select one mysql.user and 1 integer using callback ( sql: select <all mysql.user fields>, 1 from mysql.user u LIMIT 1 )
              mysql :    1,406 ops/s
             mysql2 :  1,675.9 ops/s   (  +19.2% )
            mariadb :  1,754.2 ops/s   (  +24.8% )

bench : select one mysql.user and a random number (no caching client side) using callback ( sql: select <all mysql.user fields>, <random field> from mysql.user u LIMIT 1 )
              mysql :  1,340.3 ops/s
             mysql2 :    476.8 ops/s   (  -64.4% )
            mariadb :  1,627.3 ops/s   (  +21.4% )

bench : select number ( sql: select ? )
              mysql :    4,134 ops/s
             mysql2 :  3,990.5 ops/s   (   -3.5% )
            mariadb :  4,365.6 ops/s   (   +5.6% )

bench : select random number ( sql: select ? )
              mysql :  4,055.3 ops/s
             mysql2 :    3,940 ops/s   (   -2.8% )
            mariadb :  4,527.5 ops/s   (  +11.6% )
```

Note, the [mysql2](https://www.npmjs.com/package/mysql2) package uses metadata client caching, so queries with metadata in cache are faster than new queries.
