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

Each benchmark runs in its own process, so that the heap left by one benchmark
does not slow the following ones.

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
          mariadb :   58,302 ops/s ± 0.1%  ( +137.2% )
            mysql : 24,575.8 ops/s ± 0.1%
           mysql2 : 34,534.9 ops/s ± 0.1%  (  +40.5% )

##  do 1000 parameter
do 1000 parameter
          mariadb :  6,025.5 ops/s ± 0.2%  (  +35.3% )
            mysql :    4,455 ops/s ± 0.2%
           mysql2 :  5,619.9 ops/s ± 0.2%  (  +26.1% )

##  do random number with pool
do <random number> with pool
          mariadb : 48,896.6 ops/s ± 0.1%  ( +273.7% )
            mysql : 13,085.4 ops/s ± 0.1%
           mysql2 : 27,855.6 ops/s ± 0.1%  ( +112.9% )

##  insert 10 VARCHAR(100)
insert 10 VARCHAR(100)
          mariadb : 20,274.2 ops/s ± 0.1%  (  +54.5% )
            mysql : 13,120.6 ops/s ± 0.2%
           mysql2 : 15,818.7 ops/s ± 0.2%  (  +20.6% )

##  100 * insert CHAR(100) using batch (for mariadb) or loop for other driver (batch doesn't exist)
100 * insert CHAR(100) using batch (for mariadb) or loop for other driver (batch doesn't exist)
          mariadb :  8,824.7 ops/s ± 0.2%  ( +3,332.9% )
            mysql :    257.1 ops/s ± 0.8%
           mysql2 :    313.4 ops/s ± 0.4%  (  +21.9% )

##  insert 10 Dates
insert 10 Dates
          mariadb : 22,591.2 ops/s ± 0.2%  (  +59.6% )
            mysql : 14,150.4 ops/s ± 0.2%
           mysql2 : 17,496.1 ops/s ± 0.2%  (  +23.6% )

##  3 * insert 100 characters pipelining
3 * insert 100 characters pipelining
          mariadb : 21,514.5 ops/s ± 0.1%  ( +160.4% )
            mysql :  8,263.5 ops/s ± 0.2%
           mysql2 : 10,362.8 ops/s ± 0.2%  (  +25.4% )

##  select 1000 rows of CHAR(32)
select 1000 rows of CHAR(32)
          mariadb :  4,525.7 ops/s ± 0.3%  ( +181.7% )
            mysql :  1,606.5 ops/s ± 0.3%
           mysql2 :  4,092.4 ops/s ± 0.2%  ( +154.7% )

##  select 1000 rows of CHAR(32) - BINARY
select 1000 rows of CHAR(32) - BINARY
          mariadb :    4,553 ops/s ± 0.3%  (  +13.2% )
           mysql2 :  4,020.6 ops/s ± 0.3%

##  select 100 int
select 100 int
          mariadb : 13,654.2 ops/s ± 0.2%  (   +167% )
            mysql :  5,113.2 ops/s ± 0.2%
           mysql2 : 10,090.6 ops/s ± 0.2%  (  +97.3% )

##  select 100 int - BINARY
select 100 int - BINARY
          mariadb : 17,182.1 ops/s ± 0.2%  (  +43.5% )
           mysql2 : 11,969.7 ops/s ± 0.1%

##  select 100 int no cache - BINARY
select 100 int no cache - BINARY
          mariadb : 10,011.9 ops/s ± 0.2%  (  +64.2% )
           mysql2 :  6,096.9 ops/s ± 0.3%

##  select 1 int + char(32)
select 1 int + char(32)
          mariadb : 40,407.8 ops/s ± 0.1%  ( +132.3% )
            mysql : 17,393.4 ops/s ± 0.2%
           mysql2 : 26,185.3 ops/s ± 0.1%  (  +50.5% )

##  select 1 int + char(32) with pool
select 1 int + char(32) with pool
          mariadb : 35,591.9 ops/s ± 0.1%  ( +232.9% )
            mysql : 10,692.5 ops/s ± 0.2%
           mysql2 : 23,806.7 ops/s ± 0.1%  ( +122.6% )

##  select 1 random int + char(32)
select 1 random int + char(32)
          mariadb : 37,846.6 ops/s ± 0.1%  ( +124.4% )
            mysql : 16,863.7 ops/s ± 0.2%
           mysql2 : 14,090.4 ops/s ± 0.2%  (  -16.4% )

##  select now()
select now()
          mariadb : 40,536.1 ops/s ± 0.1%  ( +133.9% )
            mysql : 17,327.1 ops/s ± 0.2%
           mysql2 : 24,812.7 ops/s ± 0.1%  (  +43.2% )
```

The percentage on each non-baseline line is computed against `mysql` (or against
`mysql2` when `mysql` was not run, e.g. for binary-protocol benchmarks the `mysql`
package doesn't support).
