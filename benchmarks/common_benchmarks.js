'use strict';

const Benchmark = require('benchmark');
const conf = require('../test/conf');

const colors = require('colors');
const mariadb = require('../promise');
const callbackMariadb = require('../callback');
const callThread = 100;
let promiseMysql, promiseMysql2;
let connectionLimit = 10;

try {
  promiseMysql = require('promise-mysql');
} catch (err) {}

try {
  promiseMysql2 = require('mysql2/promise');
} catch (err) {}

function Bench() {
  this.dbReady = 0;
  this.reportData = {};
  this.driverLen = 1;

  this.ready = 0;
  this.suiteReady = function () {
    this.ready++;
    if (this.ready === 2) {
      this.suite.run();
    }
  };

  const dbReady = function (name, driverLen) {
    bench.dbReady++;
    console.log('driver for ' + name + ' connected (' + bench.dbReady + '/' + driverLen + ')');
    if (bench.dbReady === driverLen) {
      bench.suiteReady();
    }
  };

  const config = conf.baseConfig;
  config.charsetNumber = 45;
  config.trace = false;

  const poolConfig = Object.assign({ connectionLimit: connectionLimit }, config);
  // config.debug = true;
  // if (!mariasql && process.platform === "win32") {
  //   config.socketPath = "\\\\.\\pipe\\MySQL";
  // }

  console.log(config);

  this.CONN = {};
  const bench = this;
  const connList = this.CONN;

  if (promiseMysql) {
    this.driverLen++;
    connList['MYSQL'] = { desc: 'promise-mysql' };

    var proms = [];
    connList['MYSQL'].drv = [];
    for (let i = 0; i < connectionLimit; i++) {
      proms.push(
        promiseMysql.createConnection(Object.assign({}, config)).then((conn) => {
          connList['MYSQL'].drv.push(conn);
          return Promise.resolve();
        })
      );
    }
    proms.push(
      promiseMysql.createPool(poolConfig).then((pool) => {
        connList['MYSQL'].pool = pool;
        return Promise.resolve();
      })
    );

    Promise.all(proms)
      .then(() => {
        dbReady('promise-mysql', this.driverLen);
      })
      .catch((err) => {
        throw err;
      });
  }

  if (promiseMysql2) {
    this.driverLen++;
    connList['MYSQL2'] = { desc: 'mysql2' };

    var proms = [];
    connList['MYSQL2'].drv = [];
    for (let i = 0; i < connectionLimit; i++) {
      proms.push(
        promiseMysql2.createConnection(Object.assign({}, config)).then((conn) => {
          connList['MYSQL2'].drv.push(conn);
          return Promise.resolve();
        })
      );
    }
    connList['MYSQL2'].pool = promiseMysql2.createPool(poolConfig);

    Promise.all(proms)
      .then(() => {
        dbReady('promise mysql2', this.driverLen);
      })
      .catch((err) => {
        throw err;
      });
  }

  //To benchmark same things with mysql/mysql2, one options is changed compared to default values:
  // * checkDuplicate = false => normally, driver check there isn't some missing field if same identifier
  connList['MARIADB'] = { desc: 'mariadb' };

  var proms = [];
  connList['MARIADB'].drv = [];
  for (let i = 0; i < connectionLimit; i++) {
    proms.push(
      mariadb.createConnection(Object.assign({}, config)).then((conn) => {
        connList['MARIADB'].drv.push(conn);
        return Promise.resolve();
      })
    );
  }
  connList['MARIADB'].pool = mariadb.createPool(poolConfig);

  Promise.all(proms)
    .then(() => {
      dbReady('promise-mariadb', this.driverLen);
    })
    .catch((err) => {
      throw err;
    });

  const configC = Object.assign({}, config);
  configC.charset = 'utf8mb4';
  configC.db = config.database;
  configC.metadata = true;
  if (config.socketPath != null) {
    configC.unixSocket = config.socketPath;
    configC.protocol = 'socket';
  }

  this.initFcts = [];
  //200 is a minimum to have benchmark average variation of 1%
  this.minSamples = 200;

  this.suite = new Benchmark.Suite('foo', {
    // called when the suite starts running
    onStart: function () {
      console.log('start : init test : ' + bench.initFcts.length);
      for (let i = 0; i < bench.initFcts.length; i++) {
        console.log('initializing test data ' + (i + 1) + '/' + bench.initFcts.length);
        if (bench.initFcts[i][0]) {
          bench.initFcts[i][0].call(this, bench.CONN.MARIADB.drv[0]);
        }
      }
      this.currentNb = 0;
      console.log('initializing test data done');
    },

    // called between running benchmarks
    onCycle: function (event) {
      this.currentNb++;
      if (this.currentNb < this.length) pingAll(connList);
      //to avoid mysql2 taking all the server memory
      if (promiseMysql2 && promiseMysql2.clearParserCache) promiseMysql2.clearParserCache();
      console.log(event.target.toString());
      const drvType = event.target.options.drvType;
      const benchTitle =
        event.target.options.benchTitle + ' ( sql: ' + event.target.options.displaySql + ' )';
      const iteration = 1 / event.target.times.period;
      const variation = event.target.stats.rme;

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
    onComplete: function () {
      console.log('completed');
      bench.end(bench);
    }
  });
}

Bench.prototype.end = function (bench) {
  console.log('ending connectors');
  this.endConnection(this.CONN.MARIADB);

  if (promiseMysql) this.endConnection(this.CONN.MYSQL);
  if (promiseMysql2) this.endConnection(this.CONN.MYSQL2);
  bench.displayReport();
};

Bench.prototype.endConnection = function (conn) {
  try {
    //using destroy, because MySQL driver fail when using end() for windows named pipe
    for (let i = 0; i < connectionLimit; i++) {
      conn.drv[i].destroy();
    }
  } catch (err) {
    console.log("ending error for connection '" + conn.desc + "'");
    console.log(err);
  }
  if (conn.pool) {
    if (conn.pool.on) conn.pool.on('error', (err) => {});
    conn.pool.end().catch((err) => {
      console.log("ending error for pool '" + conn.desc + "'");
      console.log(err);
    });
  }
};

Bench.prototype.displayReport = function () {
  const simpleFormat = new Intl.NumberFormat('en-EN', {
    maximumFractionDigits: 1
  });
  const simpleFormatPerc = new Intl.NumberFormat('en-EN', {
    maximumFractionDigits: 2
  });

  console.log('');
  console.log('');
  console.log('--- BENCHMARK RESULTS ---'.yellow);
  console.log(
    '/* travis bench are not to take as is, because VM might run some other testing script that can change results */'
      .gray
  );

  const keys = Object.keys(this.reportData);
  for (let i = 0; i < keys.length; i++) {
    let base = 0;
    let base2 = 0;
    let best = 0;
    let data = this.reportData[keys[i]];

    for (let j = 0; j < data.length; j++) {
      let o = data[j];
      if (o.drvType === 'promise-mysql') {
        base = o.iteration;
      }
      if (o.drvType === 'promise mysql2') {
        base2 = o.iteration;
      }
      if (o.iteration > best) {
        best = o.iteration;
      }
    }
    if (base === 0) {
      base = base2;
    }
    //display results
    console.log('');
    console.log('bench : ' + keys[i]);
    for (let j = 0; j < data.length; j++) {
      let o = data[j];
      const val = (100 * (o.iteration - base)) / base;
      const perc = simpleFormat.format(val);
      const tt =
        '   ' +
        this.fill(o.drvType, 16) +
        ' : ' +
        this.fill(simpleFormat.format(o.iteration * connectionLimit), 8, false) +
        ' ops/s ' +
        '±' +
        this.fill(simpleFormatPerc.format(o.variation), 6, false) +
        '%' +
        (o.iteration === base
          ? ''
          : ' ( ' + this.fill((val > 0 ? '+' : '') + perc, 6, false) + '% )');
      if (o.drvType.includes('mariadb')) {
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

Bench.prototype.fill = function (val, length, right) {
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

Bench.prototype.add = function (title, displaySql, fct, onComplete, usePool, requireExecute, conn) {
  const self = this;
  const addTest = getAddTest(
    self,
    this.suite,
    fct,
    this.minSamples,
    title,
    displaySql,
    onComplete,
    usePool
  );

  if (conn) {
    addTest(conn, conn.desc);
  } else {
    addTest(self.CONN.MARIADB, 'warmup');

    if (!requireExecute && promiseMysql) {
      addTest(self.CONN.MYSQL, self.CONN.MYSQL.desc);
    }

    if (promiseMysql2) {
      addTest(self.CONN.MYSQL2, self.CONN.MYSQL2.desc);
    }

    addTest(self.CONN.MARIADB, self.CONN.MARIADB.desc);
  }
};

const getAddTest = function (self, suite, fct, minSamples, title, displaySql, onComplete, usePool) {
  return function (conn, name) {
    suite.add({
      name: connectionLimit + ' simultaneous call - ' + title + ' - ' + name,
      fn: function (deferred) {
        let nb = 0;
        for (let i = 0; i < connectionLimit; i++) {
          fct.call(
            self,
            usePool ? conn.pool : conn.drv[i],
            () => {
              nb++;
              if (nb === connectionLimit) deferred.resolve();
            },
            conn
          );
        }
      },
      onComplete: () => {
        if (onComplete) onComplete.call(self, usePool ? conn.pool : conn.drv[0]);
      },
      minSamples: minSamples,
      defer: true,
      drvType: name,
      benchTitle: title,
      displaySql: displaySql
    });
  };
};

const pingAll = function (conns) {
  let keys = Object.keys(conns);
  for (let k = 0; k < keys.length; ++k) {
    for (let i = 0; i < connectionLimit; ++i) {
      conns[keys[k]].drv[i].ping();
    }
    if (conns[keys[k]].pool) {
      for (let i = 0; i < connectionLimit; i++) {
        const pool = conns[keys[k]].pool;
        pool.getConnection().then((conn) => {
          conn
            .ping()
            .then(() => {
              conn.release();
            })
            .catch((err) => {
              conn.release();
            });
        });
      }
    }
  }
};

module.exports = Bench;
