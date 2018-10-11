"use strict";

const expect = require("chai").expect;
const Conf = require("../conf");
const basePromise = require("../../promise");
const baseCallback = require("../../callback");
const Proxy = require("../tools/proxy");

describe("cluster", () => {
  describe("promise", () => {
    it("no node", function(done) {
      const poolCluster = basePromise.createPoolCluster();
      poolCluster
        .getConnection()
        .then(() => {
          done(new Error("must have thrown an error !"));
        })
        .catch(err => {
          expect(err.message).to.equal(
            "No node have been added to cluster or nodes have been removed due to too much connection error"
          );
          done();
        });
    });

    it("no pattern match", function(done) {
      const poolCluster = basePromise.createPoolCluster();
      const connOption1 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node1'",
        connectionLimit: 1
      });

      poolCluster.add("node1", connOption1);
      poolCluster
        .getConnection(/^M*$/)
        .then(() => {
          done(new Error("must have thrown an error !"));
        })
        .catch(err => {
          expect(err.message).to.have.string("No node found for pattern '/^M*$/'");
          poolCluster.end();
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
      const poolCluster = get3NodeCluster();

      getConnectionAndCheck(poolCluster, /^node[01]$/)
        .then(res => {
          expect(res).to.equal("node1");
          poolCluster.end();
          done();
        })
        .catch(err => {
          poolCluster.end();
          done(err);
        });
    });

    it("test wrong selector", function(done) {
      const poolCluster = get3NodeCluster({ defaultSelector: "WRONG" });

      poolCluster
        .getConnection(/^node*/)
        .then(() => {
          poolCluster.end();
          done(new Error("must have thrown an error"));
        })
        .catch(err => {
          expect(err.message).to.equal(
            "Wrong selector value 'WRONG'. Possible values are 'RR','RANDOM' or 'ORDER'"
          );
          poolCluster.end();
          done();
        });
    });

    it("select round-robin pools", function(done) {
      const poolCluster = get3NodeCluster();

      testTimes(poolCluster)
        .then(nodes => {
          expect(nodes["node1"]).to.equal(3);
          expect(nodes["node2"]).to.equal(3);
          expect(nodes["node3"]).to.equal(3);
          poolCluster.end();
          done();
        })
        .catch(err => {
          poolCluster.end();
          done(err);
        });
    });

    it("remove/add nodes during use", function(done) {
      const poolCluster = get3NodeCluster();
      testTimes(poolCluster)
        .then(nodes => {
          expect(nodes["node1"]).to.equal(3);
          expect(nodes["node2"]).to.equal(3);
          expect(nodes["node3"]).to.equal(3);

          poolCluster.remove(/^node2/);
          poolCluster.add(
            "node4",
            Object.assign({}, Conf.baseConfig, {
              initSql: "set @node='node4'",
              connectionLimit: 1
            })
          );
          testTimes(poolCluster).then(nodes => {
            expect(nodes["node1"]).to.equal(3);
            expect(nodes["node2"]).to.be.undefined;
            expect(nodes["node3"]).to.equal(3);
            expect(nodes["node4"]).to.equal(3);
            poolCluster.end();
            done();
          });
        })
        .catch(err => {
          poolCluster.end();
          done(err);
        });
    });

    it("select ordered pools", function(done) {
      const poolCluster = get3NodeCluster({ defaultSelector: "ORDER" });

      testTimes(poolCluster)
        .then(nodes => {
          expect(nodes["node1"]).to.equal(9);
          expect(nodes["node2"]).to.be.undefined;
          expect(nodes["node3"]).to.be.undefined;
          poolCluster.end();
          done();
        })
        .catch(err => {
          poolCluster.end();
          done(err);
        });
    });

    it("select random pools", function(done) {
      const poolCluster = get3NodeCluster({ defaultSelector: "RANDOM" });

      testTimes(poolCluster, /^node*/, 60)
        .then(nodes => {
          expect(nodes["node1"]).to.be.below(40);
          expect(nodes["node1"]).to.be.at.least(5);
          expect(nodes["node2"]).to.be.below(40);
          expect(nodes["node2"]).to.be.at.least(5);
          expect(nodes["node3"]).to.be.below(40);
          expect(nodes["node3"]).to.be.at.least(5);
          poolCluster.end();
          done();
        })
        .catch(err => {
          poolCluster.end();
          done(err);
        });
    });

    it("ensure selector filter", function(done) {
      const poolCluster = get3NodeCluster();

      testTimes(poolCluster, /^node[12]/, 60)
        .then(nodes => {
          expect(nodes["node1"]).to.equal(30);
          expect(nodes["node2"]).to.equal(30);
          expect(nodes["node3"]).to.be.undefined;
          poolCluster.end();
          done();
        })
        .catch(err => {
          poolCluster.end();
          done(err);
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

      testTimes(poolCluster, /^node[12]*/, 20)
        .then(nodes => {
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

      testTimesWithError(poolCluster, /^node*/, 10).then(nodes => {
        expect(nodes["node1"]).to.equal(4);
        expect(nodes["node2"]).to.equal(3);
        expect(nodes["error"]).to.equal(3);

        poolCluster
          .end()
          .then(() => {
            done();
          })
          .catch(done);
      });
    });

    describe("cluster failover", () => {
      it("reusing node after timeout", function(done) {
        this.timeout(20000);
        const cl = get3NodeClusterWithProxy({ restoreNodeTimeout: 500 });
        const poolCluster = cl.cluster;
        const proxy = cl.proxy;

        testTimesWithError(poolCluster, /^node*/, 10).then(nodes => {
          expect(nodes["node1"]).to.equal(4);
          expect(nodes["node2"]).to.equal(3);
          expect(nodes["node3"]).to.equal(3);

          proxy.close();
          //wait for socket to end.
          setTimeout(() => {
            testTimesWithError(poolCluster, /^node*/, 10).then(nodes => {
              expect(nodes["node1"]).to.equal(5);
              expect(nodes["node2"]).to.be.undefined;
              expect(nodes["node3"]).to.equal(5);
              proxy.resume();
              setTimeout(() => {
                testTimesWithError(poolCluster, /^node*/, 10).then(nodes => {
                  expect(nodes["node1"]).to.equal(3);
                  expect(nodes["node2"]).to.equal(4);
                  expect(nodes["node3"]).to.equal(3);
                  poolCluster.end();
                  setTimeout(() => {
                    proxy.close();
                    done();
                  }, 100);
                });
              }, 550);
            });
          }, 500);
        });
      });
    });

    describe("filtered cluster", () => {
      it("get filtered", function(done) {
        const poolCluster = get3NodeCluster();
        const filteredCluster = poolCluster.of(/^node[12]/);
        const promises = [];
        for (let i = 0; i < 60; i++) {
          promises.push(getConnectionAndCheck(filteredCluster, /^node[12]/));
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
            poolCluster.end();
            done();
          })
          .catch(err => {
            poolCluster.end();
            done(err);
          });
      });

      it("query on filtered", function(done) {
        const poolCluster = get3NodeCluster();
        const filteredCluster = poolCluster.of(/^node[12]/);

        const promises = [];
        for (let i = 0; i < 60; i++) {
          promises.push(filteredCluster.query("SELECT @node"));
        }
        Promise.all(promises)
          .then(results => {
            const nodes = {};
            results.forEach(rows => {
              const res = rows[0]["@node"];
              if (nodes[res]) {
                nodes[res]++;
              } else {
                nodes[res] = 1;
              }
            });
            expect(nodes["node1"]).to.equal(30);
            expect(nodes["node2"]).to.equal(30);
            expect(nodes["node3"]).to.be.undefined;
            poolCluster.end();
            done();
          })
          .catch(err => {
            poolCluster.end();
            done(err);
          });
      });

      it("query on filtered ORDER", function(done) {
        const poolCluster = get3NodeCluster();
        const filteredCluster = poolCluster.of(/^node[12]/, "ORDER");

        const promises = [];
        for (let i = 0; i < 60; i++) {
          promises.push(filteredCluster.query("SELECT @node"));
        }
        Promise.all(promises)
          .then(results => {
            const nodes = {};
            results.forEach(rows => {
              const res = rows[0]["@node"];
              if (nodes[res]) {
                nodes[res]++;
              } else {
                nodes[res] = 1;
              }
            });
            expect(nodes["node1"]).to.equal(60);
            expect(nodes["node2"]).to.be.undefined;
            expect(nodes["node3"]).to.be.undefined;
            poolCluster.end();
            done();
          })
          .catch(err => {
            poolCluster.end();
            done(err);
          });
      });
    });
  });

  describe("callback", () => {
    it("no node", function(done) {
      const poolCluster = baseCallback.createPoolCluster();
      poolCluster.getConnection((err, conn) => {
        if (err) {
          expect(err.message).to.equal(
            "No node have been added to cluster or nodes have been removed due to too much connection error"
          );
          done();
        } else {
          done(new Error("must have thrown an error !"));
        }
      });
    });

    it("end with callback", function(done) {
      const poolCluster = baseCallback.createPoolCluster();
      poolCluster.end(err => {
        if (err) {
          done(err);
        } else done();
      });
    });

    it("end with bad callback parameter", function(done) {
      const poolCluster = baseCallback.createPoolCluster();
      try {
        poolCluster.end("wrong callback");
        done(new Error("must have thrown an error !"));
      } catch (err) {
        expect(err.message).to.equal("callback parameter must be a function");
        done();
      }
    });

    it("select good pool", function(done) {
      const poolCluster = get3NodeCallbackCluster();

      getConnectionAndCheckCallback(poolCluster, /^node[01]$/, (err, res) => {
        poolCluster.end();
        if (err) {
          done(err);
        } else {
          expect(res).to.equal("node1");
          done();
        }
      });
    });

    it("test wrong selector", function(done) {
      const poolCluster = get3NodeCallbackCluster({ defaultSelector: "WRONG" });

      poolCluster.getConnection(/^node*/, (err, conn) => {
        poolCluster.end();
        if (err) {
          expect(err.message).to.equal(
            "Wrong selector value 'WRONG'. Possible values are 'RR','RANDOM' or 'ORDER'"
          );
          done();
        } else {
          done(new Error("must have thrown an error"));
        }
      });
    });

    it("select round-robin pools", function(done) {
      const poolCluster = get3NodeCallbackCluster();

      testTimesCallback(poolCluster, (err, nodes) => {
        poolCluster.end();
        if (err) {
          done(err);
        } else {
          expect(nodes["node1"]).to.equal(3);
          expect(nodes["node2"]).to.equal(3);
          expect(nodes["node3"]).to.equal(3);
          done();
        }
      });
    });

    it("remove/add nodes during use", function(done) {
      const poolCluster = get3NodeCallbackCluster();
      testTimesCallback(poolCluster, (err, nodes) => {
        if (err) {
          poolCluster.end();
          done(err);
        } else {
          expect(nodes["node1"]).to.equal(3);
          expect(nodes["node2"]).to.equal(3);
          expect(nodes["node3"]).to.equal(3);

          poolCluster.remove(/^node2/);
          poolCluster.add(
            "node4",
            Object.assign({}, Conf.baseConfig, {
              initSql: "set @node='node4'",
              connectionLimit: 1
            })
          );
          testTimesCallback(poolCluster, (err, nodes) => {
            if (err) {
              poolCluster.end();
              done(err);
            } else {
              expect(nodes["node1"]).to.equal(3);
              expect(nodes["node2"]).to.be.undefined;
              expect(nodes["node3"]).to.equal(3);
              expect(nodes["node4"]).to.equal(3);
              poolCluster.end();
              done();
            }
          });
        }
      });
    });

    it("select ordered pools", function(done) {
      const poolCluster = get3NodeCallbackCluster({ defaultSelector: "ORDER" });

      testTimesCallback(poolCluster, (err, nodes) => {
        if (err) {
          poolCluster.end();
          done(err);
        } else {
          expect(nodes["node1"]).to.equal(9);
          expect(nodes["node2"]).to.be.undefined;
          expect(nodes["node3"]).to.be.undefined;
          poolCluster.end();
          done();
        }
      });
    });

    it("select random pools", function(done) {
      const poolCluster = get3NodeCallbackCluster({ defaultSelector: "RANDOM" });
      const cb = (err, nodes) => {
        poolCluster.end();
        if (err) {
          done(err);
        } else {
          expect(nodes["node1"]).to.be.below(40);
          expect(nodes["node1"]).to.be.at.least(5);
          expect(nodes["node2"]).to.be.below(40);
          expect(nodes["node2"]).to.be.at.least(5);
          expect(nodes["node3"]).to.be.below(40);
          expect(nodes["node3"]).to.be.at.least(5);
          done();
        }
      };

      testTimesCallback(poolCluster, cb, /^node*/, 60);
    });

    it("ensure selector filter", function(done) {
      const poolCluster = get3NodeCallbackCluster();
      const cb = (err, nodes) => {
        poolCluster.end();
        if (err) {
          done(err);
        } else {
          expect(nodes["node1"]).to.equal(30);
          expect(nodes["node2"]).to.equal(30);
          expect(nodes["node3"]).to.be.undefined;
          done();
        }
      };
      testTimesCallback(poolCluster, cb, /^node[12]/, 60);
    });

    it("won't use bad host pools", function(done) {
      const poolCluster = baseCallback.createPoolCluster();

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
      const cb = (err, nodes) => {
        if (err) {
          poolCluster.end();
          done(err);
        } else {
          expect(nodes["node1"]).to.equal(10);
          expect(nodes["node2"]).to.equal(10);
          expect(nodes["node3"]).to.be.undefined;

          const nodesConf = poolCluster.__tests.getNodes();
          expect(Object.keys(nodesConf)).to.have.length(2);
          poolCluster.end();
          done();
        }
      };
      testTimesCallback(poolCluster, cb, /^node[12]*/, 20);
    });

    it("won't use bad host pools with rejection", function(done) {
      this.timeout(20000);
      const poolCluster = baseCallback.createPoolCluster({ canRetry: false });

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

      const cb = (err, nodes) => {
        if (err) {
          poolCluster.end();
          done(err);
        } else {
          expect(nodes["node1"]).to.equal(4);
          expect(nodes["node2"]).to.equal(3);
          expect(nodes["error"]).to.equal(3);

          poolCluster.end(() => {
            done();
          });
        }
      };

      testTimesCallback(poolCluster, cb, /^node*/, 10);
    });

    describe("cluster failover", () => {
      it("reusing node after timeout", function(done) {
        this.timeout(20000);
        const cl = get3NodeClusterWithProxy({ restoreNodeTimeout: 500 });
        const poolCluster = cl.cluster;
        const proxy = cl.proxy;

        testTimesWithError(poolCluster, /^node*/, 10).then(nodes => {
          expect(nodes["node1"]).to.equal(4);
          expect(nodes["node2"]).to.equal(3);
          expect(nodes["node3"]).to.equal(3);

          proxy.close();
          //wait for socket to end.
          setTimeout(() => {
            testTimesWithError(poolCluster, /^node*/, 10).then(nodes => {
              expect(nodes["node1"]).to.equal(5);
              expect(nodes["node2"]).to.be.undefined;
              expect(nodes["node3"]).to.equal(5);
              proxy.resume();
              setTimeout(() => {
                testTimesWithError(poolCluster, /^node*/, 10).then(nodes => {
                  expect(nodes["node1"]).to.equal(3);
                  expect(nodes["node2"]).to.equal(4);
                  expect(nodes["node3"]).to.equal(3);
                  poolCluster.end();
                  setTimeout(() => {
                    proxy.close();
                    done();
                  }, 100);
                });
              }, 550);
            });
          }, 500);
        });
      });
    });

    describe("filtered cluster", () => {
      it("get filtered", function(done) {
        const poolCluster = get3NodeCluster();
        const filteredCluster = poolCluster.of(/^node[12]/);
        const promises = [];
        for (let i = 0; i < 60; i++) {
          promises.push(getConnectionAndCheck(filteredCluster, /^node[12]/));
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
            poolCluster.end();
            done();
          })
          .catch(err => {
            poolCluster.end();
            done(err);
          });
      });

      it("query on filtered", function(done) {
        const poolCluster = get3NodeCluster();
        const filteredCluster = poolCluster.of(/^node[12]/);

        const promises = [];
        for (let i = 0; i < 60; i++) {
          promises.push(filteredCluster.query("SELECT @node"));
        }
        Promise.all(promises)
          .then(results => {
            const nodes = {};
            results.forEach(rows => {
              const res = rows[0]["@node"];
              if (nodes[res]) {
                nodes[res]++;
              } else {
                nodes[res] = 1;
              }
            });
            expect(nodes["node1"]).to.equal(30);
            expect(nodes["node2"]).to.equal(30);
            expect(nodes["node3"]).to.be.undefined;
            poolCluster.end();
            done();
          })
          .catch(err => {
            poolCluster.end();
            done(err);
          });
      });

      it("query on filtered ORDER", function(done) {
        const poolCluster = get3NodeCluster();
        const filteredCluster = poolCluster.of(/^node[12]/, "ORDER");

        const promises = [];
        for (let i = 0; i < 60; i++) {
          promises.push(filteredCluster.query("SELECT @node"));
        }
        Promise.all(promises)
          .then(results => {
            const nodes = {};
            results.forEach(rows => {
              const res = rows[0]["@node"];
              if (nodes[res]) {
                nodes[res]++;
              } else {
                nodes[res] = 1;
              }
            });
            expect(nodes["node1"]).to.equal(60);
            expect(nodes["node2"]).to.be.undefined;
            expect(nodes["node3"]).to.be.undefined;
            poolCluster.end();
            done();
          })
          .catch(err => {
            poolCluster.end();
            done(err);
          });
      });
    });
  });

  const get3NodeCallbackCluster = opts => {
    const poolCluster = baseCallback.createPoolCluster(opts);

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
    return poolCluster;
  };

  const get3NodeCluster = opts => {
    const poolCluster = basePromise.createPoolCluster(opts);

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
    return poolCluster;
  };

  const get3NodeClusterWithProxy = opts => {
    const poolCluster = basePromise.createPoolCluster(opts);

    const connOption1 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node1'",
      connectionLimit: 1
    });
    const proxy = new Proxy({
      port: Conf.baseConfig.port,
      proxyPort: 4000,
      host: Conf.baseConfig.host
    });
    const connOption2 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node2'",
      connectionLimit: 1,
      host: "localhost",
      connectTimeout: 100,
      socketTimeout: 100,
      acquireTimeout: 200,
      port: 4000
    });

    const connOption3 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node3'",
      connectionLimit: 1
    });

    poolCluster.add("node1", connOption1);
    poolCluster.add("node2", connOption2);
    poolCluster.add("node3", connOption3);
    return { cluster: poolCluster, proxy: proxy };
  };

  const testTimes = (poolCluster, filter, number) => {
    const promises = [];
    for (let i = 0; i < (number ? number : 9); i++) {
      promises.push(getConnectionAndCheck(poolCluster, filter));
    }
    return Promise.all(promises)
      .then(results => {
        const nodes = {};
        results.forEach(res => {
          if (nodes[res]) {
            nodes[res]++;
          } else {
            nodes[res] = 1;
          }
        });
        return Promise.resolve(nodes);
      })
      .catch(err => {
        return Promise.reject(err);
      });
  };

  const testTimesWithError = (poolCluster, filter, number) => {
    const promises = [];
    for (let i = 0; i < (number ? number : 9); i++) {
      promises.push(getConnectionAndCheck(poolCluster, filter));
    }
    return Promise.all(promises.map(p => p.catch(e => e))).then(results => {
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
      return Promise.resolve(nodes);
    });
  };

  const testTimesCallback = (poolCluster, callback, filter, number) => {
    const results = [];
    let idx = 0;
    let cb = callback;
    for (let i = 0; i < (number ? number : 9); i++) {
      getConnectionAndCheckCallback(poolCluster, filter, (err, res) => {
        idx++;
        if (err) {
          if (results["error"]) {
            results["error"] = results["error"] + 1;
          } else {
            results["error"] = 1;
          }
        } else {
          if (results[res]) {
            results[res] = results[res] + 1;
          } else {
            results[res] = 1;
          }
        }
        if (idx === (number ? number : 9)) {
          cb(null, results);
          cb = null;
        }
      });
    }
  };
  const getConnectionAndCheck = (cluster, pattern) => {
    return cluster.getConnection(pattern).then(conn => {
      return conn
        .query("SELECT @node")
        .then(row => {
          conn.end();
          return row[0]["@node"];
        })
        .catch(err => {
          console.log(err);
          return err;
        });
    });
  };

  const getConnectionAndCheckCallback = (cluster, pattern, callback) => {
    cluster.getConnection(pattern, (err, conn) => {
      if (err) {
        callback(err);
      } else {
        conn.query("SELECT @node", (err, row) => {
          if (err) {
            console.log(err);
            callback(err);
          } else {
            conn.end();
            callback(null, row[0]["@node"]);
          }
        });
      }
    });
  };
});
