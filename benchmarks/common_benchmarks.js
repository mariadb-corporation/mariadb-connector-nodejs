"use strict";

const Benchmark = require("benchmark");
const conf = require("../test/conf");

const colors = require("colors");
const mariadb = require("../index.js");

let mariasql, mysql, mysql2;

try {
  mysql = require("promise-mysql");
} catch (err) {}

try {
  mysql2 = require("mysql2/promise");
} catch (err) {}

try {
  mariasql = require("mariasql-promise");
} catch (err) {}

function Bench() {
  this.dbReady = 0;
  this.reportData = {};

  this.driverLen = 1;

  this.ready = 0;
  this.suiteReady = function() {
    this.ready++;
    if (this.ready === 2) {
      this.suite.run();
    }
  };

  const dbReady = function(name, driverLen) {
    bench.dbReady++;
    console.log("driver for " + name + " connected (" + bench.dbReady + "/" + driverLen + ")");
    if (bench.dbReady === driverLen) {
      bench.suiteReady();
    }
  };

  const config = conf.baseConfig;
  config.charsetNumber = 224;
  config.trace = false;
  // config.debug = true;
  // if (!mariasql && process.platform === "win32") {
  //   config.socketPath = "\\\\.\\pipe\\MySQL";
  // }

  console.log(config);

  this.CONN = {};
  const bench = this;
  if (mysql) {
    this.driverLen++;
    this.CONN["MYSQL"] = {
      desc: "mysql"
    };
    mysql
      .createConnection(config)
      .then(conn => {
        this.CONN["MYSQL"].drv = conn;
        // conn.on("error", err => console.log("driver mysql error :" + err));
        dbReady("mysql", this.driverLen);
      })
      .catch(err => {
        throw err;
      });
    // this.CONN.MYSQL.drv.on("error", err => console.log("driver mysql error :" + err));
  }

  if (mysql2) {
    this.driverLen++;
    this.CONN["MYSQL2"] = {
      desc: "mysql2"
    };
    mysql2
      .createConnection(config)
      .then(conn => {
        this.CONN["MYSQL2"].drv = conn;
        conn.on("error", err => console.log("driver mysql2 error :" + err));
        dbReady("mysql2", this.driverLen);
      })
      .catch(err => {
        throw err;
      });

    // this.CONN.MYSQL2.drv.on("error", err => console.log("driver mysql2 error :" + err));
  }

  this.CONN["MARIADB"] = {
    desc: "mariadb"
  };

  mariadb
    .createConnection(config)
    .then(conn => {
      this.CONN["MARIADB"].drv = conn;
      conn.on("error", err => console.log("driver mariadb error :" + err));
      dbReady("mariadb", this.driverLen);
    })
    .catch(err => {
      throw err;
    });

  if (mariasql) {
    this.driverLen++;
    const configC = Object.assign({}, config);
    configC.charset = "utf8mb4";
    configC.db = config.database;
    configC.metadata = true;
    if (config.socketPath != null) {
      configC.unixSocket = config.socketPath;
      configC.protocol = "socket";
    }

    this.CONN["MARIASQLC"] = {
      desc: "mariasql"
    };
    mysql
      .createConnection(config)
      .then(conn => {
        this.CONN["MARIASQLC"].drv = conn;
        // conn.on("error", err => console.log("driver mariasql error :" + err));
        dbReady("mariasql", this.driverLen);
      })
      .catch(err => {
        throw err;
      });
  }

  this.initFcts = [];
  //200 is a minimum to have benchmark average variation of 1%
  this.minSamples = 200;

  this.suite = new Benchmark.Suite("foo", {
    // called when the suite starts running
    onStart: function() {
      console.log("start : init test : " + bench.initFcts.length);
      for (let i = 0; i < bench.initFcts.length; i++) {
        console.log("initializing test data " + (i + 1) + "/" + bench.initFcts.length);
        if (bench.initFcts[i]) {
          bench.initFcts[i].call(this, bench.CONN.MARIADB.drv);
        }
      }
      console.log("initializing test data done");
    },

    // called between running benchmarks
    onCycle: function(event) {
      //to avoid mysql2 taking all the server memory
      if (mysql2 && mysql2.clearParserCache) mysql2.clearParserCache();
      console.log(event.target.toString());
      const drvType = event.target.options.drvType;
      const benchTitle =
        event.target.options.benchTitle + " ( sql: " + event.target.options.displaySql + " )";
      const iteration = 1 / event.target.times.period;
      const variation = event.target.stats.rme;

      if (!bench.reportData[benchTitle]) {
        bench.reportData[benchTitle] = [];
      }
      if (drvType !== "warmup") {
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
  console.log("ending connectors");
  this.endConnection(this.CONN.MARIADB);
  if (mysql) this.endConnection(this.CONN.MYSQL);
  if (mysql2) this.endConnection(this.CONN.MYSQL2);
  if (mariasql) this.endConnection(this.CONN.MARIASQLC);
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
};

Bench.prototype.displayReport = function() {
  const simpleFormat = new Intl.NumberFormat("en-EN", {
    maximumFractionDigits: 1
  });
  const simpleFormatPerc = new Intl.NumberFormat("en-EN", {
    style: "percent",
    maximumFractionDigits: 1
  });

  console.log("");
  console.log("");
  console.log("--- BENCHMARK RESULTS ---".yellow);
  console.log(
    "/* travis bench are not to take as is, because VM might run some other testing script that can change results */"
      .gray
  );

  const keys = Object.keys(this.reportData);
  for (let i = 0; i < keys.length; i++) {
    let base = 0;
    let best = 0;
    let data = this.reportData[keys[i]];

    for (let j = 0; j < data.length; j++) {
      let o = data[j];
      if (o.drvType === "mysql") {
        base = o.iteration;
      }
      if (o.iteration > best) {
        best = o.iteration;
      }
    }

    //display results
    console.log("");
    console.log("bench : " + keys[i]);
    for (let j = 0; j < data.length; j++) {
      let o = data[j];
      const val = 100 * (o.iteration - base) / base;
      const perc = simpleFormat.format(val);
      const tt =
        "   " +
        this.fill(o.drvType, 10) +
        " : " +
        this.fill(simpleFormat.format(o.iteration), 8, false) +
        " ops/s  " +
        //'±' +this.fill(simpleFormat.format(o.variation), 6, false) + '%' +
        (o.iteration === base
          ? ""
          : " ( " + this.fill((val > 0 ? "+" : "") + perc, 6, false) + "% )");
      if (o.drvType === "mariadb") {
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
      val += " ";
    }
  } else {
    while (val.length < length) {
      val = " " + val;
    }
  }
  return val;
};

Bench.prototype.add = function(title, displaySql, fct, onComplete, conn) {
  const self = this;

  if (conn) {
    this.suite.add({
      name: title + " - " + conn.desc,
      fn: function(deferred) {
        fct.call(self, conn.drv, deferred);
      },
      onComplete: () => {
        if (onComplete) onComplete.call(self, self.CONN.MARIADB.drv);
      },
      minSamples: this.minSamples,
      defer: true,
      drvType: conn.desc,
      benchTitle: title,
      displaySql: displaySql
    });
  } else {
    this.suite.add({
      name: title + " - warmup",
      fn: function(deferred) {
        fct.call(self, self.CONN.MARIADB.drv, deferred);
      },
      onComplete: () => {
        if (onComplete) onComplete.call(self, self.CONN.MARIADB.drv);
      },
      minSamples: this.minSamples,
      defer: true,
      drvType: "warmup",
      benchTitle: title,
      displaySql: displaySql
    });
    if (mysql) {
      this.suite.add({
        name: title + " - " + self.CONN.MYSQL.desc,
        fn: function(deferred) {
          fct.call(self, self.CONN.MYSQL.drv, deferred);
        },
        onComplete: () => {
          if (onComplete) onComplete.call(self, self.CONN.MYSQL.drv);
        },
        minSamples: this.minSamples,
        defer: true,
        drvType: self.CONN.MYSQL.desc,
        benchTitle: title,
        displaySql: displaySql
      });
    }
    if (mysql2) {
      this.suite.add({
        name: title + " - " + self.CONN.MYSQL2.desc,
        fn: function(deferred) {
          fct.call(self, self.CONN.MYSQL2.drv, deferred);
        },
        onComplete: () => {
          if (onComplete) onComplete.call(self, self.CONN.MYSQL2.drv);
        },
        minSamples: this.minSamples,
        defer: true,
        drvType: self.CONN.MYSQL2.desc,
        benchTitle: title,
        displaySql: displaySql
      });
    }

    this.suite.add({
      name: title + " - " + self.CONN.MARIADB.desc,
      fn: function(deferred) {
        fct.call(self, self.CONN.MARIADB.drv, deferred);
      },
      onComplete: () => {
        if (onComplete) onComplete.call(self, self.CONN.MARIADB.drv);
      },
      minSamples: this.minSamples,
      defer: true,
      drvType: self.CONN.MARIADB.desc,
      benchTitle: title,
      displaySql: displaySql
    });

    if (mariasql) {
      this.suite.add({
        name: title + " - " + self.CONN.MARIASQLC.desc,
        fn: function(deferred) {
          fct.call(self, self.CONN.MARIASQLC.drv, deferred);
        },
        onComplete: () => {
          if (onComplete) onComplete.call(self, self.CONN.MARIASQLC.drv);
        },
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
