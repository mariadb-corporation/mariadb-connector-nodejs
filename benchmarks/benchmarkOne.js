var fs = require('fs');
var Bench = require('./common_benchmarks');
var bench;

var run = function() {
  bench.suite.run();
};

bench = new Bench(run);

var launchBenchs = function(path) {
  var test = 'bench_select_one_user.js';
  var m = require(path + '/' + test);
  bench.initFcts.push(m.initFct);
  bench.add(m.title, m.displaySql, m.benchFct, m.onComplet);
};

fs.access('./benchs', function(err) {
  if (err) {
    fs.access('./benchmarks/benchs', function(err) {
      launchBenchs('./benchmarks/benchs');
    });
  } else {
    launchBenchs('./benchs');
  }
});
