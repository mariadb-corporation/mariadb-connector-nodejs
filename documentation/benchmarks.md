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
* **Client Host**: Node.js version v18.13.0
  (change the ./test/conf.js to set connection information)

The MariaDB Node.js Connector was then tested alongside the following MySQL connectors:

* [**mysql**](https://www.npmjs.com/package/mysql): version 2.18.1 
* [**mysql2**](https://www.npmjs.com/package/mysql2): version 3.1.0
* [**promise-mysql**](https://www.npmjs.com/package/promise-mysql): version 5.2.0

in order to have stable results, environment variable PERF_SAMPLES is set to 500:
```
set PERF_SAMPLES=500
```

### distant server

root@ubuntu-g-4vcpu-16gb-sfo3-cli:~/mariadb-connector-nodejs# npm run benchmark

> mariadb@3.1.0 benchmark
> node benchmarks/benchmarks-all.js

{
user: 'root',
database: 'testn',
host: '137.184.6.237',
connectTimeout: 2000,
port: 3306,
charset: 'utf8mb4',
trace: false
}
##  do 1

```
do 1
            mysql :  7,063.6 ops/s ± 0.4% 
           mysql2 :  6,465.3 ops/s ± 0.6%  (   -8.5% )
          mariadb :  8,531.9 ops/s ± 0.3%  (  +20.8% )
```
![do 1 benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=7064&data2=6465&data3=8532)

##  do 1000 parameter

```
do 1000 parameter
            mysql :  2,410.3 ops/s ± 0.3% 
           mysql2 :  2,279.2 ops/s ± 0.6%  (   -5.4% )
          mariadb :    2,582 ops/s ± 0.6%  (   +7.1% )
```
![do 1000 parameter benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=2410&data2=2279&data3=2582)

##  do random number with pool

```
do <random number> with pool
            mysql :  6,726.4 ops/s ± 0.5% 
           mysql2 :  6,150.5 ops/s ± 0.8%  (   -8.6% )
          mariadb :  7,463.2 ops/s ± 0.5%  (    +11% )
```
![do <random number> with pool benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=6726&data2=6150&data3=7463)

##  insert 10 VARCHAR(100)

```
insert 10 VARCHAR(100)
            mysql :  3,799.9 ops/s ± 0.6% 
           mysql2 :    3,557 ops/s ± 0.6%  (   -6.4% )
          mariadb :  4,027.9 ops/s ± 0.5%  (     +6% )
```
![insert 10 VARCHAR(100) benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=3800&data2=3557&data3=4028)

##  100 * insert CHAR(100) using batch (for mariadb) or loop for other driver (batch doesn't exists)

```
100 * insert CHAR(100) using batch (for mariadb) or loop for other driver (batch doesn't exists)
            mysql :     67.8 ops/s ± 0.3% 
           mysql2 :     66.1 ops/s ± 0.7%  (   -2.4% )
          mariadb :  3,270.8 ops/s ± 1.3%  ( +4,725% )
```
![100 * insert CHAR(100) using batch (for mariadb) or loop for other driver (batch doesn't exists) benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=68&data2=66&data3=3271)

##  3 * insert 100 characters pipelining

```
3 * insert 100 characters pipelining
            mysql :    2,366 ops/s ± 0.5% 
           mysql2 :  2,066.5 ops/s ± 0.6%  (  -12.7% )
          mariadb :  4,447.5 ops/s ± 1.5%  (    +88% )
```
![3 * insert 100 characters pipelining benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=2366&data2=2067&data3=4447)

##  select 1000 rows of CHAR(32)

```
select 1000 rows of CHAR(32)
            mysql :  1,013.8 ops/s ± 0.5% 
           mysql2 :  1,159.7 ops/s ± 1.3%  (  +14.4% )
          mariadb :  1,630.6 ops/s ± 0.5%  (  +60.8% )
```
![select 1000 rows of CHAR(32) benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=1014&data2=1160&data3=1631)

##  select 1000 rows of CHAR(32) - BINARY

```
select 1000 rows of CHAR(32) - BINARY
           mysql2 :  1,125.2 ops/s ± 1.7% 
          mariadb :  1,421.4 ops/s ± 0.6%  (  +26.3% )
```
![select 1000 rows of CHAR(32) - BINARY benchmark results](https://quickchart.io/chart/render/zm-36b213f4-8efe-4943-8f94-82edf94fce83?data1=1125&data2=1421)

##  select 100 int

```
select 100 int
            mysql :  2,287.9 ops/s ± 0.6% 
           mysql2 :  1,795.3 ops/s ± 1.6%  (  -21.5% )
          mariadb :  3,219.9 ops/s ± 0.8%  (  +40.7% )
```
![select 100 int benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=2288&data2=1795&data3=3220)

##  select 100 int - BINARY

```
select 100 int - BINARY
           mysql2 :  1,821.6 ops/s ± 1.7% 
          mariadb :  5,428.1 ops/s ± 0.6%  (   +198% )
```
![select 100 int - BINARY benchmark results](https://quickchart.io/chart/render/zm-36b213f4-8efe-4943-8f94-82edf94fce83?data1=1822&data2=5428)

##  select 1 int + char(32)

```
select 1 int + char(32)
            mysql :  6,281.1 ops/s ± 0.6% 
           mysql2 :    5,839 ops/s ±   1%  (     -7% )
          mariadb :  6,862.8 ops/s ± 0.6%  (   +9.3% )
```
![select 1 int + char(32) benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=6281&data2=5839&data3=6863)

##  select 1 int + char(32) with pool

```
select 1 int + char(32) with pool
            mysql :  6,572.1 ops/s ± 0.7% 
           mysql2 :  5,717.6 ops/s ± 1.6%  (    -13% )
          mariadb :    7,297 ops/s ± 0.6%  (    +11% )
```
![select 1 int + char(32) with pool benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=6572&data2=5718&data3=7297)

##  select 1 random int + char(32)

```
select 1 random int + char(32)
            mysql :  6,142.2 ops/s ± 0.6% 
           mysql2 :  2,964.6 ops/s ± 1.2%  (  -51.7% )
          mariadb :    6,781 ops/s ± 0.6%  (  +10.4% )
```
![select 1 random int + char(32) benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=6142&data2=2965&data3=6781)

##  select now()

```
select now()
            mysql :  6,942.1 ops/s ± 0.7% 
           mysql2 :  6,135.5 ops/s ± 1.1%  (  -11.6% )
          mariadb :  7,640.5 ops/s ± 0.6%  (  +10.1% )
```
![select now() benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=6942&data2=6135&data3=7640)


### local server
root@ubuntu-g-4vcpu-16gb-sfo3-cli:~/mariadb-connector-nodejs# npm run benchmark

> mariadb@3.1.0 benchmark
> node benchmarks/benchmarks-all.js

{
user: 'root',
database: 'testn',
socketPath: '/run/mysqld/mysqld.sock',
connectTimeout: 2000,
charset: 'utf8mb4',
trace: false
}
##  do 1

```
do 1
            mysql : 26,415.6 ops/s ± 1.2% 
           mysql2 : 21,160.5 ops/s ± 1.2%  (  -19.9% )
          mariadb : 34,484.5 ops/s ± 1.2%  (  +30.5% )
```
![do 1 benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=26416&data2=21161&data3=34484)

##  do 1000 parameter

```
do 1000 parameter
            mysql :  3,111.2 ops/s ± 1.1% 
           mysql2 :  3,071.3 ops/s ±   1%  (   -1.3% )
          mariadb :  3,470.3 ops/s ± 1.1%  (  +11.5% )
```
![do 1000 parameter benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=3111&data2=3071&data3=3470)

##  do random number with pool

```
do <random number> with pool
            mysql : 24,798.3 ops/s ± 1.2% 
           mysql2 : 20,368.8 ops/s ± 1.3%  (  -17.9% )
          mariadb : 30,820.4 ops/s ± 1.1%  (  +24.3% )
```
![do <random number> with pool benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=24798&data2=20369&data3=30820)

##  insert 10 VARCHAR(100)

```
insert 10 VARCHAR(100)
            mysql :  7,043.9 ops/s ± 1.1% 
           mysql2 :  5,988.2 ops/s ± 1.6%  (    -15% )
          mariadb :  7,734.1 ops/s ± 1.3%  (   +9.8% )
```
![insert 10 VARCHAR(100) benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=7044&data2=5988&data3=7734)

##  100 * insert CHAR(100) using batch (for mariadb) or loop for other driver (batch doesn't exists)

```
100 * insert CHAR(100) using batch (for mariadb) or loop for other driver (batch doesn't exists)
            mysql :      219 ops/s ± 0.9% 
           mysql2 :    173.6 ops/s ± 1.4%  (  -20.7% )
          mariadb :  6,489.8 ops/s ± 1.2%  ( +2,863% )
```
![100 * insert CHAR(100) using batch (for mariadb) or loop for other driver (batch doesn't exists) benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=219&data2=174&data3=6490)

##  3 * insert 100 characters pipelining

```
3 * insert 100 characters pipelining
            mysql :  6,940.5 ops/s ±   1% 
           mysql2 :  6,111.9 ops/s ± 1.5%  (  -11.9% )
          mariadb : 12,327.3 ops/s ± 1.4%  (  +77.6% )
```
![3 * insert 100 characters pipelining benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=6940&data2=6112&data3=12327)

##  select 1000 rows of CHAR(32)

```
select 1000 rows of CHAR(32)
            mysql :  1,140.7 ops/s ± 0.9% 
           mysql2 :  1,474.5 ops/s ± 1.5%  (  +29.3% )
          mariadb :  2,185.2 ops/s ± 1.1%  (  +91.6% )
```
![select 1000 rows of CHAR(32) benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=1141&data2=1475&data3=2185)

##  select 1000 rows of CHAR(32) - BINARY

```
select 1000 rows of CHAR(32) - BINARY
           mysql2 :    1,439 ops/s ± 1.6% 
          mariadb :  1,797.5 ops/s ± 0.6%  (  +24.9% )
```
![select 1000 rows of CHAR(32) - BINARY benchmark results](https://quickchart.io/chart/render/zm-36b213f4-8efe-4943-8f94-82edf94fce83?data1=1439&data2=1797)

##  select 100 int

```
select 100 int
            mysql :  2,738.7 ops/s ± 1.3% 
           mysql2 :  2,404.9 ops/s ± 1.3%  (  -12.2% )
          mariadb :  5,650.8 ops/s ± 1.4%  ( +106.3% )
```
![select 100 int benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=2739&data2=2405&data3=5651)

##  select 100 int - BINARY

```
select 100 int - BINARY
           mysql2 :  2,473.4 ops/s ± 1.3% 
          mariadb :   10,533 ops/s ± 1.7%  ( +325.9% )
```
![select 100 int - BINARY benchmark results](https://quickchart.io/chart/render/zm-36b213f4-8efe-4943-8f94-82edf94fce83?data1=2473&data2=10533)

##  select 1 int + char(32)

```
select 1 int + char(32)
            mysql : 19,504.9 ops/s ±   1% 
           mysql2 : 15,340.4 ops/s ± 1.5%  (  -21.4% )
          mariadb : 24,799.3 ops/s ± 0.4%  (  +27.1% )
```
![select 1 int + char(32) benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=19505&data2=15340&data3=24799)

##  select 1 int + char(32) with pool

```
select 1 int + char(32) with pool
            mysql :   19,272 ops/s ±   1% 
           mysql2 : 14,560.2 ops/s ± 1.7%  (  -24.4% )
          mariadb : 24,219.4 ops/s ± 0.8%  (  +25.7% )
```
![select 1 int + char(32) with pool benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=19272&data2=14560&data3=24219)

##  select 1 random int + char(32)

```
select 1 random int + char(32)
            mysql : 17,599.9 ops/s ± 1.4% 
           mysql2 :  4,828.1 ops/s ± 1.5%  (  -72.6% )
          mariadb : 21,099.5 ops/s ± 1.4%  (  +19.9% )
```
![select 1 random int + char(32) benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=17600&data2=4828&data3=21100)

##  select now()

```
select now()
            mysql : 18,902.6 ops/s ± 1.8% 
           mysql2 : 15,491.6 ops/s ± 1.6%  (    -18% )
          mariadb : 25,456.7 ops/s ± 0.6%  (  +34.7% )
```
![select now() benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=18903&data2=15492&data3=25457)

