# Benchmark 

Benchmarks are done using [benchmark package](https://www.npmjs.com/package/benchmark).

Benchmark source code is integrated to connection in /benchmarks folder.

running benchmark for mariadb only :  
```Bash
    npm run benchmark
``` 

To compare with [mysql](https://www.npmjs.com/package/mysql) / [mysql2](https://www.npmjs.com/package/mysql2)  
they need to be installed :
```Bash
    npm install mysql mysql2
    npm run benchmark
``` 

[mysql](https://www.npmjs.com/package/mysql) do not have a promise implementation, so [promise-mysql](https://www.npmjs.com/package/promise-mysql) can be used to test promise tests.
```Bash
    npm install mysql mysql2 promise-mysql
    npm run benchmark
```
    
# Some result 
Result on a DigitalOcean ubuntu 16.04 x64 with 8gb, 4vcpu, using local database :
* mariadb 10.3 with default configuration and (collation-server=utf8mb4_unicode_ci + character-set-server=utf8mb4)
* node.js v8.11.3

version : 
* mysql : 2.15.0
* mysql2 : 1.5.3
* mysql-promise : 4.1.0
  
``` 
{ user: 'root',
  database: 'testn',
  host: 'localhost',
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
benchmark: ./benchs/bench_select_one_user.js
benchmark: ./benchs/bench_select_one_user_random.js
benchmark: ./benchs/bench_select_param.js
driver for mysql connected (1/5)
driver for promise mysql2 connected (2/5)
driver for mysql2 connected (3/5)
driver for promise-mariadb connected (4/5)
driver for mariadb connected (5/5)
start : init test : 11
initializing test data 1/11
initializing test data 2/11
initializing test data 3/11
initializing test data 4/11
initializing test data 5/11
initializing test data 6/11
initializing test data 7/11
initializing test data 8/11
initializing test data 9/11
initializing test data 10/11
initializing test data 11/11
initializing test data done
do ? using callback - warmup x 10,303 ops/sec ±2.95% (270 runs sampled)
do ? using callback - mysql x 9,884 ops/sec ±2.28% (270 runs sampled)
do ? using callback - mysql2 x 8,431 ops/sec ±2.27% (273 runs sampled)
do ? using callback - mariadb x 10,930 ops/sec ±2.78% (266 runs sampled)
do ? using promise - warmup x 11,915 ops/sec ±2.66% (269 runs sampled)
do ? using promise - promise-mysql x 8,555 ops/sec ±2.45% (276 runs sampled)
do ? using promise - promise mysql2 x 7,036 ops/sec ±1.37% (275 runs sampled)
do ? using promise - promise mariadb x 11,829 ops/sec ±3.11% (259 runs sampled)
insert 10 parameters of 100 characters using promise - warmup x 4,571 ops/sec ±1.08% (276 runs sampled)
insert 10 parameters of 100 characters using promise - promise-mysql x 4,071 ops/sec ±1.14% (276 runs sampled)
insert 10 parameters of 100 characters using promise - promise mysql2 x 3,568 ops/sec ±1.47% (273 runs sampled)
insert 10 parameters of 100 characters using promise - promise mariadb x 4,541 ops/sec ±0.94% (276 runs sampled)
100 * insert 100 characters using promise - warmup x 1,385 ops/sec ±1.63% (274 runs sampled)
100 * insert 100 characters using promise - promise-mysql x 654 ops/sec ±1.21% (274 runs sampled)
100 * insert 100 characters using promise - promise mysql2 x 559 ops/sec ±1.25% (276 runs sampled)
100 * insert 100 characters using promise - promise mariadb x 1,364 ops/sec ±1.40% (272 runs sampled)
select multiple collation using promise - warmup x 750 ops/sec ±0.81% (276 runs sampled)
select multiple collation using promise - promise-mysql x 646 ops/sec ±1.04% (273 runs sampled)
select multiple collation using promise - promise mysql2 x 690 ops/sec ±1.17% (272 runs sampled)
select multiple collation using promise - promise mariadb x 741 ops/sec ±0.85% (274 runs sampled)
select one mysql.user and 1 integer using promise - warmup x 2,714 ops/sec ±1.06% (277 runs sampled)
select one mysql.user and 1 integer using promise - promise-mysql x 2,023 ops/sec ±1.24% (276 runs sampled)
select one mysql.user and 1 integer using promise - promise mysql2 x 2,531 ops/sec ±1.08% (276 runs sampled)
select one mysql.user and 1 integer using promise - promise mariadb x 2,777 ops/sec ±0.77% (279 runs sampled)
select one mysql.user and a random number (no caching client side) using promise - warmup x 2,693 ops/sec ±1.20% (277 runs sampled)
select one mysql.user and a random number (no caching client side) using promise - promise-mysql x 1,964 ops/sec ±1.34% (272 runs sampled)
select one mysql.user and a random number (no caching client side) using promise - promise mysql2 x 527 ops/sec ±5.34% (260 runs sampled)
select one mysql.user and a random number (no caching client side) using promise - promise mariadb x 2,586 ops/sec ±1.18% (275 runs sampled)
select random number using promise - warmup x 8,536 ops/sec ±2.43% (274 runs sampled)
select random number using promise - promise-mysql x 6,985 ops/sec ±1.37% (275 runs sampled)
select random number using promise - promise mysql2 x 5,605 ops/sec ±3.24% (271 runs sampled)
select random number using promise - promise mariadb x 8,964 ops/sec ±1.48% (275 runs sampled)
select one mysql.user and 1 integer using callback - warmup x 2,661 ops/sec ±1.56% (276 runs sampled)
select one mysql.user and 1 integer using callback - mysql x 2,141 ops/sec ±1.30% (275 runs sampled)
select one mysql.user and 1 integer using callback - mysql2 x 2,797 ops/sec ±1.23% (277 runs sampled)
select one mysql.user and 1 integer using callback - mariadb x 2,721 ops/sec ±1.40% (277 runs sampled)
select one mysql.user and a random number (no caching client side) using callback - warmup x 2,585 ops/sec ±1.68% (273 runs sampled)
select one mysql.user and a random number (no caching client side) using callback - mysql x 2,080 ops/sec ±1.37% (275 runs sampled)
select one mysql.user and a random number (no caching client side) using callback - mysql2 x 589 ops/sec ±4.74% (270 runs sampled)
select one mysql.user and a random number (no caching client side) using callback - mariadb x 2,556 ops/sec ±1.08% (272 runs sampled)
select random number - warmup x 8,386 ops/sec ±2.54% (272 runs sampled)
select random number - mysql x 7,816 ops/sec ±1.57% (274 runs sampled)
select random number - mysql2 x 7,376 ops/sec ±1.33% (274 runs sampled)
select random number - mariadb x 8,228 ops/sec ±2.58% (271 runs sampled)
ending connectors


--- BENCHMARK RESULTS ---
/* travis bench are not to take as is, because VM might run some other testing script that can change results */

bench : do ? using callback ( sql: do ? )
              mysql :  9,883.8 ops/s
             mysql2 :  8,431.3 ops/s   (  -14.7% )
            mariadb :   10,930 ops/s   (  +10.6% )

bench : do ? using promise ( sql: do ? )
      promise-mysql :  8,555.2 ops/s
     promise mysql2 :  7,036.2 ops/s   (  -17.8% )
    promise mariadb : 11,828.8 ops/s   (  +38.3% )

bench : insert 10 parameters of 100 characters using promise ( sql: INSERT INTO testn.perfTestText VALUES (<100 ?>) (into BLACKHOLE ENGINE) )
      promise-mysql :  4,070.9 ops/s
     promise mysql2 :  3,568.3 ops/s   (  -12.3% )
    promise mariadb :  4,540.8 ops/s   (  +11.5% )

bench : 100 * insert 100 characters using promise ( sql: INSERT INTO testn.perfTestTextPipe VALUES (?) (into BLACKHOLE ENGINE) )
      promise-mysql :    654.1 ops/s
     promise mysql2 :    558.6 ops/s   (  -14.6% )
    promise mariadb :  1,364.1 ops/s   ( +108.5% )

bench : select multiple collation using promise ( sql: select * from information_schema.COLLATIONS )
      promise-mysql :    646.1 ops/s
     promise mysql2 :    690.2 ops/s   (   +6.8% )
    promise mariadb :    740.8 ops/s   (  +14.7% )

bench : select one mysql.user and 1 integer using promise ( sql: select <all mysql.user fields>, 1 from mysql.user u LIMIT 1 )
      promise-mysql :  2,023.4 ops/s
     promise mysql2 :  2,531.1 ops/s   (  +25.1% )
    promise mariadb :  2,776.9 ops/s   (  +37.2% )

bench : select one mysql.user and a random number (no caching client side) using promise ( sql: select <all mysql.user fields>, <random field> from mysql.user u LIMIT 1 )
      promise-mysql :  1,963.9 ops/s
     promise mysql2 :    526.5 ops/s   (  -73.2% )
    promise mariadb :  2,585.6 ops/s   (  +31.7% )

bench : select random number using promise ( sql: select ? )
      promise-mysql :  6,984.5 ops/s
     promise mysql2 :    5,605 ops/s   (  -19.8% )
    promise mariadb :  8,964.1 ops/s   (  +28.3% )

bench : select one mysql.user and 1 integer using callback ( sql: select <all mysql.user fields>, 1 from mysql.user u LIMIT 1 )
              mysql :    2,141 ops/s
             mysql2 :  2,797.4 ops/s   (  +30.7% )
            mariadb :  2,720.6 ops/s   (  +27.1% )

bench : select one mysql.user and a random number (no caching client side) using callback ( sql: select <all mysql.user fields>, <random field> from mysql.user u LIMIT 1 )
              mysql :  2,079.9 ops/s
             mysql2 :    588.6 ops/s   (  -71.7% )
            mariadb :  2,555.5 ops/s   (  +22.9% )

bench : select random number ( sql: select ? )
              mysql :  7,816.3 ops/s
             mysql2 :  7,376.2 ops/s   (   -5.6% )
            mariadb :  8,228.2 ops/s   (   +5.3% )
  
```

mysql2 use a metadata client caching, so queries with metadata already in cache are faster   