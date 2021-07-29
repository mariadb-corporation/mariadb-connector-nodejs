# Benchmark 

Benchmarks for the MariaDB Node.js Connector are done using the [benchmark](https://www.npmjs.com/package/benchmark) package.   You can find the source code for our benchmarks in the [`benchmarks/`](../benchmarks) folder.

You can run benchmarks using npm.  To run it on the `mariadb` Connector only, use the following command:

```
$ npm run benchmark
```

Npm runs a series on the MariaDB Server then returns the execution times.  
While this may give you a rough idea of how it performs, it's better to compare to other MySQL connector packages, like [mysql](https://www.npmjs.com/package/mysql) and [mysql2](https://www.npmjs.com/package/mysql2) packages. 




The [mysql](https://www.npmjs.com/package/mysql) package doesn't implement Promise, so using use the [promise-mysql](https://www.npmjs.com/package/promise-mysql) package.

run the benchmarks:
```
$ npm install mysql mysql2 promise-mysql
$ npm run benchmark
```

## Results

Benchmarks runs on two Digital Ocean hosts with 8GB of memory and 4 CPU's, running Ubuntu 20.04.

* **Server Host**: MariaDB 10.6 under the default configuration, just commenting bind-address to permit access from other server.
* **Client Host**: Node.js version v16.5.0 
  (change the ./test/conf.js to set connection information)

The MariaDB Node.js Connector was then tested along side the following MySQL connectors:

* [**mysql**](https://www.npmjs.com/package/mysql): version 2.18.1 
* [**mysql2**](https://www.npmjs.com/package/mysql2): version 2.2.5
* [**promise-mysql**](https://www.npmjs.com/package/promise-mysql): version 5.0.3

benchmarks runs the same command 10 different threads (each one having a dedicated connection). 

``` 

> mariadb@3.0.1-rc benchmark
> node ./benchmarks/benchmarks.js

{
  connectionLimit: 1,
  user: 'diego',
  password: 'diego',
  database: 'testn',
  host: '161.35.216.219',
  connectTimeout: 1000,
  port: 3306,
  charsetNumber: 45,
  trace: false
}
benchmark: ./benchs/do.js
benchmark: ./benchs/insert.js
benchmark: ./benchs/insert_batch.js
benchmark: ./benchs/insert_pipelining.js
benchmark: ./benchs/select_collation.js
benchmark: ./benchs/select_one_user.js
benchmark: ./benchs/select_one_user_execute.js
benchmark: ./benchs/select_one_user_pool.js
benchmark: ./benchs/select_one_user_pool_random.js
benchmark: ./benchs/select_random_param.js
driver for MYSQL2 connected [1/3]
driver for MARIADB connected [2/3]
driver for MYSQL connected [3/3]
start : init test : 10
initializing test data 1/10
initializing test data 2/10
initializing test data 3/10
initializing test data 4/10
initializing test data 5/10
initializing test data 6/10
initializing test data 7/10
initializing test data 8/10
initializing test data 9/10
initializing test data 10/10
initializing test data done
simultaneous call: 1
do <random number> - warmup x 5,015 ops/sec ±0.87% (280 runs sampled)
do <random number> - mysql x 4,826 ops/sec ±1.06% (280 runs sampled)
do <random number> - mysql2 x 4,174 ops/sec ±0.86% (278 runs sampled)
do <random number> - mariadb x 5,009 ops/sec ±0.45% (279 runs sampled)
insert 10 parameters of 100 characters - warmup x 3,928 ops/sec ±0.53% (282 runs sampled)
insert 10 parameters of 100 characters - mysql x 3,614 ops/sec ±0.62% (280 runs sampled)
insert 10 parameters of 100 characters - mysql2 x 3,475 ops/sec ±0.59% (283 runs sampled)
insert 10 parameters of 100 characters - mariadb x 3,968 ops/sec ±0.53% (282 runs sampled)
100 * insert 100 characters using batch method (for mariadb) or loop for other driver (batch doesn't exists) - warmup x 2,454 ops/sec ±0.85% (278 runs sampled)
100 * insert 100 characters using batch method (for mariadb) or loop for other driver (batch doesn't exists) - mysql x 47.09 ops/sec ±0.46% (270 runs sampled)
100 * insert 100 characters using batch method (for mariadb) or loop for other driver (batch doesn't exists) - mysql2 x 44.32 ops/sec ±0.43% (267 runs sampled)
100 * insert 100 characters using batch method (for mariadb) or loop for other driver (batch doesn't exists) - mariadb x 2,449 ops/sec ±0.81% (277 runs sampled)
insert 100 characters pipelining - warmup x 4,502 ops/sec ±0.46% (281 runs sampled)
insert 100 characters pipelining - mysql x 4,136 ops/sec ±0.66% (279 runs sampled)
insert 100 characters pipelining - mysql2 x 3,923 ops/sec ±0.65% (279 runs sampled)
insert 100 characters pipelining - mariadb x 4,445 ops/sec ±0.50% (281 runs sampled)
select collations - warmup x 1,037 ops/sec ±0.60% (280 runs sampled)
select collations - mysql x 829 ops/sec ±0.62% (280 runs sampled)
select collations - mysql2 x 988 ops/sec ±0.55% (280 runs sampled)
select collations - mariadb x 1,059 ops/sec ±0.43% (280 runs sampled)
select one mysql.user - warmup x 1,594 ops/sec ±0.42% (282 runs sampled)
select one mysql.user - mysql x 1,442 ops/sec ±0.38% (283 runs sampled)
select one mysql.user - mysql2 x 1,484 ops/sec ±0.60% (282 runs sampled)
select one mysql.user - mariadb x 1,595 ops/sec ±0.38% (284 runs sampled)
select one mysql.user using execute - warmup x 2,657 ops/sec ±0.60% (278 runs sampled)
select one mysql.user using execute - mysql2 x 2,257 ops/sec ±0.84% (280 runs sampled)
select one mysql.user using execute - mariadb x 2,651 ops/sec ±0.59% (280 runs sampled)
select one mysql.user using pool - warmup x 1,567 ops/sec ±0.34% (283 runs sampled)
select one mysql.user using pool - mysql x 1,061 ops/sec ±0.54% (283 runs sampled)
select one mysql.user using pool - mysql2 x 1,513 ops/sec ±0.33% (284 runs sampled)
select one mysql.user using pool - mariadb x 1,571 ops/sec ±0.36% (282 runs sampled)
select one mysql.user and a random number [no caching client side] - warmup x 1,539 ops/sec ±0.35% (282 runs sampled)
select one mysql.user and a random number [no caching client side] - mysql x 1,058 ops/sec ±0.52% (282 runs sampled)
select one mysql.user and a random number [no caching client side] - mysql2 x 716 ops/sec ±1.39% (272 runs sampled)
select one mysql.user and a random number [no caching client side] - mariadb x 1,555 ops/sec ±0.47% (282 runs sampled)
select random number - warmup x 4,686 ops/sec ±0.47% (280 runs sampled)
select random number - mysql x 4,548 ops/sec ±0.75% (282 runs sampled)
select random number - mysql2 x 4,118 ops/sec ±0.68% (278 runs sampled)
select random number - mariadb x 4,799 ops/sec ±0.48% (277 runs sampled)
completed
ending connectors


--- BENCHMARK RESULTS ---
/* travis bench are not to take as is, because VM might run some other testing script that can change results */

bench : do <random number> [ sql: do ? ] https://quickchart.io/chart/render/zm-e2bd7f00-c7ca-4412-84e5-5284055056b5?data1=4826&data2=4174&data3=5009&title=do%20%3Crandom%20number%3E%0A%20%5B%20sql%3A%20do%20%3F%20%5D
              mysql :  4,826.5 ops/s ±1.060698947072533% 
             mysql2 :  4,174.5 ops/s ±0.8572946461820163%  (  -13.5% )
            mariadb :  5,009.2 ops/s ±0.44937002966145695%  (   +3.8% )

bench : insert 10 parameters of 100 characters [ sql: INSERT INTO perfTestText VALUES (?, ?, ?, ?, ?,?, ?, ?, ?, ?) ] https://quickchart.io/chart/render/zm-e2bd7f00-c7ca-4412-84e5-5284055056b5?data1=3614&data2=3475&data3=3968&title=insert%2010%20parameters%20of%20100%20characters%0A%20%5B%20sql%3A%20INSERT%20INTO%20perfTestText%20VALUES%20(%3F%2C%20%3F%2C%20%3F%2C%20%3F%2C%20%3F%2C%3F%2C%20%3F%2C%20%3F%2C%20%3F%2C%20%3F)%20%5D
              mysql :  3,613.9 ops/s ±0.6172578026313225% 
             mysql2 :  3,474.8 ops/s ±0.5867082905425197%  (   -3.8% )
            mariadb :    3,968 ops/s ±0.5274504652838073%  (   +9.8% )

bench : 100 * insert 100 characters using batch method (for mariadb) or loop for other driver (batch doesn't exists) [ sql: INSERT INTO perfTestTextPipe VALUES (?) ] https://quickchart.io/chart/render/zm-e2bd7f00-c7ca-4412-84e5-5284055056b5?data1=47&data2=44&data3=2449&title=100%20*%20insert%20100%20characters%20using%20batch%20method%20(for%20mariadb)%20or%20loop%20for%20other%20driver%20(batch%20doesn't%20exists)%0A%20%5B%20sql%3A%20INSERT%20INTO%20perfTestTextPipe%20VALUES%20(%3F)%20%5D
              mysql :     47.1 ops/s ±0.4627803707830262% 
             mysql2 :     44.3 ops/s ±0.4324249604479694%  (   -5.9% )
            mariadb :  2,449.5 ops/s ±0.814944113755422%  ( +5,101.9% )

bench : insert 100 characters pipelining [ sql: INSERT INTO testn.perfTestTextPipe VALUES (?) (into BLACKHOLE ENGINE) ] https://quickchart.io/chart/render/zm-e2bd7f00-c7ca-4412-84e5-5284055056b5?data1=4136&data2=3923&data3=4445&title=insert%20100%20characters%20pipelining%0A%20%5B%20sql%3A%20INSERT%20INTO%20testn.perfTestTextPipe%20VALUES%20(%3F)%20(into%20BLACKHOLE%20ENGINE)%20%5D
              mysql :  4,135.5 ops/s ±0.6574825949230209% 
             mysql2 :  3,922.8 ops/s ±0.6491799554930316%  (   -5.1% )
            mariadb :  4,444.7 ops/s ±0.4976959542616146%  (   +7.5% )

bench : select collations [ sql: select * from information_schema.COLLATIONS ] https://quickchart.io/chart/render/zm-e2bd7f00-c7ca-4412-84e5-5284055056b5?data1=829&data2=988&data3=1059&title=select%20collations%0A%20%5B%20sql%3A%20select%20*%20from%20information_schema.COLLATIONS%20%5D
              mysql :      829 ops/s ±0.6181156533952505% 
             mysql2 :    987.8 ops/s ±0.5538432695037021%  (  +19.2% )
            mariadb :  1,058.8 ops/s ±0.4250619523095728%  (  +27.7% )

bench : select one mysql.user [ sql: select * from mysql.user LIMIT 1 ] https://quickchart.io/chart/render/zm-e2bd7f00-c7ca-4412-84e5-5284055056b5?data1=1442&data2=1484&data3=1595&title=select%20one%20mysql.user%0A%20%5B%20sql%3A%20select%20*%20from%20mysql.user%20LIMIT%201%20%5D
              mysql :  1,442.2 ops/s ±0.37614639649897263% 
             mysql2 :  1,484.2 ops/s ±0.5998685712345835%  (   +2.9% )
            mariadb :  1,595.1 ops/s ±0.3849617561628671%  (  +10.6% )

bench : select one mysql.user using execute [ sql: select * from mysql.user LIMIT 1 ] https://quickchart.io/chart?devicePixelRatio=1.0&h=160&w=520&c=%7B%22type%22%3A%22horizontalBar%22%2C%22data%22%3A%7B%22datasets%22%3A%5B%7B%22label%22%3A%22mysql2%202.2.5%22%2C%22backgroundColor%22%3A%22%234285f4%22%2C%22data%22%3A%5B2257%5D%7D%2C%7B%22label%22%3A%22mariadb%203.0.1-beta%22%2C%22backgroundColor%22%3A%22%23ff9900%22%2C%22data%22%3A%5B2651%5D%7D%5D%7D%2C%22options%22%3A%7B%22plugins%22%3A%7B%22datalabels%22%3A%7B%22anchor%22%3A%22end%22%2C%22align%22%3A%22start%22%2C%22color%22%3A%22%23fff%22%2C%22font%22%3A%7B%22weight%22%3A%22bold%22%7D%7D%7D%2C%22elements%22%3A%7B%22rectangle%22%3A%7B%22borderWidth%22%3A0%7D%7D%2C%22responsive%22%3Atrue%2C%22legend%22%3A%7B%22position%22%3A%22right%22%7D%2C%22title%22%3A%7B%22display%22%3Atrue%2C%22text%22%3A%22select%20one%20mysql.user%20using%20execute%5Cn%20%5B%20sql%3A%20select%20*%20from%20mysql.user%20LIMIT%201%20%5D%22%7D%2C%22scales%22%3A%7B%22xAxes%22%3A%5B%7B%22display%22%3Atrue%2C%22scaleLabel%22%3A%7B%22display%22%3Atrue%2C%22labelString%22%3A%22operations%20per%20second%22%7D%2C%22ticks%22%3A%7B%22beginAtZero%22%3Atrue%7D%7D%5D%7D%7D%7D
             mysql2 :  2,257.5 ops/s ±0.8423274738148211% 
            mariadb :  2,650.7 ops/s ±0.5922932275214716%  (  +17.4% )

bench : select one mysql.user using pool [ sql: select * from mysql.user u LIMIT 1 ] https://quickchart.io/chart/render/zm-e2bd7f00-c7ca-4412-84e5-5284055056b5?data1=1061&data2=1513&data3=1571&title=select%20one%20mysql.user%20using%20pool%0A%20%5B%20sql%3A%20select%20*%20from%20mysql.user%20u%20LIMIT%201%20%5D
              mysql :  1,061.3 ops/s ±0.5373874147514515% 
             mysql2 :  1,513.1 ops/s ±0.3348213776238588%  (  +42.6% )
            mariadb :  1,571.2 ops/s ±0.3601534936799862%  (    +48% )

bench : select one mysql.user and a random number [no caching client side] [ sql: select u.*, <random field> from mysql.user u LIMIT 1 ] https://quickchart.io/chart/render/zm-e2bd7f00-c7ca-4412-84e5-5284055056b5?data1=1058&data2=716&data3=1555&title=select%20one%20mysql.user%20and%20a%20random%20number%20%5Bno%20caching%20client%20side%5D%0A%20%5B%20sql%3A%20select%20u.*%2C%20%3Crandom%20field%3E%20from%20mysql.user%20u%20LIMIT%201%20%5D
              mysql :  1,057.9 ops/s ±0.5235992573043083% 
             mysql2 :    716.2 ops/s ±1.3874227341785241%  (  -32.3% )
            mariadb :  1,554.9 ops/s ±0.46943312558064343%  (    +47% )

bench : select random number [ sql: select ? ] https://quickchart.io/chart/render/zm-e2bd7f00-c7ca-4412-84e5-5284055056b5?data1=4548&data2=4118&data3=4799&title=select%20random%20number%0A%20%5B%20sql%3A%20select%20%3F%20%5D
              mysql :  4,548.3 ops/s ±0.7496701832585163% 
             mysql2 :  4,117.6 ops/s ±0.6752547536332124%  (   -9.5% )
            mariadb :  4,799.1 ops/s ±0.4754299734491277%  (   +5.5% )
```

Note, the [mysql2](https://www.npmjs.com/package/mysql2) package uses metadata client caching, so queries with metadata in cache are faster than new queries.


<!--https://quickchart.io/sandbox/#%7B%0A%20%20%22type%22%3A%20%22horizontalBar%22%2C%0A%20%20%0A%20%20data%3A%20%7B%0A%20%20%20%20datasets%3A%20%5B%0A%20%20%20%20%20%20%7B%0A%20%20%20%20%20%20%20%20label%3A%20%22mysql%202.18.1%22%2C%0A%20%20%20%20%20%20%20%20backgroundColor%3A%20%22%23db4437%22%2C%0A%20%20%20%20%20%20%20%20borderColor%3A%20%22rgb(255%2C%2099%2C%20132)%22%2C%0A%20%20%20%20%20%20%20%20data%3A%20%5B320%5D%0A%20%20%20%20%20%20%7D%2C%0A%20%20%20%20%20%20%7B%0A%20%20%20%20%20%20%20%20label%3A%20%22mysql2%202.2.5%22%2C%0A%20%20%20%20%20%20%20%20backgroundColor%3A%20%22%234285f4%22%2C%0A%20%20%20%20%20%20%20%20borderColor%3A%20%22rgb(54%2C%20162%2C%20235)%22%2C%0A%20%20%20%20%20%20%20%20data%3A%20%5B450%5D%0A%20%20%20%20%20%20%7D%2C%0A%20%20%20%20%20%20%7B%0A%20%20%20%20%20%20%20%20%22label%22%3A%20%22mariadb%203.0.1%22%2C%0A%20%20%20%20%20%20%20%20%22backgroundColor%22%3A%20%22%23ff9900%22%2C%0A%20%20%20%20%20%20%20%20%22borderColor%22%3A%20%22%23ff9900%22%2C%0A%20%20%20%20%20%20%20%20%22data%22%3A%20%5B%0A%20%20%20%20%20%20%20%20%20%20660%0A%20%20%20%20%20%20%20%20%5D%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%5D%0A%20%20%7D%2C%0A%20%20%22options%22%3A%20%7B%0A%20%20%20%20plugins%3A%20%7B%0A%20%20%20%20%20%20datalabels%3A%20%7B%0A%20%20%20%20%20%20%20%20anchor%3A%20'end'%2C%0A%20%20%20%20%20%20%20%20align%3A%20'start'%2C%0A%20%20%20%20%20%20%20%20color%3A%20'%23fff'%2C%0A%20%20%20%20%20%20%20%20font%3A%20%7B%0A%20%20%20%20%20%20%20%20%20%20weight%3A%20'bold'%2C%0A%20%20%20%20%20%20%20%20%7D%2C%0A%20%20%20%20%20%20%7D%2C%0A%20%20%20%20%7D%2C%0A%20%20%20%20%22elements%22%3A%20%7B%0A%20%20%20%20%20%20%22rectangle%22%3A%20%7B%0A%20%20%20%20%20%20%20%20%22borderWidth%22%3A%200%0A%20%20%20%20%20%20%7D%0A%20%20%20%20%7D%2C%0A%20%20%20%20%22responsive%22%3A%20true%2C%0A%20%20%20%20%22legend%22%3A%20%7B%0A%20%20%20%20%20%20%22position%22%3A%20%22right%22%0A%20%20%20%20%7D%2C%0A%20%20%20%20%22title%22%3A%20%7B%0A%20%20%20%20%20%20%22display%22%3A%20true%2C%0A%20%20%20%20%20%20%22text%22%3A%20%22Select%20*%20from%20mysql%20user%20limit%201%22%0A%20%20%20%20%7D%2C%0A%20%20%20%20scales%3A%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20xAxes%3A%20%5B%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20display%3A%20true%2C%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20scaleLabel%3A%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20display%3A%20true%2C%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20labelString%3A%20'operations%20per%20second'%2C%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%7D%2C%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20ticks%3A%20%7B%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20beginAtZero%3A%20true%0A%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%7D%0A%20%20%20%20%20%20%20%20%20%20%20%20%7D%5D%0A%20%20%20%20%20%20%20%20%7D%0A%0A%20%20%7D%0A%7D-->
