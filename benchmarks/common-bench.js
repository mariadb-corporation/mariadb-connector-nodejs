//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB Corporation Ab

import { Bench } from 'tinybench';
import chalk from 'chalk';

//************************************************
// LOAD DRIVERS
//************************************************
import * as mariadb from '../promise.js';
let mysql, mysql2;
try {
  mysql = await import('promise-mysql');
} catch (e) {}
try {
  mysql2 = await import('mysql2/promise');
} catch (e) {}

//************************************************
// COMMON CONFIGURATION.
//************************************************
import conf from '../test/conf.js';
import { displayReport } from './log-utility.js';
const config = Object.assign({}, conf.baseConfig);
let configWithCharset = null;
const minimumSamples = process.env.PERF_SAMPLES ? parseInt(process.env.PERF_SAMPLES) : 200;

//************************************************
// bench suite
//************************************************
const runBenchSuite = async (bench) => {
  const reportData = [];
  const sources = await loadsources(bench.requiresPool, bench.requireExecute, bench.mariadbOnly);
  if (bench.initFct) {
    const conn = await mariadb.createConnection(config);
    await bench.initFct(conn);
    conn.end();
  }

  console.log(
    chalk.yellow('##  ' + bench.title.replace('<', '').replace('>', '').replace('[', ' - ').replace(']', ''))
  );
  console.log('');

  // Warmup phase: run minimumSamples queries against mariadb before the timed run.
  // This warms the DB caches, the connection state and V8's JIT before any task is timed.
  // Same purpose as the explicit 'warmup' task we had with benchmark.js — it's not just
  // for the mariadb numbers, the other drivers benefit from a hot process too.
  for (let i = 0; i < minimumSamples; i++) {
    await bench.benchFct(sources.mariadb, 'mariadb');
  }

  // tinybench: a task runs until BOTH `iterations` and `time` minimums are reached.
  // We want each task to take a meaningful amount of wall-clock time, not just N iterations.
  const suite = new Bench({
    iterations: minimumSamples,
    time: 2000 // ms — keeps each task running at least 2 s for stable measurements
  });

  for (const [type, conn] of Object.entries(sources)) {
    suite.add(type, bench.benchFct.bind(null, conn, type));
  }

  await suite.run();

  // close connections after the run completes
  await Promise.all(Object.values(sources).map((conn) => conn.end()));

  for (const task of suite.tasks) {
    if (!task.result || task.result.error) continue;
    reportData.push({
      type: task.name,
      iteration: task.result.throughput.mean, // ops per second
      variation: task.result.throughput.rme // relative margin of error (%)
    });
  }

  displayReport(reportData, bench.title, bench.displaySql);

  if (bench.end) {
    const conn = await mariadb.createConnection(config);
    await bench.end(conn);
    conn.end();
  }
};

//************************************************
// Load connections / pools
//************************************************
const loadsources = async (requiresPool, requireExecute, mariadbOnly) => {
  const sources = {};
  const mariadbConn = await mariadb.createConnection(Object.assign({}, config));
  if (!configWithCharset && mariadbConn.info.collation) {
    const collation = mariadbConn.info.collation.name;
    configWithCharset = Object.assign({}, conf.baseConfig, { charset: collation });
    console.log(configWithCharset);
  }

  if (requiresPool == undefined || requiresPool === false) {
    sources['mariadb'] = mariadbConn;
    if (mysql) {
      if (!mariadbOnly && (requireExecute == undefined || requireExecute === false)) {
        sources['mysql'] = await mysql.createConnection(Object.assign({}, configWithCharset));
      }
    }
    if (mysql2 && !mariadbOnly) {
      sources['mysql2'] = await mysql2.createConnection(Object.assign({}, configWithCharset));
    }
  } else {
    await mariadbConn.end();
    sources['mariadb'] = await mariadb.createPool(Object.assign({ connectionLimit: 1 }, configWithCharset));
    if (!mariadbOnly && mysql) {
      sources['mysql'] = await mysql.createPool(Object.assign({ connectionLimit: 1 }, configWithCharset));
    }
    if (!mariadbOnly && mysql2) {
      sources['mysql2'] = await mysql2.createPool(Object.assign({ connectionLimit: 1 }, configWithCharset));
    }
  }

  if (!mariadbOnly && mysql2) {
    // specific to mysql2:
    // mysql2 use a metadata client parser, filling it like it would be in normal use
    const mysql2Source = sources['mysql2'];
    const wait = [];
    for (let i = 0; i < 15000; i++) {
      wait.push(mysql2Source.query("SELECT 1, 'b', ?", [i]));
    }
    await Promise.all(wait);
  }

  return sources;
};

export default runBenchSuite;
