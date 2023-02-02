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



### distant server

root@ubuntu-g-4vcpu-16gb-lon1-01:~/mariadb-connector-nodejs# npm run benchmark

> mariadb@3.1.0 benchmark
> node benchmarks/benchmarks-all.js

{
user: 'root',
database: 'testn',
host: '138.68.163.181',
connectTimeout: 2000,
port: 3306,
charset: 'utf8mb4',
trace: false
}
##  do 1

```
do 1
            mysql :  6,438.8 ops/s ± 0.7% 
           mysql2 :  6,413.8 ops/s ± 0.8%  (   -0.4% )
          mariadb :  7,102.9 ops/s ± 0.5%  (  +10.3% )
```
![do 1 benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=6439&data2=6414&data3=7103)

##  do 1000 parameter

```
do 1000 parameter
            mysql :  1,973.3 ops/s ± 0.4% 
           mysql2 :  1,914.4 ops/s ± 0.3%  (     -3% )
          mariadb :  2,176.6 ops/s ± 0.4%  (  +10.3% )
```
![do 1000 parameter benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=1973&data2=1914&data3=2177)

##  do random number with pool

```
do <random number> with pool
            mysql :  5,644.6 ops/s ± 1.4% 
           mysql2 :  5,485.8 ops/s ± 1.2%  (   -2.8% )
          mariadb :  6,850.2 ops/s ± 0.8%  (  +21.4% )
```
![do <random number> with pool benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=5645&data2=5486&data3=6850)

##  insert 10 parameters of 100 characters

```
insert 10 parameters of 100 characters
            mysql :  3,254.4 ops/s ± 0.8% 
           mysql2 :  3,038.9 ops/s ± 0.8%  (   -6.6% )
          mariadb :    3,710 ops/s ±   1%  (    +14% )
```
![insert 10 parameters of 100 characters benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=3254&data2=3039&data3=3710)

##  100 * insert 100 characters using batch method (for mariadb) or loop for other driver (batch doesn't exists)

```
100 * insert 100 characters using batch method (for mariadb) or loop for other driver (batch doesn't exists)
            mysql :     60.7 ops/s ± 0.7% 
           mysql2 :       52 ops/s ± 0.9%  (  -14.3% )
          mariadb :  3,149.3 ops/s ± 0.5%  ( +5,089.9% )
```
![100 * insert 100 characters using batch method (for mariadb) or loop for other driver (batch doesn't exists) benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=61&data2=52&data3=3149)

##  3 * insert 100 characters pipelining

```
3 * insert 100 characters pipelining
            mysql :    1,966 ops/s ± 0.5% 
           mysql2 :  1,825.3 ops/s ± 0.7%  (   -7.2% )
          mariadb :  4,393.5 ops/s ± 1.3%  ( +123.5% )
```
![3 * insert 100 characters pipelining benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=1966&data2=1825&data3=4394)

##  select 1

```
select 1
            mysql :  5,920.3 ops/s ± 0.8% 
           mysql2 :  5,085.4 ops/s ± 0.9%  (  -14.1% )
          mariadb :  6,675.5 ops/s ± 0.4%  (  +12.8% )
```
![select 1 benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=5920&data2=5085&data3=6675)

##  select 1000 rows

```
select 1000 rows
            mysql :    825.2 ops/s ± 0.5% 
           mysql2 :  1,062.1 ops/s ± 2.2%  (  +28.7% )
          mariadb :    1,399 ops/s ± 0.4%  (  +69.5% )
```
![select 1000 rows benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=825&data2=1062&data3=1399)

##  select 1000 rows - BINARY

```
select 1000 rows - BINARY
           mysql2 :    1,100 ops/s ± 2.1% 
          mariadb :    1,176 ops/s ± 0.3%  (   +6.9% )
```
![select 1000 rows benchmark results](https://quickchart.io/chart/render/zm-36b213f4-8efe-4943-8f94-82edf94fce83?data1=1100&data2=1176)

##  select 100 int - BINARY

```
select 100 int - BINARY
           mysql2 :  1,675.9 ops/s ± 1.7% 
          mariadb :  4,237.6 ops/s ± 0.5%  ( +152.9% )
```
![select 100 int - BINARY benchmark results](https://quickchart.io/chart/render/zm-36b213f4-8efe-4943-8f94-82edf94fce83?data1=1676&data2=4238)

##  select 100 int

```
select 100 int
            mysql :  1,829.4 ops/s ± 0.4% 
           mysql2 :    1,613 ops/s ± 1.9%  (  -11.8% )
          mariadb :  2,573.9 ops/s ± 0.4%  (  +40.7% )
```
![select 100 int benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=1829&data2=1613&data3=2574)

##  select 1 int + char

```
select 1 int + char
            mysql :  5,597.3 ops/s ± 0.7% 
           mysql2 :  5,132.8 ops/s ± 1.2%  (   -8.3% )
          mariadb :  6,352.8 ops/s ± 0.7%  (  +13.5% )
```
![select 1 int + char benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=5597&data2=5133&data3=6353)

##  select 1 int + char with pool

```
select 1 int + char with pool
            mysql :  5,528.3 ops/s ± 0.6% 
           mysql2 :  5,374.6 ops/s ± 1.6%  (   -2.8% )
          mariadb :    6,016 ops/s ± 0.5%  (   +8.8% )
```
![select 1 int + char with pool benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=5528&data2=5375&data3=6016)

##  select 1 random int + char

```
select 1 random int + char
            mysql :  5,439.7 ops/s ± 0.7% 
           mysql2 :  2,492.2 ops/s ± 0.9%  (  -54.2% )
          mariadb :  6,050.2 ops/s ± 1.6%  (  +11.2% )
```
![select 1 random int + char benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=5440&data2=2492&data3=6050)

### local server
root@ubuntu-g-4vcpu-16gb-lon1-01:~/mariadb-connector-nodejs# npm run benchmark

> mariadb@3.0.2 benchmark
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
            mysql : 25,149.8 ops/s ± 2.5% 
           mysql2 : 19,974.2 ops/s ± 1.9%  (  -20.6% )
          mariadb : 35,398.9 ops/s ± 1.7%  (  +40.8% )
```
![do 1 benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=25150&data2=19974&data3=35399)

##  do 1000 parameter

```
do 1000 parameter
            mysql :  2,769.3 ops/s ± 0.4% 
           mysql2 :  2,626.3 ops/s ± 1.5%  (   -5.2% )
          mariadb :  2,866.5 ops/s ± 1.3%  (   +3.5% )
```
![do 1000 parameter benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=2769&data2=2626&data3=2866)

##  do random number with pool

```
do <random number> with pool
            mysql : 22,561.2 ops/s ± 2.5% 
           mysql2 : 18,812.9 ops/s ± 2.1%  (  -16.6% )
          mariadb : 30,034.5 ops/s ± 2.5%  (  +33.1% )
```
![do <random number> with pool benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=22561&data2=18813&data3=30035)

##  insert 10 parameters of 100 characters

```
insert 10 parameters of 100 characters
            mysql :  6,192.6 ops/s ± 1.8% 
           mysql2 :  5,272.1 ops/s ± 2.4%  (  -14.9% )
          mariadb :  6,577.3 ops/s ± 2.8%  (   +6.2% )
```
![insert 10 parameters of 100 characters benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=6193&data2=5272&data3=6577)

##  100 * insert 100 characters using batch method (for mariadb) or loop for other driver (batch doesn't exists)

```
100 * insert 100 characters using batch method (for mariadb) or loop for other driver (batch doesn't exists)
            mysql :    182.2 ops/s ±   2% 
           mysql2 :    139.7 ops/s ± 2.8%  (  -23.3% )
          mariadb :    5,322 ops/s ± 2.2%  ( +2,820.3% )
```
![100 * insert 100 characters using batch method (for mariadb) or loop for other driver (batch doesn't exists) benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=182&data2=140&data3=5322)

##  3 * insert 100 characters pipelining

```
3 * insert 100 characters pipelining
            mysql :  6,314.2 ops/s ± 1.8% 
           mysql2 :  5,323.2 ops/s ± 2.8%  (  -15.7% )
          mariadb :  8,881.5 ops/s ± 5.6%  (  +40.7% )
```
![3 * insert 100 characters pipelining benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=6314&data2=5323&data3=8881)

##  select 1

```
select 1
            mysql : 18,948.5 ops/s ± 1.7% 
           mysql2 : 13,798.8 ops/s ±   3%  (  -27.2% )
          mariadb : 25,623.5 ops/s ± 1.5%  (  +35.2% )
```
![select 1 benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=18948&data2=13799&data3=25623)

##  select 1000 rows

```
select 1000 rows
            mysql :  1,000.9 ops/s ± 1.1% 
           mysql2 :  1,203.7 ops/s ± 2.2%  (  +20.3% )
          mariadb :    1,739 ops/s ± 1.7%  (  +73.7% )
```
![select 1000 rows benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=1001&data2=1204&data3=1739)

##  select 1000 rows - BINARY

```
select 1000 rows - BINARY
           mysql2 :  1,245.1 ops/s ± 2.6% 
          mariadb :  1,470.6 ops/s ± 1.2%  (  +18.1% )
```
![select 1000 rows benchmark results](https://quickchart.io/chart/render/zm-36b213f4-8efe-4943-8f94-82edf94fce83?data1=1245&data2=1471)

##  select 100 int - BINARY

```
select 100 int - BINARY
           mysql2 :  2,042.3 ops/s ± 2.3% 
          mariadb :  8,101.4 ops/s ± 1.2%  ( +296.7% )
```
![select 100 int - BINARY benchmark results](https://quickchart.io/chart/render/zm-36b213f4-8efe-4943-8f94-82edf94fce83?data1=2042&data2=8101)

##  select 100 int

```
select 100 int
            mysql :  2,364.7 ops/s ± 1.6% 
           mysql2 :  1,977.8 ops/s ± 1.9%  (  -16.4% )
          mariadb :    3,869 ops/s ± 2.5%  (  +63.6% )
```
![select 100 int benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=2365&data2=1978&data3=3869)

##  select 1 int + char

```
select 1 int + char
            mysql : 18,398.6 ops/s ± 1.2% 
           mysql2 : 12,778.7 ops/s ± 2.6%  (  -30.5% )
          mariadb : 22,981.5 ops/s ± 1.8%  (  +24.9% )
```
![select 1 int + char benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=18399&data2=12779&data3=22982)

##  select 1 int + char with pool

```
select 1 int + char with pool
            mysql : 17,036.2 ops/s ± 1.9% 
           mysql2 : 12,545.6 ops/s ± 2.5%  (  -26.4% )
          mariadb : 23,153.1 ops/s ± 1.4%  (  +35.9% )
```
![select 1 int + char with pool benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=17036&data2=12546&data3=23153)

##  select 1 random int + char

```
select 1 random int + char
            mysql : 14,464.2 ops/s ± 2.9% 
           mysql2 :  3,822.3 ops/s ± 1.7%  (  -73.6% )
          mariadb : 19,917.9 ops/s ± 2.2%  (  +37.7% )
```
![select 1 random int + char benchmark results](https://quickchart.io/chart/render/zm-ef74089a-be91-49f1-b5a0-5b9ac5752435?data1=14464&data2=3822&data3=19918)

