'use strict';

const fs = require('fs');
const Bench = require('./common_benchmarks');
let bench;

const launchBenchs = function (path) {
  bench = new Bench();

  const test = 'do.js';
  const m = require(path + '/' + test);
  bench.initFcts.push([m.initFct, m.promise]);
  bench.add(m.title, m.displaySql, m.benchFct, m.onComplete, m.pool, m.requireExecute); //, bench.CONN.MYSQL);

  bench.suiteReady();
};

fs.access('../benchs', function (err) {
  if (err) {
    fs.access('../benchmarks/benchs', function (err) {
      launchBenchs('../benchmarks/benchs');
    });
  } else {
    launchBenchs('../benchs');
  }
});
