var Benchmark = require('benchmark');
var conf = require('../test/conf');

var colors = require('colors');
var mariadb = require('../index.js');
var mysql = require('mysql');
var mysql2 = require('mysql2');
var mariasqlC;
try {
  mariasqlC = require('mariasql');
} catch (err) {
  //mariasql not mandatory in dev to avoid having python, compiling ...
}

function Bench(callback) {
  var dbReady = 0;
  this.reportData = {};

  var ready = function(name) {
    console.log('driver for ' + name + ' connected');
    dbReady++;
    if (dbReady === (mariasqlC ? 4 : 3)) {
      console.log('run bench');
      callback();
    }
  };

  var config = conf.baseConfig;
  config.charsetNumber=224;
  this.CONN = {};

  this.CONN['MYSQL'] = { drv: mysql.createConnection(config), desc: 'mysql' };
  this.CONN.MYSQL.drv.connect(function() {
    ready('mysql');
  });

  this.CONN['MYSQL2'] = {
    drv: mysql2.createConnection(config),
    desc: 'mysql2'
  };

  this.CONN.MYSQL2.drv.connect(function() {
    ready('mysql2');
  });

  this.CONN['MARIADB'] = {
    drv: mariadb.createConnection(config),
    desc: 'mariadb'
  };
  this.CONN.MARIADB.drv.connect(function() {
    ready('mariadb');
  });

  if (mariasqlC) {
    var configC = Object.assign({}, common.config);
    configC.charset = undefined;

    this.CONN['MARIASQLC'] = {
      drv: new mariasqlC(configC),
      desc: 'mariasqlC'
    };
    this.CONN.MARIASQLC.drv.connect(function() {
      ready('mariasqlC');
    });
  }

  this.initFcts = [];
  this.queue = true;
  this.async = true;
  this.minSamples = 200;
  var bench = this;
  this.suite = new Benchmark.Suite('foo', {
    // called when the suite starts running
    onStart: function() {
      for (var i = 0; i < bench.initFcts.length; i++) {
        if (bench.initFcts[i]) {
          bench.initFcts[i].call(this, bench.CONN.MYSQL.drv);
        }
      }
    },

    // called between running benchmarks
    onCycle: function(event) {
      //to avoid mysql2 taking all the server memory
      mysql2.clearParserCache();

      console.log(event.target.toString());
      var drvType = event.target.options.drvType;
      var benchTitle =
        event.target.options.benchTitle + ' ( sql: ' + event.target.options.displaySql + ' )';
      var iteration = 1 / event.target.times.period;
      var variation = event.target.stats.rme;

      if (!bench.reportData[benchTitle]) {
        bench.reportData[benchTitle] = [];
      }
      if (drvType !== 'warmup') {
        bench.reportData[benchTitle].push({
          drvType: drvType,
          iteration: iteration,
          variation: variation
        });
      }
    },
    // called when the suite completes running
    onComplete: function() {
      bench.end(bench);
    }
  });
}

Bench.prototype.end = function(bench) {
  this.CONN.MARIADB.drv.end();
  this.CONN.MYSQL.drv.end();
  this.CONN.MYSQL2.drv.end();

  if (mariasqlC) {
    this.CONN.MARIASQLC.drv.end();
  }
  bench.displayReport();
};

Bench.prototype.displayReport = function() {
  const simpleFormat = new Intl.NumberFormat('en-EN', {
    maximumFractionDigits: 1
  });
  const simpleFormatPerc = new Intl.NumberFormat('en-EN', {
    style: 'percent',
    maximumFractionDigits: 1
  });

  console.log('');
  console.log('');
  console.log('--- BENCHMARK RESULTS ---'.yellow);
  console.log(
    '/* travis bench are not to take in account, because VM might run some other testing script that can change results */'
      .gray
  );

  var keys = Object.keys(this.reportData);
  for (var i = 0; i < keys.length; i++) {
    var base = 0;
    var best = 0;
    var data = this.reportData[keys[i]];

    for (var j = 0; j < data.length; j++) {
      var o = data[j];
      if (o.drvType === (mariasqlC ? 'mariasqlC' : 'mysql')) {
        base = o.iteration;
      }
      if (o.iteration > best) best = o.iteration;
    }

    //display results
    console.log('');
    console.log('bench : ' + keys[i]);

    for (var j = 0; j < data.length; j++) {
      var o = data[j];
      var val = 100 * (o.iteration - base) / base;
      var perc = simpleFormat.format(val);
      var tt =
        '   ' +
        this.fill(o.drvType, 10) +
        ' : ' +
        this.fill(simpleFormat.format(o.iteration), 8, false) +
        ' ops/s  ' +
        //'±' +this.fill(simpleFormat.format(o.variation), 6, false) + '%' +
        (o.iteration === base
          ? ''
          : ' ( ' + this.fill((val > 0 ? '+' : '') + perc, 6, false) + '% )');
      if (o.drvType === 'mariadb') {
        if (o.iteration < best) {
          console.log(tt.red);
        } else {
          console.log(tt.green);
        }
      } else {
        console.log(tt);
      }
    }
  }
};

Bench.prototype.fill = function(val, length, right) {
  if (right) {
    while (val.length < length) {
      val += ' ';
    }
  } else {
    while (val.length < length) {
      val = ' ' + val;
    }
  }
  return val;
};

Bench.prototype.add = function(title, displaySql, fct, onComplete, conn) {
  var self = this;

  if (conn) {
    this.suite.add({
      name: title + ' - ' + conn.desc,
      fn: function(deferred) {
        fct.call(self, conn.drv, deferred);
      },
      onComplete: function() {
        if (onComplete) onComplete.call(self, self.CONN.MARIADB.drv);
      },
      async: this.async,
      queued: this.queue,
      minSamples: this.minSamples,
      defer: true,
      drvType: conn.desc,
      benchTitle: title,
      displaySql: displaySql
    });
  } else {
    this.suite.add({
      name: title + ' - warmup',
      fn: function(deferred) {
        fct.call(self, self.CONN.MYSQL.drv, deferred);
      },
      onComplete: function() {
        if (onComplete) onComplete.call(self, self.CONN.MYSQL.drv);
      },
      async: this.async,
      queued: this.queue,
      minSamples: this.minSamples,
      defer: true,
      drvType: 'warmup',
      benchTitle: title,
      displaySql: displaySql
    });

    this.suite.add({
      name: title + ' - ' + self.CONN.MYSQL.desc,
      fn: function(deferred) {
        fct.call(self, self.CONN.MYSQL.drv, deferred);
      },
      onComplete: function(defer) {
        if (onComplete) onComplete.call(self, self.CONN.MYSQL2.drv);
      },
      async: this.async,
      queued: this.queue,
      minSamples: this.minSamples,
      defer: true,
      drvType: self.CONN.MYSQL.desc,
      benchTitle: title,
      displaySql: displaySql
    });

    this.suite.add({
      name: title + ' - ' + self.CONN.MYSQL2.desc,
      fn: function(deferred) {
        fct.call(self, self.CONN.MYSQL2.drv, deferred);
      },
      onComplete: function(defer) {
        if (onComplete) onComplete.call(self, self.CONN.MARIADB.drv);
      },
      async: this.async,
      queued: this.queue,
      minSamples: this.minSamples,
      defer: true,
      drvType: self.CONN.MYSQL2.desc,
      benchTitle: title,
      displaySql: displaySql
    });

    this.suite.add({
      name: title + ' - ' + self.CONN.MARIADB.desc,
      fn: function(deferred) {
        fct.call(self, self.CONN.MARIADB.drv, deferred);
      },
      onComplete: function(defer) {
        if (onComplete) onComplete.call(self, self.CONN.MARIADB.drv);
      },
      async: this.async,
      queued: this.queue,
      minSamples: this.minSamples,
      defer: true,
      drvType: self.CONN.MARIADB.desc,
      benchTitle: title,
      displaySql: displaySql
    });

    if (mariasqlC) {
      this.suite.add({
        name: title + ' - ' + self.CONN.MARIASQLC.desc,
        fn: function(deferred) {
          fct.call(self, self.CONN.MARIASQLC.drv, deferred);
        },
        onComplete: function(defer) {
          if (onComplete) onComplete.call(self, self.CONN.MARIASQLC.drv);
        },
        async: this.async,
        queued: this.queue,
        minSamples: this.minSamples,
        defer: true,
        drvType: self.CONN.MARIASQLC.desc,
        benchTitle: title,
        displaySql: displaySql
      });
    }
  }
};

module.exports = Bench;
