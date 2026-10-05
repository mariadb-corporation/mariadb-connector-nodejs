# Benchmarks

Performance benchmarks for the MariaDB Node.js Connector, with optional side-by-side
comparison against [`mysql`](https://www.npmjs.com/package/mysql) and
[`mysql2`](https://www.npmjs.com/package/mysql2). The benchmark sources live under
[`benchmarks/`](../benchmarks); see [`benchmarks/README.md`](../benchmarks/README.md)
for the full how-to and how to write a new benchmark.

The benchmark harness uses [`tinybench`](https://www.npmjs.com/package/tinybench).

## Running

mariadb only:

```sh
npm run benchmark
```

With `mysql` and `mysql2` for comparison:

```sh
npm run benchmark:setup   # npm install --no-save promise-mysql mysql2
npm run benchmark
```

`--no-save` installs the two extra drivers into `node_modules/` without modifying
`package.json` or `package-lock.json`. To remove them later, delete the two
directories or re-run `npm install`.

Each task runs at least `PERF_SAMPLES` iterations (default `200`) and at least
2 seconds of wall clock, after a warmup phase of `PERF_SAMPLES` queries against
the mariadb connection.

```sh
PERF_SAMPLES=500 npm run benchmark
```

The `mariadb` and `mysql2` connections are created with the `rowsAsArray` option: rows are
returned as arrays, the fastest result format of both drivers. `mysql` has no such option and
returns rows as objects.

`mysql` is exposed through the
[`promise-mysql`](https://www.npmjs.com/package/promise-mysql) wrapper since the
`mysql` package itself doesn't implement promises.

## Sample run

The figures below come from a single host running both client and server (Linux,
16-core, MariaDB 12.3, Node.js 22, `PERF_SAMPLES=500`). Performance is highly
dependent on hardware, network, server version and configuration — run the
benchmark on your own setup for numbers that mean something to you.

Packages compared:

* [**mysql**](https://www.npmjs.com/package/mysql) (via `promise-mysql` 5.2.0)
* [**mysql2**](https://www.npmjs.com/package/mysql2) 3.24.5
* [**mariadb**](https://www.npmjs.com/package/mariadb) (this connector)

```
##  do 1
do 1
          mariadb : 60,756.9 ops/s ± 0.1%  ( +136.2% )
            mysql : 25,720.6 ops/s ± 0.1%
           mysql2 : 32,115.8 ops/s ± 0.1%  (  +24.9% )

##  do 1000 parameter
do 1000 parameter
          mariadb :  6,200.9 ops/s ± 0.2%  (  +30.3% )
            mysql :  4,760.8 ops/s ± 0.3%
           mysql2 :  5,315.8 ops/s ± 0.2%  (  +11.7% )

##  do <random number> with pool
do <random number> with pool
          mariadb : 55,308.7 ops/s ± 0.1%  ( +122.7% )
            mysql :   24,836 ops/s ± 0.1%
           mysql2 : 30,847.7 ops/s ± 0.1%  (  +24.2% )

##  insert 10 VARCHAR(100)
insert 10 VARCHAR(100)
          mariadb : 12,542.2 ops/s ± 0.2%  (  +48.9% )
            mysql :  8,421.7 ops/s ± 0.2%
           mysql2 :  9,097.1 ops/s ± 0.3%  (     +8% )

##  100 * insert CHAR(100) using batch (for mariadb) or loop for other driver (batch doesn't exist)
100 * insert CHAR(100) using batch (for mariadb) or loop for other driver (batch doesn't exist)
          mariadb :  8,672.8 ops/s ± 0.2%  ( +3,282.9% )
            mysql :    256.4 ops/s ± 0.9%
           mysql2 :      295 ops/s ± 0.9%  (    +15% )

##  insert 10 Dates
insert 10 Dates
          mariadb : 23,649.3 ops/s ± 0.2%  (    +57% )
            mysql : 15,067.5 ops/s ± 0.1%
           mysql2 : 17,724.9 ops/s ± 0.1%  (  +17.6% )

##  3 * insert 100 characters pipelining
3 * insert 100 characters pipelining
          mariadb : 19,743.2 ops/s ± 0.1%  ( +140.3% )
            mysql :  8,215.6 ops/s ± 0.2%
           mysql2 :  9,425.7 ops/s ± 0.2%  (  +14.7% )

##  select 1000 rows of CHAR(32)
select 1000 rows of CHAR(32)
          mariadb :  3,923.7 ops/s ± 0.2%  ( +126.1% )
            mysql :  1,735.1 ops/s ± 0.3%
           mysql2 :  3,751.6 ops/s ± 0.4%  ( +116.2% )

##  select 1000 rows of CHAR(32) - BINARY
select 1000 rows of CHAR(32) - BINARY
          mariadb :    3,947 ops/s ± 0.2%  (   +6.2% )
           mysql2 :    3,716 ops/s ± 0.4%

##  select 100 int
select 100 int
          mariadb : 14,248.8 ops/s ± 0.1%  ( +171.2% )
            mysql :  5,254.1 ops/s ± 0.2%
           mysql2 : 10,296.4 ops/s ± 0.2%  (    +96% )

##  select 100 int - BINARY
select 100 int - BINARY
          mariadb : 14,135.1 ops/s ± 0.1%  (    +30% )
           mysql2 : 10,873.1 ops/s ± 0.2%

##  select 100 int no cache - BINARY
select 100 int no cache - BINARY
          mariadb : 10,135.5 ops/s ± 0.2%  (  +73.8% )
           mysql2 :  5,830.4 ops/s ± 0.3%

##  select 1 int + char(32)
select 1 int + char(32)
          mariadb : 40,696.4 ops/s ± 0.1%  (  +99.3% )
            mysql :   20,418 ops/s ± 0.1%
           mysql2 : 25,628.6 ops/s ± 0.1%  (  +25.5% )

##  select 1 int + char(32) with pool
select 1 int + char(32) with pool
          mariadb :   40,364 ops/s ± 0.1%  ( +101.1% )
            mysql : 20,076.4 ops/s ± 0.1%
           mysql2 : 26,625.3 ops/s ± 0.1%  (  +32.6% )

##  select 1 random int + char(32)
select 1 random int + char(32)
          mariadb : 38,222.1 ops/s ± 0.1%  ( +102.7% )
            mysql : 18,860.9 ops/s ± 0.1%
           mysql2 : 14,374.9 ops/s ± 0.1%  (  -23.8% )

##  select now()
select now()
          mariadb : 39,714.2 ops/s ± 0.1%  (  +99.1% )
            mysql :   19,945 ops/s ± 0.1%
           mysql2 : 25,032.3 ops/s ± 0.1%  (  +25.5% )
```

The percentage on each non-baseline line is computed against `mysql` (or against
`mysql2` when `mysql` was not run, e.g. for binary-protocol benchmarks the `mysql`
package doesn't support).
