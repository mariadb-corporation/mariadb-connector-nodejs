"use strict";

const base = require("../base.js");
const expect = require("chai").expect;
const Collations = require("../../lib/const/collations.js");
const Conf = require("../conf");
const Connection = require("../../lib/connection");
const ConnOptions = require("../../lib/config/connection-options");
const basePromise = require("../../promise");

describe("cluster", () => {
  it("missing pattern", function(done) {
    const poolCluster = basePromise.createPoolCluster();
    poolCluster
      .getConnection()
      .then(() => {
        done(new Error("must have thrown an error !"));
      })
      .catch(err => {
        expect(err.message).to.equal(
          "pattern parameter in Cluster.getConnection(pattern, selector) is mandatory"
        );
        done();
      });
  });

  it("no pattern match", function(done) {
    const poolCluster = basePromise.createPoolCluster();
    poolCluster
      .getConnection("M*")
      .then(() => {
        done(new Error("must have thrown an error !"));
      })
      .catch(err => {
        expect(err.message).to.have.string("No node found for pattern 'M*'");
        done();
      });
  });

  it("end no configuration", function(done) {
    const poolCluster = basePromise.createPoolCluster();
    poolCluster
      .end()
      .then(() => {
        done();
      })
      .catch(done);
  });

  it("select good pool", function(done) {
    const poolCluster = basePromise.createPoolCluster();

    const connOption1 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node1'",
      connectionLimit: 1
    });
    const connOption2 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node2'",
      connectionLimit: 1
    });

    poolCluster.add("node1", connOption1);
    poolCluster.add("node2", connOption2);
    getConnectionAndCheck(poolCluster, /^node[01]$/)
      .then(res => {
        expect(res).to.equal("node1");
        done();
      })
      .catch(done)
      .finally(() => {
        poolCluster.end();
      });
  });

  it("test wrong selector", function(done) {
    const poolCluster = basePromise.createPoolCluster({ defaultSelector: "WRONG" });

    const connOption1 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node1'",
      connectionLimit: 1
    });
    const connOption2 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node2'",
      connectionLimit: 1
    });
    const connOption3 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node3'",
      connectionLimit: 1
    });

    poolCluster.add("node1", connOption1);
    poolCluster.add("node2", connOption2);
    poolCluster.add("node3", connOption3);

    poolCluster
      .getConnection(/^node*/)
      .then(() => {
        done(new Error("must have thrown an error"));
      })
      .catch(err => {
        expect(err.message).to.equal(
          "Wrong selector value 'WRONG'. Possible values are 'RR','RANDOM' or 'ORDER'"
        );
        done();
      })
      .finally(() => {
        poolCluster.end();
      });
  });

  it("select round-robin pools", function(done) {
    const poolCluster = basePromise.createPoolCluster();

    const connOption1 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node1'",
      connectionLimit: 1
    });
    const connOption2 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node2'",
      connectionLimit: 1
    });
    const connOption3 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node3'",
      connectionLimit: 1
    });

    poolCluster.add("node1", connOption1);
    poolCluster.add("node2", connOption2);
    poolCluster.add("node3", connOption3);

    const promises = [];
    for (let i = 0; i < 60; i++) {
      promises.push(getConnectionAndCheck(poolCluster, /^node*/));
    }
    Promise.all(promises)
      .then(results => {
        const nodes = {};
        results.forEach(res => {
          if (nodes[res]) {
            nodes[res]++;
          } else {
            nodes[res] = 1;
          }
        });
        expect(nodes["node1"]).to.equal(20);
        expect(nodes["node2"]).to.equal(20);
        expect(nodes["node3"]).to.equal(20);
        done();
      })
      .catch(done)
      .finally(() => {
        poolCluster.end();
      });
  });

  it("select ordered pools", function(done) {
    const poolCluster = basePromise.createPoolCluster({ defaultSelector: "ORDER" });

    const connOption1 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node1'",
      connectionLimit: 1
    });
    const connOption2 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node2'",
      connectionLimit: 1
    });
    const connOption3 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node3'",
      connectionLimit: 1
    });

    poolCluster.add("node1", connOption1);
    poolCluster.add("node2", connOption2);
    poolCluster.add("node3", connOption3);

    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(getConnectionAndCheck(poolCluster, /^node*/));
    }
    Promise.all(promises)
      .then(results => {
        const nodes = {};
        results.forEach(res => {
          if (nodes[res]) {
            nodes[res]++;
          } else {
            nodes[res] = 1;
          }
        });
        expect(nodes["node1"]).to.equal(20);
        expect(nodes["node2"]).to.be.undefined;
        expect(nodes["node3"]).to.be.undefined;
        done();
      })
      .catch(done)
      .finally(() => {
        poolCluster.end();
      });
  });

  const getConnectionAndCheck = (cluster, pattern) => {
    return cluster.getConnection(pattern).then(conn => {
      return conn.query("SELECT @node").then(row => {
        conn.end();
        return row[0]["@node"];
      });
    });
  };

  it("select random pools", function(done) {
    const poolCluster = basePromise.createPoolCluster({ defaultSelector: "RANDOM" });

    const connOption1 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node1'",
      connectionLimit: 1
    });
    const connOption2 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node2'",
      connectionLimit: 1
    });
    const connOption3 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node3'",
      connectionLimit: 1
    });

    poolCluster.add("node1", connOption1);
    poolCluster.add("node2", connOption2);
    poolCluster.add("node3", connOption3);

    const promises = [];
    for (let i = 0; i < 60; i++) {
      promises.push(getConnectionAndCheck(poolCluster, /^node*/));
    }
    Promise.all(promises)
      .then(results => {
        const nodes = {};
        results.forEach(res => {
          if (nodes[res]) {
            nodes[res]++;
          } else {
            nodes[res] = 1;
          }
        });
        expect(nodes["node1"]).to.be.below(40);
        expect(nodes["node1"]).to.be.at.least(5);
        expect(nodes["node2"]).to.be.below(40);
        expect(nodes["node2"]).to.be.at.least(5);
        expect(nodes["node3"]).to.be.below(40);
        expect(nodes["node3"]).to.be.at.least(5);
        done();
      })
      .catch(done)
      .finally(() => {
        poolCluster.end();
      });
  });

  it("ensure selector filter", function(done) {
    const poolCluster = basePromise.createPoolCluster();

    const connOption1 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node1'",
      connectionLimit: 1
    });
    const connOption2 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node2'",
      connectionLimit: 1
    });
    const connOption3 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node3'",
      connectionLimit: 1
    });

    poolCluster.add("node1", connOption1);
    poolCluster.add("node2", connOption2);
    poolCluster.add("node3", connOption3);

    const promises = [];
    for (let i = 0; i < 60; i++) {
      promises.push(getConnectionAndCheck(poolCluster, /^node[12]/));
    }
    Promise.all(promises)
      .then(results => {
        const nodes = {};
        results.forEach(res => {
          if (nodes[res]) {
            nodes[res]++;
          } else {
            nodes[res] = 1;
          }
        });
        expect(nodes["node1"]).to.equal(30);
        expect(nodes["node2"]).to.equal(30);
        expect(nodes["node3"]).to.be.undefined;
        done();
      })
      .catch(done)
      .finally(() => {
        poolCluster.end();
      });
  });

  it("won't use bad host pools", function(done) {
    const poolCluster = basePromise.createPoolCluster();

    const connOption1 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node1'",
      connectionLimit: 1
    });
    const connOption2 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node2'",
      connectionLimit: 1
    });
    const connOption3 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node3'",
      user: "wrong_user",
      connectTimeout: 100,
      acquireTimeout: 200,
      connectionLimit: 1
    });

    poolCluster.add("node1", connOption1);
    poolCluster.add("node2", connOption2);
    poolCluster.add("node3", connOption3);

    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(getConnectionAndCheck(poolCluster, /^node*/));
    }
    Promise.all(promises)
      .then(results => {
        const nodes = {};
        results.forEach(res => {
          if (nodes[res]) {
            nodes[res]++;
          } else {
            nodes[res] = 1;
          }
        });

        expect(nodes["node1"]).to.equal(10);
        expect(nodes["node2"]).to.equal(10);
        expect(nodes["node3"]).to.be.undefined;

        const nodesConf = poolCluster.__tests.getNodes();
        expect(Object.keys(nodesConf)).to.have.length(2);
        poolCluster.end();
        done();
      })
      .catch(err => {
        poolCluster.end();
        done(err);
      });
  });

  it("won't use bad host pools with rejection", function(done) {
    this.timeout(20000);
    const poolCluster = basePromise.createPoolCluster({ canRetry: false });

    const connOption1 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node1'",
      connectionLimit: 1
    });
    const connOption2 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node2'",
      connectionLimit: 1
    });
    const connOption3 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node3'",
      user: "wrong_user",
      connectTimeout: 100,
      acquireTimeout: 200,
      connectionLimit: 1
    });

    poolCluster.add("node1", connOption1);
    poolCluster.add("node2", connOption2);
    poolCluster.add("node3", connOption3);

    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(getConnectionAndCheck(poolCluster, /^node*/));
    }
    Promise.all(promises.map(p => p.catch(e => e))).then(results => {
      const nodes = {};
      results.forEach(res => {
        if (res instanceof Error) {
          res = "error";
        }

        if (nodes[res]) {
          nodes[res]++;
        } else {
          nodes[res] = 1;
        }
      });

      expect(nodes["node1"]).to.equal(4);
      expect(nodes["node2"]).to.equal(3);
      expect(nodes["error"]).to.equal(3);

      console.log("ending");

      poolCluster
        .end()
        .then(() => {
          done();
        })
        .catch(done);
    });
  });
});
