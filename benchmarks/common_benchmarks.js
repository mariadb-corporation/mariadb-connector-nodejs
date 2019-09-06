'use strict';

const Benchmark = require('benchmark');
const conf = require('../test/conf');

const colors = require('colors');
const mariadb = require('../promise');
const callbackMariadb = require('../callback');

let promiseMariasql, mariasql, promiseMysql, mysql, promiseMysql2, mysql2;

try {
  promiseMysql = require('promise-mysql');
} catch (err) {}

try {
  promiseMysql2 = require('mysql2/promise');
} catch (err) {}

try {
  promiseMariasql = require('mariasql-promise');
} catch (err) {}

try {
  mysql = require('mysql');
} catch (err) {}

try {
  mysql2 = require('mysql2');
} catch (err) {}

try {
  mariasql = require('mariasql');
} catch (err) {}

function Bench() {
  this.dbReady = 0;
  this.reportData = {};
  this.driverLen = 2;

  this.ready = 0;
  this.suiteReady = function() {
    this.ready++;
    if (this.ready === 2) {
      this.suite.run();
    }
  };

  const dbReady = function(name, driverLen) {
    bench.dbReady++;
    console.log('driver for ' + name + ' connected (' + bench.dbReady + '/' + driverLen + ')');
    if (bench.dbReady === driverLen) {
      bench.suiteReady();
    }
  };

  const config = conf.baseConfig;
  config.charsetNumber = 224;
  config.trace = false;
  //To benchmark same pool implementation than mysql/mysql2
  //standard implementation rollback/reset connection after use
  config.noControlAfterUse = true;

  const poolConfig = Object.assign({ connectionLimit: 4 }, config);
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
    connList['PROMISE_MYSQL'] = { desc: 'promise-mysql', promise: true };
    promiseMysql
      .createConnection(config)
      .then(conn => {
        promiseMysql
          .createPool(poolConfig)
          .then(pool => {
            connList['PROMISE_MYSQL'].drv = conn;
            connList['PROMISE_MYSQL'].pool = pool;
            dbReady('promise-mysql', this.driverLen);
          })
          .catch(err => {
            throw err;
          });
      })
      .catch(err => {
        throw err;
      });
  }

  if (mysql) {
    this.driverLen++;
    connList['MYSQL'] = { desc: 'mysql', promise: false };
    const conn = mysql.createConnection(config);
    conn.connect(err => {
      connList['MYSQL'].drv = conn;
      conn.on('error', err => console.log('driver mysql error :' + err));
      dbReady('mysql', this.driverLen);
    });
  }

  if (mysql2) {
    this.driverLen++;
    connList['MYSQL2'] = { desc: 'mysql2', promise: false };
    const conn = mysql2.createConnection(config);
    conn.connect(() => {
      connList['MYSQL2'].drv = conn;
      conn.on('error', err => console.log('driver mysql2 error :' + err));
      dbReady('mysql2', this.driverLen);
    });
  }

  if (promiseMysql2) {
    this.driverLen++;
    connList['PROMISE_MYSQL2'] = { desc: 'promise mysql2', promise: true };
    promiseMysql2
      .createConnection(config)
      .then(conn => {
        connList['PROMISE_MYSQL2'].drv = conn;
        conn.on('error', err => console.log('driver mysql2 promise error :' + err));
        connList['PROMISE_MYSQL2'].pool = promiseMysql2.createPool(poolConfig);
        dbReady('promise mysql2', this.driverLen);
      })
      .catch(err => {
        throw err;
      });
  }

  const mariaConn = callbackMariadb.createConnection(config);
  connList['MARIADB'] = { desc: 'mariadb', promise: true };
  mariaConn.connect(() => {
    connList['MARIADB'].drv = mariaConn;
    mariaConn.on('error', err => console.log('driver mariadb error :' + err));
    dbReady('mariadb', this.driverLen);
  });

  connList['PROMISE_MARIADB'] = { desc: 'promise mariadb', promise: false };
  mariadb
    .createConnection(config)
    .then(conn => {
      connList['PROMISE_MARIADB'].drv = conn;
      conn.on('error', err => console.log('driver mariadb promise error :' + err));
      connList['PROMISE_MARIADB'].pool = mariadb.createPool(poolConfig);
      dbReady('promise-mariadb', this.driverLen);
    })
    .catch(err => {
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

  if (promiseMariasql) {
    this.driverLen++;
    connList['PROMISE_MARIASQL'] = { desc: 'promise mariasql', promise: false };
    promiseMariasql
      .createConnection(config)
      .then(conn => {
        connList['PROMISE_MARIASQL'].drv = conn;
        dbReady('promise-mariasql', this.driverLen);
      })
      .catch(err => {
        throw err;
      });
  }

  if (mariasql) {
    this.driverLen++;
    connList['MARIASQL'] = { desc: 'mariasql', drv: conn, promise: true };
    const conn = mariasql.createConnection(config);
    conn.connect(err => {
      connList['MARIASQL'].drv = conn;
      dbReady('mariasql', this.driverLen);
    });
  }

  this.initFcts = [];
  //200 is a minimum to have benchmark average variation of 1%
  this.minSamples = 200;

  this.suite = new Benchmark.Suite('foo', {
    // called when the suite starts running
    onStart: function() {
      console.log('start : init test : ' + bench.initFcts.length);
      for (let i = 0; i < bench.initFcts.length; i++) {
        console.log('initializing test data ' + (i + 1) + '/' + bench.initFcts.length);
        if (bench.initFcts[i][0]) {
          bench.initFcts[i][0].call(
            this,
            bench.initFcts[i][1] ? bench.CONN.PROMISE_MARIADB.drv : bench.CONN.MARIADB.drv
          );
        }
      }
      this.currentNb = 0;
      console.log('initializing test data done');
    },

    // called between running benchmarks
    onCycle: function(event) {
      this.currentNb++;
      if (this.currentNb < this.length) pingAll(connList);
      //to avoid mysql2 taking all the server memory
      if (promiseMysql2 && promiseMysql2.clearParserCache) promiseMysql2.clearParserCache();
      if (mysql2 && mysql2.clearParserCache) mysql2.clearParserCache();
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
    onComplete: function() {
      console.log('completed');
      bench.end(bench);
    }
  });
}

Bench.prototype.end = function(bench) {
  console.log('ending connectors');
  this.endConnection(this.CONN.MARIADB);
  this.endConnection(this.CONN.PROMISE_MARIADB);
  if (mysql) this.endConnection(this.CONN.MYSQL);
  if (mysql2) this.endConnection(this.CONN.MYSQL2);
  if (mariasql) this.endConnection(this.CONN.MARIASQL);

  if (promiseMysql) this.endConnection(this.CONN.PROMISE_MYSQL);
  if (promiseMysql2) this.endConnection(this.CONN.PROMISE_MYSQL2);
  if (promiseMariasql) this.endConnection(this.CONN.PROMISE_MARIASQL);
  bench.displayReport();
};

Bench.prototype.endConnection = function(conn) {
  try {
    //using destroy, because MySQL driver fail when using end() for windows named pipe
    conn.drv.destroy();
  } catch (err) {
    console.log("ending error for connection '" + conn.desc + "'");
    console.log(err);
  }
  if (conn.pool) {
    if (conn.pool.on) conn.pool.on('error', err => {});
    conn.pool.end().catch(err => {
      console.log("ending error for pool '" + conn.desc + "'");
      console.log(err);
    });
  }
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
    '/* travis bench are not to take as is, because VM might run some other testing script that can change results */'
      .gray
  );

  const keys = Object.keys(this.reportData);
  for (let i = 0; i < keys.length; i++) {
    let base = 0;
    let best = 0;
    let data = this.reportData[keys[i]];

    for (let j = 0; j < data.length; j++) {
      let o = data[j];
      if (o.drvType === 'mysql' || o.drvType === 'promise-mysql') {
        base = o.iteration;
      }
      if (o.iteration > best) {
        best = o.iteration;
      }
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
        this.fill(simpleFormat.format(o.iteration), 8, false) +
        ' ops/s  ' +
        //'±' +this.fill(simpleFormat.format(o.variation), 6, false) + '%' +
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

Bench.prototype.add = function(title, displaySql, fct, onComplete, isPromise, usePool, conn) {
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
    if (isPromise) {
      addTest(self.CONN.PROMISE_MARIADB, 'warmup');
    } else {
      addTest(self.CONN.MARIADB, 'warmup');
    }

    if (!isPromise && mysql) {
      addTest(self.CONN.MYSQL, self.CONN.MYSQL.desc);
    }

    if (isPromise && promiseMysql) {
      addTest(self.CONN.PROMISE_MYSQL, self.CONN.PROMISE_MYSQL.desc);
    }

    if (!isPromise && mysql2) {
      addTest(self.CONN.MYSQL2, self.CONN.MYSQL2.desc);
    }

    if (isPromise && promiseMysql2) {
      addTest(self.CONN.PROMISE_MYSQL2, self.CONN.PROMISE_MYSQL2.desc);
    }

    if (isPromise) {
      addTest(self.CONN.PROMISE_MARIADB, self.CONN.PROMISE_MARIADB.desc);
    } else {
      addTest(self.CONN.MARIADB, self.CONN.MARIADB.desc);
    }

    if (isPromise && promiseMariasql) {
      addTest(self.CONN.PROMISE_MARIASQL, self.CONN.PROMISE_MARIASQL.desc);
    }

    if (!isPromise && mariasql) {
      addTest(self.CONN.MARIASQL, self.CONN.MARIASQL.desc);
    }
  }
};

const getAddTest = function(self, suite, fct, minSamples, title, displaySql, onComplete, usePool) {
  return function(conn, name) {
    suite.add({
      name: title + ' - ' + name,
      fn: function(deferred) {
        fct.call(self, usePool ? conn.pool : conn.drv, deferred, conn);
      },
      onComplete: () => {
        if (onComplete) onComplete.call(self, usePool ? conn.pool : conn.drv);
      },
      minSamples: minSamples,
      defer: true,
      drvType: name,
      benchTitle: title,
      displaySql: displaySql
    });
  };
};

const pingAll = function(conns) {
  let keys = Object.keys(conns);
  for (let k = 0; k < keys.length; ++k) {
    conns[keys[k]].drv.ping();
    if (conns[keys[k]].pool) {
      for (let i = 0; i < 4; i++) {
        conns[keys[k]].pool.getConnection().then(conn => {
          conn
            .ping()
            .then(() => {
              conn.release();
            })
            .catch(err => {
              conn.release();
            });
        });
      }
    }
  }
};

module.exports = Bench;
