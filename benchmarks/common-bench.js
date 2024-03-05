//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

const Benchmark = require('benchmark');
const chalk = require('chalk');

//************************************************
// LOAD DRIVERS
//************************************************
const mariadb = require('../promise');
let mysql, mysql2;
try {
  mysql = require('promise-mysql');
} catch (e) {}
try {
  mysql2 = require('mysql2/promise');
} catch (e) {}

//************************************************
// COMMON CONFIGURATION.
// Mysql and Mysql2 doesn't use server collation, but fixed collation UTF8_GENERAL_CI.
// setting it to default utf8mb4 collation, to be fair
//************************************************
const conf = require('../test/conf');
const logUtility = require('./log-utility');
const config = Object.assign({}, conf.baseConfig);

let configWithCharset = null;
const minimumSamples = process.env.PERF_SAMPLES ? parseInt(process.env.PERF_SAMPLES) : 200;

//************************************************
// bench suite
//************************************************
const createBenchSuite = async (bench) => {
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

  const suite = new Benchmark.Suite('test');
  suite.add('warmup', {
    defer: true,
    fn: bench.benchFct.bind(null, sources.mariadb, 'mariadb'),
    minSamples: minimumSamples
  });

  for (const [type, conn] of Object.entries(sources)) {
    suite.add({
      name: type,
      defer: true,
      fn: bench.benchFct.bind(null, conn, type),
      onComplete: conn.end.bind(conn),
      minSamples: minimumSamples
    });
  }

  suite.on('cycle', function (event) {
    //console.log(chalk.grey('    ' + String(event.target)));
    const type = event.target.name;
    const iteration = 1 / event.target.times.period;
    const variation = event.target.stats.rme;
    if (type !== 'warmup') {
      reportData.push({
        type: type,
        iteration: iteration,
        variation: variation
      });
    }
  });

  suite.on('complete', async function () {
    logUtility.displayReport(reportData, bench.title, bench.displaySql);
    if (bench.end) {
      const conn = await mariadb.createConnection(config);
      await bench.end(conn);
      conn.end();
    }
  });

  return suite;
};

//************************************************
// Load connections / pools
//************************************************
const loadsources = async (requiresPool, requireExecute, mariadbOnly) => {
  const sources = {};
  sources['mariadb'] = await mariadb.createConnection(Object.assign({}, config));
  if (!configWithCharset && sources['mariadb'].info.collation) {
    const collation = sources['mariadb'].info.collation.name;
    configWithCharset = Object.assign({}, conf.baseConfig, { charset: collation });
    console.log(configWithCharset);
  }

  if (requiresPool == undefined || requiresPool === false) {
    if (mysql) {
      if (!mariadbOnly && (requireExecute == undefined || requireExecute === false)) {
        sources['mysql'] = await mysql.createConnection(Object.assign({}, configWithCharset));
      }
    }
    if (mysql2 && !mariadbOnly) {
      sources['mysql2'] = await mysql2.createConnection(Object.assign({}, configWithCharset));
    }
  } else {
    if (!mariadbOnly && mysql) {
      sources['mysql'] = await mysql.createPool(Object.assign({ connectionLimit: 1 }, configWithCharset));
    }
    if (!mariadbOnly && mysql2) {
      sources['mysql2'] = mysql2.createPool(Object.assign({ connectionLimit: 1 }, configWithCharset));
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

module.exports = createBenchSuite;
