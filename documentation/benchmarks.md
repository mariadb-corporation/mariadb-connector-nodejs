# Benchmark

Benchmarks for the MariaDB Node.js Connector are done using the [benchmark](https://www.npmjs.com/package/benchmark) package. You can find the source code for our benchmarks in the [`benchmarks/`](../benchmarks) folder.

You can run benchmarks using npm.  To run it on the `mariadb` Connector only, use the following command:

```
$ npm install microtime
$ npm run benchmark
```

Npm runs a series on the MariaDB Server then returns the execution times.  
While this may give you a rough idea of how it performs, it's better to compare to other MySQL connector packages, like [mysql](https://www.npmjs.com/package/mysql) and [mysql2](https://www.npmjs.com/package/mysql2) packages.


The [mysql](https://www.npmjs.com/package/mysql) package doesn't implement Promise, so using use the [promise-mysql](https://www.npmjs.com/package/promise-mysql) package.

run the benchmarks:
```
$ npm install microtime
$ npm install mysql mysql2 promise-mysql
$ npm run benchmark
```

## Results

Benchmarks runs on two Digital Ocean hosts with 16GB of memory and 4 CPU's, running Ubuntu 22.04.

* **Server Host**: MariaDB 10.6 under the default configuration, just commenting bind-address to permit access from other server.
* **Client Host**: Node.js version v16.16.0
  (change the ./test/conf.js to set connection information)

The MariaDB Node.js Connector was then tested along side the following MySQL connectors:

* [**mysql**](https://www.npmjs.com/package/mysql): version 2.18.1 
* [**mysql2**](https://www.npmjs.com/package/mysql2): version 2.3.3
* [**promise-mysql**](https://www.npmjs.com/package/promise-mysql): version 5.2.0




root@ubuntu-g-4vcpu-16gb-fra1-01-client:~/mariadb-connector-nodejs# npm run benchmark

> mariadb@3.0.1 benchmark
> node benchmarks/benchmarks-all.js

{
user: 'diego',
database: 'testn',
host: '142.93.168.228',
connectTimeout: 2000,
port: 3306,
charsetNumber: 45,
trace: false
}
##  do random number

```
do <random number>
            mysql :  6,248.4 ops/s ±   1%
           mysql2 :  5,197.6 ops/s ± 0.6%  (  -16.8% )
          mariadb :  7,304.7 ops/s ± 0.8%  (  +16.9% )
```
![do <random number> benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=6248&data2=5198&data3=7305)

##  do random number with pool

```
do <random number> with pool
            mysql :  6,081.7 ops/s ± 0.8%
           mysql2 :  5,414.8 ops/s ± 0.7%  (    -11% )
          mariadb :  6,926.7 ops/s ± 0.5%  (  +13.9% )
```
![do <random number> with pool benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=6082&data2=5415&data3=6927)

##  insert 10 parameters of 100 characters

```
insert 10 parameters of 100 characters
            mysql :  3,396.8 ops/s ± 1.1%
           mysql2 :  2,883.7 ops/s ± 0.8%  (  -15.1% )
          mariadb :  3,474.2 ops/s ± 0.7%  (   +2.3% )
```
![insert 10 parameters of 100 characters benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=3397&data2=2884&data3=3474)

##  100 * insert 100 characters using batch method (for mariadb) or loop for other driver (batch doesn't exists)

```
100 * insert 100 characters using batch method (for mariadb) or loop for other driver (batch doesn't exists)
            mysql :     53.6 ops/s ± 0.9%
           mysql2 :     54.2 ops/s ±   1%  (     +1% )
          mariadb :  2,536.6 ops/s ± 2.3%  ( +4,630.1% )
```
![100 * insert 100 characters using batch method (for mariadb) or loop for other driver (batch doesn't exists) benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=54&data2=54&data3=2537)

##  3 * insert 100 characters pipelining benchmark results

```
3 * insert 100 characters pipelining
            mysql :  1,987.6 ops/s ± 0.6%
           mysql2 :  1,980.1 ops/s ± 0.8%  (   -0.4% )
          mariadb :  3,451.1 ops/s ± 2.6%  (  +73.6% )
```
![3 * insert 100 characters pipelining benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=1988&data2=1980&data3=3451)

##  select 1000 rows

```
select 1000 rows
            mysql :    915.3 ops/s ± 0.4%
           mysql2 :  1,138.5 ops/s ± 1.8%  (  +24.4% )
          mariadb :  1,424.9 ops/s ± 0.2%  (  +55.7% )
```
![select 1000 rows benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=915&data2=1138&data3=1425&title=select%201000%20rows)

##  select 20 * int, 20 * varchar(32)

```
select 20 * int, 20 * varchar(32)
            mysql :    3,086 ops/s ± 0.6%
           mysql2 :  2,799.6 ops/s ± 1.6%  (   -9.3% )
          mariadb :  4,710.8 ops/s ±   1%  (  +52.7% )
```
![select 20 * int, 20 * varchar(32) benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=3086&data2=2800&data3=4711)

##  select 20 * int, 20 * varchar(32) using execute

```
select 20 * int, 20 * varchar(32) using execute
           mysql2 :    2,998 ops/s ± 1.3%
          mariadb :  4,419.6 ops/s ±   1%  (  +47.4% )
```
![select 20 * int, 20 * varchar(32) using execute benchmark results](https://quickchart.io/chart/render/zm-36b213f4-8efe-4943-8f94-82edf94fce83?data1=2998&data2=4420)

##  select 20 * int, 20 * varchar(32) using pool

```
select 20 * int, 20 * varchar(32) using pool
            mysql :  2,063.7 ops/s ± 0.9%
           mysql2 :    2,820 ops/s ± 1.8%  (  +36.6% )
          mariadb :    4,381 ops/s ± 1.2%  ( +112.3% )
```
![select 20 * int, 20 * varchar(32) using pool benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=2064&data2=2820&data3=4381)

##  select 20 * int, 20 * varchar(32) and a random number - no caching client side

```
select 20 * int, 20 * varchar(32) and a random number [no caching client side]
            mysql :  1,733.6 ops/s ± 0.5%
           mysql2 :  1,053.2 ops/s ± 2.8%  (  -39.2% )
          mariadb :  3,006.9 ops/s ± 0.5%  (  +73.4% )
```
![select 20 * int, 20 * varchar(32) and a random number [no caching client side] benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=1734&data2=1053&data3=3007)

##  select random number

```
select random number
            mysql :  5,315.2 ops/s ± 0.6%
           mysql2 :  5,085.3 ops/s ± 0.8%  (   -4.3% )
          mariadb :  6,505.2 ops/s ± 2.3%  (  +22.4% )
```
![select random number benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=5315&data2=5085&data3=6505)

