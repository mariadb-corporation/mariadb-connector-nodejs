# Benchmarks

Performance benchmarks for the MariaDB Node.js connector, with optional side-by-side
comparison against `mysql` and `mysql2`.

## Requirements

- A reachable MariaDB or MySQL server.
- Connection settings come from [`test/conf.js`](../test/conf.js) — the same
  configuration the test suite uses. Override via the standard `TEST_DB_*`
  environment variables (see the project README for the full list).

## Running

```sh
npm run benchmark
```

By default, only the `mariadb` connector is benchmarked.

### Comparing against `mysql` and `mysql2`

The benchmark loads `promise-mysql` and `mysql2/promise` dynamically — if either is
installed it is included in the comparison, otherwise it is silently skipped. The two
drivers are **not** declared in `package.json`; install them locally only when you
want a comparison run:

```sh
npm run benchmark:setup   # npm install --no-save promise-mysql mysql2
npm run benchmark
```

`--no-save` means npm puts them in `node_modules/` without modifying `package.json`
or `package-lock.json`. To get rid of them afterwards, just delete the two
directories or re-run `npm install` to restore the locked state.

## Tuning

| Env var        | Default | Meaning                                                         |
| -------------- | ------- | --------------------------------------------------------------- |
| `PERF_SAMPLES` | `200`   | Minimum iterations per task **and** size of the warmup phase.   |

Each benchmark task also runs for at least 2 seconds regardless of iteration count
(set in [`common-bench.js`](common-bench.js)), so very fast queries still get a
meaningful sampling window. Bump `PERF_SAMPLES` if you need tighter confidence
intervals.

## What the output looks like

One block is printed per benchmark file. Example:

```
##  select 1 int + char(32)

select 1 int + char(32)
          mariadb : 36,366.2 ops/s ± 0.1%  (  +57.1% )
            mysql : 23,142.6 ops/s ± 0.1%
           mysql2 : 22,659.9 ops/s ± 0.1%  (   -2.1% )
```

The leading number is throughput (operations per second, higher is better). `± x%`
is the [relative margin of error](https://en.wikipedia.org/wiki/Margin_of_error)
on the throughput estimate at 99.9% confidence. The percentage in parentheses is
the change vs. the `mysql` baseline (or `mysql2` when `mysql` isn't being run).

See [`documentation/benchmarks.md`](../documentation/benchmarks.md) for a full
sample run across all benchmarks.

## Running a single benchmark

```sh
node benchmarks/benchmark-one.js
```

Edit the `import * as bench from './benchs/<name>.js'` line at the top of
[`benchmark-one.js`](benchmark-one.js) to pick which one to run.

## Writing a new benchmark

Each file in [`benchs/`](benchs) is a tiny ES module exporting:

- `title` *(string)* — printed as the section header in the output.
- `displaySql` *(string)* — SQL pattern shown in the report.
- `benchFct(conn, type)` *(async function)* — the workload. `conn` is a connection
  or pool; `type` is the driver name (`'mariadb'`, `'mysql'`, `'mysql2'`) so the
  function can branch when the drivers' APIs diverge (e.g. batch inserts).
- `initFct(conn)` *(optional async)* — setup before the run, e.g. `CREATE TABLE`.
- `end(conn)` *(optional async)* — teardown after the run.
- `requiresPool` *(boolean, optional)* — set to `true` to receive a pool instead of
  a single connection.
- `mariadbOnly` *(boolean, optional)* — skip the `mysql`/`mysql2` comparison for
  this benchmark (use when the workload depends on a MariaDB-specific feature).
