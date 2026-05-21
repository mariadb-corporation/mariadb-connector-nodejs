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

`mysql` is exposed through the
[`promise-mysql`](https://www.npmjs.com/package/promise-mysql) wrapper since the
`mysql` package itself doesn't implement promises.

## Sample run

The figures below come from a single host running both client and server (Linux,
4-core, MariaDB 12.3, Node.js 20, `PERF_SAMPLES=200`). Performance is highly
dependent on hardware, network, server version and configuration — run the
benchmark on your own setup for numbers that mean something to you.

Packages compared:

* [**mysql**](https://www.npmjs.com/package/mysql) (via `promise-mysql` 5.2.0)
* [**mysql2**](https://www.npmjs.com/package/mysql2) 3.x
* [**mariadb**](https://www.npmjs.com/package/mariadb) (this connector)

```
##  do 1
do 1
          mariadb : 60,684.4 ops/s ± 0.1%  ( +114.2% )
            mysql : 28,324.7 ops/s ± 0.1%
           mysql2 : 32,709.2 ops/s ± 0.1%  (  +15.5% )

##  do 1000 parameter
do 1000 parameter
          mariadb :  6,386.4 ops/s ± 0.2%  (    +28% )
            mysql :  4,990.7 ops/s ± 0.3%
           mysql2 :  5,430.9 ops/s ± 0.2%  (   +8.8% )

##  do <random number> with pool
do <random number> with pool
          mariadb :   56,612 ops/s ± 0.1%  ( +107.7% )
            mysql : 27,254.3 ops/s ± 0.1%
           mysql2 :   31,892 ops/s ± 0.1%  (    +17% )

##  insert 10 VARCHAR(100)
insert 10 VARCHAR(100)
          mariadb : 12,401.2 ops/s ± 0.2%  (    +31% )
            mysql :  9,463.5 ops/s ± 0.2%
           mysql2 : 10,174.7 ops/s ± 0.2%  (   +7.5% )

##  100 * insert CHAR(100) using batch (for mariadb) or loop for other driver (batch doesn't exist)
100 * insert CHAR(100) using batch (for mariadb) or loop for other driver (batch doesn't exist)
          mariadb :  7,932.9 ops/s ± 0.2%  ( +2,974.8% )
            mysql :      258 ops/s ±   1%
           mysql2 :    273.4 ops/s ±   1%  (     +6% )

##  insert 10 Dates
insert 10 Dates
          mariadb : 24,311.5 ops/s ± 0.2%  (  +52.5% )
            mysql : 15,938.3 ops/s ± 0.2%
           mysql2 : 17,892.9 ops/s ± 0.2%  (  +12.3% )

##  3 * insert 100 characters pipelining
3 * insert 100 characters pipelining
          mariadb :   17,499 ops/s ± 0.1%  (  +92.6% )
            mysql :  9,083.5 ops/s ± 0.2%
           mysql2 :  8,968.8 ops/s ± 0.2%  (   -1.3% )

##  select 1000 rows of CHAR(32)
select 1000 rows of CHAR(32)
          mariadb :  3,999.7 ops/s ± 0.3%  (    +97% )
            mysql :    2,030 ops/s ± 0.5%
           mysql2 :  3,512.5 ops/s ± 0.5%  (    +73% )

##  select 1000 rows of CHAR(32) - BINARY
select 1000 rows of CHAR(32) - BINARY
          mariadb :  4,054.2 ops/s ± 0.3%  (  +14.9% )
           mysql2 :  3,527.4 ops/s ± 0.5%

##  select 100 int
select 100 int
          mariadb : 10,266.8 ops/s ± 0.2%  (  +87.6% )
            mysql :  5,472.4 ops/s ± 0.2%
           mysql2 :  4,783.5 ops/s ± 0.3%  (  -12.6% )

##  select 100 int - BINARY
select 100 int - BINARY
          mariadb : 10,605.8 ops/s ± 0.2%  ( +124.1% )
           mysql2 :  4,731.8 ops/s ± 0.3%

##  select 100 int no cache - BINARY
select 100 int no cache - BINARY
          mariadb :  8,554.7 ops/s ± 0.2%  ( +174.9% )
           mysql2 :  3,111.9 ops/s ± 0.4%

##  select 1 int + char(32)
select 1 int + char(32)
          mariadb : 36,366.2 ops/s ± 0.1%  (  +57.1% )
            mysql : 23,142.6 ops/s ± 0.1%
           mysql2 : 22,659.9 ops/s ± 0.1%  (   -2.1% )

##  select 1 int + char(32) with pool
select 1 int + char(32) with pool
          mariadb : 36,861.7 ops/s ± 0.1%  (  +65.9% )
            mysql :   22,225 ops/s ± 0.1%
           mysql2 : 22,221.6 ops/s ± 0.1%  (     -0% )

##  select 1 random int + char(32)
select 1 random int + char(32)
          mariadb : 34,288.5 ops/s ± 0.1%  (  +64.4% )
            mysql : 20,862.8 ops/s ± 0.1%
           mysql2 :  9,105.9 ops/s ± 0.2%  (  -56.4% )

##  select now()
select now()
          mariadb : 35,820.3 ops/s ± 0.1%  (  +64.7% )
            mysql : 21,755.1 ops/s ± 0.2%
           mysql2 :   22,239 ops/s ± 0.1%  (   +2.2% )
```

The percentage on each non-baseline line is computed against `mysql` (or against
`mysql2` when `mysql` was not run, e.g. for binary-protocol benchmarks the `mysql`
package doesn't support).
