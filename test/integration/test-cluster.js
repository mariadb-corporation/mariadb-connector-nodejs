'use strict';

const expect = require('chai').expect;
const Conf = require('../conf');
const basePromise = require('../../promise');
const baseCallback = require('../../callback');
const Proxy = require('../tools/proxy');
const base = require('../base.js');

const { assert } = require('chai');

describe('cluster', function () {
  before(async function () {
    if (process.env.SKYSQL || process.env.SKYSQL_HA) this.skip();
    await shareConn.query('DROP TABLE IF EXISTS clusterInsert');
    await shareConn.query('CREATE TABLE clusterInsert(id int, nam varchar(256))');
    await shareConn.query('FLUSH TABLES');
  });

  describe('promise', function () {
    beforeEach(async function () {
      await shareConn.query('TRUNCATE TABLE clusterInsert');
    });

    it('no node', function (done) {
      const poolCluster = basePromise.createPoolCluster();
      poolCluster
        .getConnection()
        .then(() => {
          done(new Error('must have thrown an error !'));
        })
        .catch((err) => {
          expect(err.message).to.equal(
            'No node have been added to cluster or nodes have been removed due to too much connection error'
          );
          done();
        });
    });

    it('no pattern match', function (done) {
      const poolCluster = basePromise.createPoolCluster();
      const connOption1 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node1'",
        connectionLimit: 1,
        resetAfterUse: false
      });

      poolCluster.add('node1', connOption1);
      poolCluster
        .getConnection(/^M*$/)
        .then(() => {
          poolCluster.end().then(() => {
            done(new Error('must have thrown an error !'));
          });
        })
        .catch((err) => {
          expect(err.message).to.have.string("No node found for pattern '/^M*$/'");
          poolCluster.end().then(() => {
            done();
          });
        });
    });

    it('default id', function (done) {
      const poolCluster = basePromise.createPoolCluster();
      const connOption1 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node1'",
        connectionLimit: 1,
        resetAfterUse: false
      });

      poolCluster.add(connOption1);
      poolCluster
        .getConnection('PoolNode-0')
        .then((conn) => {
          poolCluster.end().then(() => {
            conn.end();
            done();
          });
        })
        .catch(done);
    });

    it('pool full', function (done) {
      this.timeout(30000);
      const poolCluster = basePromise.createPoolCluster();
      const connOption1 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node1'",
        connectionLimit: 1,
        resetAfterUse: false,
        connectTimeout: 1000,
        acquireTimeout: 500
      });

      poolCluster.add(connOption1);
      poolCluster
        .getConnection('PoolNode-0')
        .then((conn) => {
          poolCluster
            .getConnection('PoolNode-0')
            .then(() => {
              poolCluster.end();
              done(new Error('must have thrown an error !'));
            })
            .catch((err) => {
              expect(err.message).to.have.string(
                "No Connection available for 'PoolNode-0'. Last connection error was: retrieve connection from pool timeout"
              );
              poolCluster
                .getConnection('PoolNode-0')
                .then(() => {
                  poolCluster.end();
                  done(new Error('must have thrown an error !'));
                })
                .catch((err) => {
                  expect(err.message).to.have.string(
                    'No node have been added to cluster or nodes have been removed due to too much connection error'
                  );
                  poolCluster
                    .getConnection('PoolNode-0')
                    .then(() => {
                      poolCluster.end();
                      done(new Error('must have thrown an error !'));
                    })
                    .catch((err) => {
                      expect(err.message).to.have.string(
                        'No node have been added to cluster or nodes have been removed due' +
                          ' to too much connection error'
                      );
                      conn.end();
                      poolCluster.end().then(() => {
                        done();
                      });
                    });
                });
            });
        })
        .catch(done);
    });

    it('cluster add error', function (done) {
      const poolCluster = basePromise.createPoolCluster();
      const connOption1 = Object.assign({}, Conf.baseConfig, {
        connectionLimit: 1
      });

      poolCluster.add('node1', connOption1);
      try {
        poolCluster.add('node1', connOption1);
        poolCluster.end().then(() => {
          return done(new Error('must have thrown an error'));
        });
      } catch (e) {
        assert.isTrue(e.message.includes("Node identifier 'node1' already exist"));
        poolCluster.end().then(() => {
          done();
        });
      }
    });

    it('end no configuration', function (done) {
      const poolCluster = basePromise.createPoolCluster();
      poolCluster
        .end()
        .then(() => {
          done();
        })
        .catch(done);
    });

    it('select good pool', function (done) {
      const poolCluster = get3NodeCluster();

      getConnectionAndCheck(poolCluster, /^node[01]$/)
        .then((res) => {
          expect(res).to.equal('node1');
          poolCluster.end().then(() => {
            done();
          });
        })
        .catch((err) => {
          poolCluster.end().then(() => {
            done(err);
          });
        });
    });

    it('test wrong selector', function (done) {
      const poolCluster = get3NodeCluster({ defaultSelector: 'WRONG' });

      poolCluster
        .getConnection(/^node*/)
        .then(() => {
          poolCluster.end().then(() => {
            done(new Error('must have thrown an error'));
          });
        })
        .catch((err) => {
          expect(err.message).to.equal(
            "Wrong selector value 'WRONG'. Possible values are 'RR','RANDOM' or 'ORDER'"
          );
          poolCluster.end().then(() => {
            done();
          });
        });
    });

    it('select round-robin pools', function (done) {
      const poolCluster = get3NodeCluster();

      testTimes(poolCluster)
        .then((nodes) => {
          expect(nodes['node1']).to.equal(3);
          expect(nodes['node2']).to.equal(3);
          expect(nodes['node3']).to.equal(3);
          poolCluster.end().then(() => {
            done();
          });
        })
        .catch((err) => {
          poolCluster.end().then(() => {
            done(err);
          });
        });
    });

    it('remove/add nodes during use', function (done) {
      const poolCluster = get3NodeCluster();
      testTimes(poolCluster)
        .then((nodes) => {
          expect(nodes['node1']).to.equal(3);
          expect(nodes['node2']).to.equal(3);
          expect(nodes['node3']).to.equal(3);

          poolCluster.remove(/^node2/);
          poolCluster.add(
            'node4',
            Object.assign({}, Conf.baseConfig, {
              initSql: "set @node='node4'",
              connectionLimit: 1,
              resetAfterUse: false
            })
          );
          testTimes(poolCluster).then((nodes) => {
            expect(nodes['node1']).to.equal(3);
            expect(nodes['node2']).to.be.undefined;
            expect(nodes['node3']).to.equal(3);
            expect(nodes['node4']).to.equal(3);
            poolCluster.end().then(() => {
              done();
            });
          });
        })
        .catch((err) => {
          poolCluster.end().then(() => {
            done(err);
          });
        });
    });

    it('select ordered pools', function (done) {
      const poolCluster = get3NodeCluster({ defaultSelector: 'ORDER' });

      testTimes(poolCluster)
        .then((nodes) => {
          expect(nodes['node1']).to.equal(9);
          expect(nodes['node2']).to.be.undefined;
          expect(nodes['node3']).to.be.undefined;
          poolCluster.end().then(() => {
            done();
          });
        })
        .catch((err) => {
          poolCluster.end().then(() => {
            done(err);
          });
        });
    });

    it('select random pools', function (done) {
      const poolCluster = get3NodeCluster({ defaultSelector: 'RANDOM' });

      testTimes(poolCluster, /^node*/, 60)
        .then((nodes) => {
          expect(nodes['node1']).to.be.below(40);
          expect(nodes['node1']).to.be.at.least(5);
          expect(nodes['node2']).to.be.below(40);
          expect(nodes['node2']).to.be.at.least(5);
          expect(nodes['node3']).to.be.below(40);
          expect(nodes['node3']).to.be.at.least(5);
          poolCluster.end().then(() => {
            done();
          });
        })
        .catch((err) => {
          poolCluster.end().then(() => {
            done(err);
          });
        });
    });

    it('ensure selector filter', function (done) {
      const poolCluster = get3NodeCluster();

      testTimes(poolCluster, /^node[12]/, 60)
        .then((nodes) => {
          expect(nodes['node1']).to.equal(30);
          expect(nodes['node2']).to.equal(30);
          expect(nodes['node3']).to.be.undefined;
          poolCluster.end().then(() => {
            done();
          });
        })
        .catch((err) => {
          poolCluster.end().then(() => {
            done(err);
          });
        });
    });

    it("won't use bad host pools", function (done) {
      const poolCluster = basePromise.createPoolCluster();
      let removedNode = [];
      poolCluster.on('remove', (node) => {
        removedNode.push(node);
      });
      const connOption1 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node1'",
        connectionLimit: 1,
        resetAfterUse: false
      });
      const connOption2 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node2'",
        connectionLimit: 1,
        resetAfterUse: false
      });
      const connOption3 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node3'",
        user: 'wrong_user',
        connectTimeout: 100,
        acquireTimeout: 200,
        connectionLimit: 1,
        resetAfterUse: false
      });

      poolCluster.add('node1', connOption1);
      poolCluster.add('node2', connOption2);
      poolCluster.add('node3', connOption3);

      testTimes(poolCluster, /^node[12]*/, 20)
        .then((nodes) => {
          expect(nodes['node1']).to.equal(10);
          expect(nodes['node2']).to.equal(10);
          expect(nodes['node3']).to.be.undefined;
          setTimeout(() => {
            expect(removedNode).to.have.length(1);
            expect(removedNode[0]).to.equal('node3');

            const nodesConf = poolCluster.__tests.getNodes();
            expect(Object.keys(nodesConf)).to.have.length(2);
            poolCluster.end().then(() => {
              done();
            });
          }, 100);
        })
        .catch((err) => {
          poolCluster.end().then(() => {
            done(err);
          });
        });
    });

    it("won't use bad host pools with rejection", function (done) {
      this.timeout(20000);
      const poolCluster = basePromise.createPoolCluster({
        canRetry: false,
        removeNodeErrorCount: 2
      });
      let removedNode = [];
      poolCluster.on('remove', (node) => {
        removedNode.push(node);
      });

      const connOption1 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node1'",
        connectionLimit: 1,
        resetAfterUse: false
      });
      const connOption2 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node2'",
        connectionLimit: 1,
        resetAfterUse: false
      });
      const connOption3 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node3'",
        user: 'wrong_user',
        connectTimeout: 100,
        acquireTimeout: 200,
        connectionLimit: 1,
        resetAfterUse: false
      });

      poolCluster.add('node1', connOption1);
      poolCluster.add('node2', connOption2);
      poolCluster.add('node3', connOption3);

      testTimesWithError(poolCluster, /^node*/, 10).then((nodes) => {
        expect(nodes['node1']).to.equal(4);
        expect(nodes['node2']).to.equal(3);
        expect(nodes['error']).to.equal(3);
        setTimeout(() => {
          expect(removedNode).to.have.length(1);
          expect(removedNode[0]).to.equal('node3');

          poolCluster
            .end()
            .then(() => {
              done();
            })
            .catch(done);
        }, 100);
      });
    });

    it('reusing node after timeout', function (done) {
      if (process.env.SKYSQL || process.env.SKYSQL_HA) this.skip();
      this.timeout(20000);
      const cl = get3NodeClusterWithProxy({ restoreNodeTimeout: 500 }, basePromise);
      const poolCluster = cl.cluster;
      const proxy = cl.proxy;
      let removedNode = [];
      poolCluster.on('remove', (node) => {
        removedNode.push(node);
      });

      testTimesWithError(poolCluster, /^node*/, 10).then((nodes) => {
        expect(nodes['node1']).to.equal(4);
        expect(nodes['node2']).to.equal(3);
        expect(nodes['node3']).to.equal(3);

        proxy.close();
        //wait for socket to end.
        setTimeout(() => {
          testTimesWithError(poolCluster, /^node*/, 10).then((nodes) => {
            expect(nodes['node1']).to.equal(5);
            expect(nodes['node2']).to.be.undefined;
            expect(nodes['node3']).to.equal(5);
            setTimeout(() => {
              expect(removedNode).to.have.length(0);

              proxy.resume();
              setTimeout(() => {
                testTimesWithError(poolCluster, /^node*/, 10)
                  .then((nodes) => {
                    poolCluster.end().then(() => {
                      proxy.close();
                    });
                    expect([3, 4]).to.contain.members([nodes['node1']]);
                    expect([1, 2, 3, 4]).to.contain.members([nodes['node2']]);
                    expect([3, 4]).to.contain.members([nodes['node3']]);
                    done();
                  })
                  .catch((err) => {
                    proxy.close();
                    done(err);
                  });
              }, 550);
            }, 100);
          });
        }, 500);
      });
    });

    it('server close connection during query', function (done) {
      if (process.env.SKYSQL || process.env.SKYSQL_HA) this.skip();
      if (process.env.MAXSCALE_TEST_DISABLE) this.skip();
      this.timeout(10000);
      const poolCluster = basePromise.createPoolCluster({});

      const connOption1 = Object.assign({}, Conf.baseConfig, {
        initSql: ["set @node='node1'", 'SET @@wait_timeout=2'],
        connectionLimit: 1,
        resetAfterUse: false
      });
      const connOption2 = Object.assign({}, Conf.baseConfig, {
        initSql: ["set @node='node2'", 'SET @@wait_timeout=2'],
        connectionLimit: 1,
        resetAfterUse: false
      });
      const connOption3 = Object.assign({}, Conf.baseConfig, {
        initSql: ["set @node='node3'", 'SET @@wait_timeout=2'],
        connectionLimit: 1,
        resetAfterUse: false
      });

      poolCluster.add('node1', connOption1);
      poolCluster.add('node2', connOption2);
      poolCluster.add('node3', connOption3);

      const filteredCluster = poolCluster.of(/^node[12]/);
      filteredCluster
        .query('KILL CONNECTION_ID()')
        .then(() => {
          done(new Error('must have thrown error !'));
        })
        .catch((err) => {
          assert.equal(err.sqlState, '70100');
          poolCluster.end().then(() => {
            done();
          });
        });
    });

    it('socket close connection during query', function (done) {
      if (process.env.MAXSCALE_TEST_DISABLE) this.skip();
      if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 1, 2)) this.skip();
      this.timeout(10000);
      const poolCluster = basePromise.createPoolCluster({});

      const connOption1 = Object.assign({}, Conf.baseConfig, {
        initSql: ["set @node='node1'", 'SET @@wait_timeout=2'],
        connectionLimit: 1,
        resetAfterUse: false,
        acquireTimeout: 10
      });
      const connOption2 = Object.assign({}, Conf.baseConfig, {
        initSql: ["set @node='node2'", 'SET @@wait_timeout=2'],
        connectionLimit: 1,
        resetAfterUse: false,
        acquireTimeout: 10
      });
      const connOption3 = Object.assign({}, Conf.baseConfig, {
        initSql: ["set @node='node3'", 'SET @@wait_timeout=2'],
        connectionLimit: 1,
        resetAfterUse: false,
        acquireTimeout: 10
      });

      poolCluster.add('node1', connOption1);
      poolCluster.add('node2', connOption2);
      poolCluster.add('node3', connOption3);
      const filteredCluster = poolCluster.of(/^node2/);
      filteredCluster
        .query(
          'SET STATEMENT max_statement_time=1 FOR select c1.* from information_schema.columns as c1,  information_schema.tables, information_schema.tables as t2'
        )
        .catch((err) => {
          //dismiss error
          poolCluster.end().then(() => {
            done();
          });
        });
    });

    it('get filtered', function (done) {
      this.timeout(10000);
      const poolCluster = get3NodeCluster();
      const filteredCluster = poolCluster.of(/^node[12]/);
      const promises = [];
      for (let i = 0; i < 60; i++) {
        promises.push(getConnectionAndCheck(filteredCluster, /^node[12]/));
      }
      Promise.all(promises)
        .then((results) => {
          const nodes = {};
          results.forEach((res) => {
            if (nodes[res]) {
              nodes[res]++;
            } else {
              nodes[res] = 1;
            }
          });
          expect(nodes['node1']).to.equal(30);
          expect(nodes['node2']).to.equal(30);
          expect(nodes['node3']).to.be.undefined;
          poolCluster.end().then(() => {
            done();
          });
        })
        .catch((err) => {
          poolCluster.end().then(() => {
            done(err);
          });
        });
    });

    it('query on filtered', function (done) {
      this.timeout(10000);
      const poolCluster = get3NodeCluster();
      const filteredCluster = poolCluster.of(/^node[12]/);

      const promises = [];
      for (let i = 0; i < 60; i++) {
        promises.push(filteredCluster.query('SELECT @node'));
      }
      Promise.all(promises)
        .then((results) => {
          const nodes = {};
          results.forEach((rows) => {
            const res = rows[0]['@node'];
            if (nodes[res]) {
              nodes[res]++;
            } else {
              nodes[res] = 1;
            }
          });
          expect(nodes['node1']).to.equal(30);
          expect(nodes['node2']).to.equal(30);
          expect(nodes['node3']).to.be.undefined;
          poolCluster.end().then(() => {
            done();
          });
        })
        .catch((err) => {
          poolCluster.end().then(() => {
            done(err);
          });
        });
    });

    it('query on filtered ORDER', function (done) {
      this.timeout(10000);
      const poolCluster = get3NodeCluster();
      const filteredCluster = poolCluster.of(/^node[12]/, 'ORDER');

      const promises = [];
      for (let i = 0; i < 60; i++) {
        promises.push(filteredCluster.query('SELECT @node'));
      }
      Promise.all(promises)
        .then((results) => {
          const nodes = {};
          results.forEach((rows) => {
            const res = rows[0]['@node'];
            if (nodes[res]) {
              nodes[res]++;
            } else {
              nodes[res] = 1;
            }
          });
          expect(nodes['node1']).to.equal(60);
          expect(nodes['node2']).to.be.undefined;
          expect(nodes['node3']).to.be.undefined;
          poolCluster.end().then(() => {
            done();
          });
        })
        .catch((err) => {
          poolCluster.end().then(() => {
            done(err);
          });
        });
    });

    it('batch on filtered', async function () {
      this.timeout(10000);
      const poolCluster = get3NodeCluster();
      const filteredCluster = poolCluster.of(/^node[12]/);

      await filteredCluster.query('DROP TABLE IF EXISTS filteredSimpleBatch');
      await filteredCluster.query(
        'CREATE TABLE filteredSimpleBatch(id int not null primary key auto_increment, val int)'
      );
      await filteredCluster.query('FLUSH TABLES');
      const promises = [];
      for (let i = 0; i < 60; i++) {
        promises.push(
          filteredCluster.batch('INSERT INTO filteredSimpleBatch(val) values (?)', [[1], [2], [3]])
        );
      }
      await Promise.all(promises);
      const res = await filteredCluster.query('SELECT count(*) as nb FROM filteredSimpleBatch');
      expect(res[0].nb).to.equal(180);
      await poolCluster.end();
    });

    it('batch error on filtered', function (done) {
      this.timeout(10000);
      const poolCluster = get3NodeCluster();
      const filteredCluster = poolCluster.of(/^node[12]/);

      filteredCluster
        .batch('INSERT INTO notexistingtable(val) values (?)', [[1], [2], [3]])
        .then((res) => {
          poolCluster.end().then(() => {
            done(new Error('must have thrown an error !'));
          });
        })
        .catch((err) => {
          expect(err.message).to.have.string("notexistingtable' doesn't exist");
          poolCluster.end().then(() => {
            done();
          });
        });
    });
  });

  describe('callback', () => {
    beforeEach(function (done) {
      shareConn
        .query('TRUNCATE TABLE clusterInsert')
        .then(() => {
          done();
        })
        .catch(done);
    });

    it('no node', function (done) {
      const poolCluster = baseCallback.createPoolCluster();
      poolCluster.getConnection((err, conn) => {
        if (err) {
          expect(err.message).to.equal(
            'No node have been added to cluster or nodes have been removed due to too much connection error'
          );
          done();
        } else {
          done(new Error('must have thrown an error !'));
        }
      });
    });

    it('end with callback', function (done) {
      const poolCluster = baseCallback.createPoolCluster();
      poolCluster.end((err) => {
        if (err) {
          done(err);
        } else done();
      });
    });

    it('pool full', function (done) {
      this.timeout(30000);
      const poolCluster = baseCallback.createPoolCluster();
      const connOption1 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node1'",
        connectionLimit: 1,
        resetAfterUse: false,
        connectTimeout: 1000,
        acquireTimeout: 500
      });

      poolCluster.add(connOption1);
      poolCluster.getConnection('PoolNode-0', (err, conn) => {
        if (err) {
          done(err);
        } else {
          poolCluster.getConnection('PoolNode-0', (err, conn2) => {
            if (!err) {
              poolCluster.end();
              done(new Error('must have thrown an error !'));
            } else {
              expect(err.message).to.have.string(
                "No Connection available for 'PoolNode-0'. Last connection error was: retrieve connection from pool timeout"
              );
              conn.end();
              poolCluster.end();
              done();
            }
          });
        }
      });
    });

    it('end with bad callback parameter', function (done) {
      const poolCluster = baseCallback.createPoolCluster();
      try {
        poolCluster.end('wrong callback');
        done(new Error('must have thrown an error !'));
      } catch (err) {
        expect(err.message).to.equal('callback parameter must be a function');
        done();
      }
    });

    it('select good pool', function (done) {
      const poolCluster = get3NodeCallbackCluster();

      getConnectionAndCheckCallback(poolCluster, /^node[01]$/, (err, res) => {
        poolCluster.end(() => {
          if (err) {
            done(err);
          } else {
            expect(res).to.equal('node1');
            done();
          }
        });
      });
    });

    it('test wrong selector', function (done) {
      const poolCluster = get3NodeCallbackCluster({ defaultSelector: 'WRONG' });

      poolCluster.getConnection(/^node*/, (err, conn) => {
        poolCluster.end(() => {
          if (err) {
            expect(err.message).to.equal(
              "Wrong selector value 'WRONG'. Possible values are 'RR','RANDOM' or 'ORDER'"
            );
            done();
          } else {
            done(new Error('must have thrown an error'));
          }
        });
      });
    });

    it('select round-robin pools', function (done) {
      const poolCluster = get3NodeCallbackCluster();

      testTimesCallback(poolCluster, (err, nodes) => {
        poolCluster.end(() => {
          if (err) {
            done(err);
          } else {
            expect(nodes['node1']).to.equal(3);
            expect(nodes['node2']).to.equal(3);
            expect(nodes['node3']).to.equal(3);
            done();
          }
        });
      });
    });

    it('remove/add nodes during use', function (done) {
      const poolCluster = get3NodeCallbackCluster();
      testTimesCallback(poolCluster, (err, nodes) => {
        if (err) {
          poolCluster.end(() => {
            done(err);
          });
        } else {
          expect(nodes['node1']).to.equal(3);
          expect(nodes['node2']).to.equal(3);
          expect(nodes['node3']).to.equal(3);

          poolCluster.remove(/^node2/);
          poolCluster.add(
            'node4',
            Object.assign({}, Conf.baseConfig, {
              initSql: "set @node='node4'",
              connectionLimit: 1,
              resetAfterUse: false
            })
          );
          testTimesCallback(poolCluster, (err, nodes) => {
            if (err) {
              poolCluster.end(() => {
                done(err);
              });
            } else {
              expect(nodes['node1']).to.equal(3);
              expect(nodes['node2']).to.be.undefined;
              expect(nodes['node3']).to.equal(3);
              expect(nodes['node4']).to.equal(3);
              poolCluster.end(() => {
                done();
              });
            }
          });
        }
      });
    });

    it('select ordered pools', function (done) {
      const poolCluster = get3NodeCallbackCluster({ defaultSelector: 'ORDER' });

      testTimesCallback(poolCluster, (err, nodes) => {
        if (err) {
          poolCluster.end(() => {
            done(err);
          });
        } else {
          expect(nodes['node1']).to.equal(9);
          expect(nodes['node2']).to.be.undefined;
          expect(nodes['node3']).to.be.undefined;
          poolCluster.end(() => {
            done();
          });
        }
      });
    });

    it('select random pools', function (done) {
      const poolCluster = get3NodeCallbackCluster({
        defaultSelector: 'RANDOM'
      });
      const cb = (err, nodes) => {
        poolCluster.end(() => {
          if (err) {
            done(err);
          } else {
            expect(nodes['node1']).to.be.below(40);
            expect(nodes['node1']).to.be.at.least(5);
            expect(nodes['node2']).to.be.below(40);
            expect(nodes['node2']).to.be.at.least(5);
            expect(nodes['node3']).to.be.below(40);
            expect(nodes['node3']).to.be.at.least(5);
            done();
          }
        });
      };

      testTimesCallback(poolCluster, cb, /^node*/, 60);
    });

    it('ensure selector filter', function (done) {
      const poolCluster = get3NodeCallbackCluster();
      const cb = (err, nodes) => {
        poolCluster.end(() => {
          if (err) {
            done(err);
          } else {
            expect(nodes['node1']).to.equal(30);
            expect(nodes['node2']).to.equal(30);
            expect(nodes['node3']).to.be.undefined;
            done();
          }
        });
      };
      testTimesCallback(poolCluster, cb, /^node[12]/, 60);
    });

    it("won't use bad host pools", function (done) {
      const poolCluster = baseCallback.createPoolCluster();
      let removedNode = [];
      poolCluster.on('remove', (node) => {
        removedNode.push(node);
      });

      const connOption1 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node1'",
        connectionLimit: 1,
        resetAfterUse: false
      });
      const connOption2 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node2'",
        connectionLimit: 1,
        resetAfterUse: false
      });
      const connOption3 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node3'",
        user: 'wrong_user',
        connectTimeout: 100,
        acquireTimeout: 200,
        connectionLimit: 1,
        resetAfterUse: false
      });

      poolCluster.add('node1', connOption1);
      poolCluster.add('node2', connOption2);
      poolCluster.add('node3', connOption3);
      const cb = (err, nodes) => {
        if (err) {
          poolCluster.end(() => {
            done(err);
          });
        } else {
          expect(nodes['node1']).to.equal(10);
          expect(nodes['node2']).to.equal(10);
          expect(nodes['node3']).to.be.undefined;
          setTimeout(() => {
            expect(removedNode).to.have.length(1);
            expect(removedNode[0]).to.equal('node3');

            const nodesConf = poolCluster.__tests.getNodes();
            expect(Object.keys(nodesConf)).to.have.length(2);
            poolCluster.end(() => {
              done();
            });
          }, 100);
        }
      };
      testTimesCallback(poolCluster, cb, /^node[12]*/, 20);
    });

    it("won't use bad host pools with rejection", function (done) {
      this.timeout(20000);
      const poolCluster = baseCallback.createPoolCluster({
        canRetry: false,
        removeNodeErrorCount: 2
      });
      let removedNode = [];
      poolCluster.on('remove', (node) => {
        removedNode.push(node);
      });

      const connOption1 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node1'",
        connectionLimit: 1,
        resetAfterUse: false
      });
      const connOption2 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node2'",
        connectionLimit: 1,
        resetAfterUse: false
      });
      const connOption3 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node3'",
        user: 'wrong_user',
        connectTimeout: 50,
        acquireTimeout: 150,
        connectionLimit: 1,
        resetAfterUse: false
      });

      poolCluster.add('node1', connOption1);
      poolCluster.add('node2', connOption2);
      poolCluster.add('node3', connOption3);

      const cb = (err, nodes) => {
        if (err) {
          poolCluster.end(() => {
            done(err);
          });
        } else {
          expect(nodes['node1']).to.equal(4);
          expect(nodes['node2']).to.equal(3);
          expect(nodes['error']).to.equal(3);
          setTimeout(() => {
            expect(removedNode).to.have.length(1);
            expect(removedNode[0]).to.equal('node3');

            poolCluster.end(() => {
              done();
            });
          }, 100);
        }
      };

      testTimesCallback(poolCluster, cb, /^node*/, 10);
    });

    it('reusing node after timeout', function (done) {
      this.timeout(20000);
      const cl = get3NodeClusterWithProxy({ restoreNodeTimeout: 500 }, baseCallback);
      const poolCluster = cl.cluster;
      const proxy = cl.proxy;
      let removedNode = [];
      poolCluster.on('remove', (node) => {
        removedNode.push(node);
      });

      testTimesCallback(
        poolCluster,
        (err, nodes) => {
          expect(nodes['node1']).to.equal(4);
          expect(nodes['node2']).to.equal(3);
          expect(nodes['node3']).to.equal(3);

          proxy.close();
          //wait for socket to end.
          setTimeout(() => {
            testTimesCallback(
              poolCluster,
              (err, nodes) => {
                expect(nodes['node1']).to.equal(5);
                expect(nodes['node2']).to.be.undefined;
                expect(nodes['node3']).to.equal(5);

                expect(removedNode).to.have.length(0);

                proxy.resume();
                setTimeout(() => {
                  testTimesCallback(
                    poolCluster,
                    (err, nodes) => {
                      poolCluster.end(() => {
                        proxy.close();
                      });
                      expect([3, 4]).to.contain.members([nodes['node1']]);
                      expect([3, 4]).to.contain.members([nodes['node2']]);
                      expect([3, 4]).to.contain.members([nodes['node3']]);
                      done();
                    },
                    /^node*/,
                    10
                  );
                }, 550);
              },
              /^node*/,
              10
            );
          }, 500);
        },
        /^node*/,
        10
      );
    });

    it('get filtered', function (done) {
      this.timeout(20000);
      const poolCluster = get3NodeCluster();
      const filteredCluster = poolCluster.of(/^node[12]/);
      const promises = [];
      for (let i = 0; i < 60; i++) {
        promises.push(getConnectionAndCheck(filteredCluster, /^node[12]/));
      }
      Promise.all(promises)
        .then((results) => {
          const nodes = {};
          results.forEach((res) => {
            if (nodes[res]) {
              nodes[res]++;
            } else {
              nodes[res] = 1;
            }
          });
          expect(nodes['node1']).to.equal(30);
          expect(nodes['node2']).to.equal(30);
          expect(nodes['node3']).to.be.undefined;
          poolCluster.end().then(() => {
            done();
          });
        })
        .catch((err) => {
          poolCluster.end().then(() => {
            done(err);
          });
        });
    });

    it('query on filtered', function (done) {
      const poolCluster = get3NodeCluster();
      const filteredCluster = poolCluster.of(/^node[12]/);

      const promises = [];
      for (let i = 0; i < 60; i++) {
        promises.push(filteredCluster.query('SELECT @node'));
      }
      Promise.all(promises)
        .then((results) => {
          const nodes = {};
          results.forEach((rows) => {
            const res = rows[0]['@node'];
            if (nodes[res]) {
              nodes[res]++;
            } else {
              nodes[res] = 1;
            }
          });
          expect(nodes['node1']).to.equal(30);
          expect(nodes['node2']).to.equal(30);
          expect(nodes['node3']).to.be.undefined;
          poolCluster.end().then(() => {
            done();
          });
        })
        .catch((err) => {
          poolCluster.end().then(() => {
            done(err);
          });
        });
    });

    it('query on filtered ORDER', function (done) {
      const poolCluster = get3NodeCluster();
      const filteredCluster = poolCluster.of(/^node[12]/, 'ORDER');

      const promises = [];
      for (let i = 0; i < 60; i++) {
        promises.push(filteredCluster.query('SELECT @node'));
      }
      Promise.all(promises)
        .then((results) => {
          const nodes = {};
          results.forEach((rows) => {
            const res = rows[0]['@node'];
            if (nodes[res]) {
              nodes[res]++;
            } else {
              nodes[res] = 1;
            }
          });
          expect(nodes['node1']).to.equal(60);
          expect(nodes['node2']).to.be.undefined;
          expect(nodes['node3']).to.be.undefined;
          poolCluster.end().then(() => {
            done();
          });
        })
        .catch((err) => {
          poolCluster.end().then(() => {
            done(err);
          });
        });
    });
  });

  const get3NodeCallbackCluster = (opts) => {
    const poolCluster = baseCallback.createPoolCluster(opts);

    const connOption1 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node1'",
      connectionLimit: 1,
      resetAfterUse: false
    });
    const connOption2 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node2'",
      connectionLimit: 1,
      resetAfterUse: false
    });
    const connOption3 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node3'",
      connectionLimit: 1,
      resetAfterUse: false
    });

    poolCluster.add('node1', connOption1);
    poolCluster.add('node2', connOption2);
    poolCluster.add('node3', connOption3);
    return poolCluster;
  };

  const get3NodeCluster = (opts) => {
    const poolCluster = basePromise.createPoolCluster(opts);

    const connOption1 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node1'",
      connectionLimit: 1,
      resetAfterUse: false
    });
    const connOption2 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node2'",
      connectionLimit: 1,
      resetAfterUse: false
    });
    const connOption3 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node3'",
      connectionLimit: 1,
      resetAfterUse: false
    });

    poolCluster.add('node1', connOption1);
    poolCluster.add('node2', connOption2);
    poolCluster.add('node3', connOption3);
    return poolCluster;
  };

  const get3NodeClusterWithProxy = (opts, base) => {
    const poolCluster = base.createPoolCluster(opts);

    const connOption1 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node1'",
      connectionLimit: 1,
      resetAfterUse: false
    });
    const proxy = new Proxy({
      port: Conf.baseConfig.port,
      proxyPort: 4000,
      host: Conf.baseConfig.host,
      resetAfterUse: false
    });
    const connOption2 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node2'",
      connectionLimit: 1,
      host: 'localhost',
      connectTimeout: 200,
      socketTimeout: 200,
      acquireTimeout: 250,
      port: 4000,
      resetAfterUse: false
    });

    const connOption3 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node3'",
      connectionLimit: 1,
      resetAfterUse: false
    });

    poolCluster.add('node1', connOption1);
    poolCluster.add('node2', connOption2);
    poolCluster.add('node3', connOption3);
    return { cluster: poolCluster, proxy: proxy };
  };

  const testTimes = (poolCluster, filter, number) => {
    const promises = [];
    for (let i = 0; i < (number ? number : 9); i++) {
      promises.push(getConnectionAndCheck(poolCluster, filter));
    }
    return Promise.all(promises)
      .then((results) => {
        const nodes = {};
        results.forEach((res) => {
          if (nodes[res]) {
            nodes[res]++;
          } else {
            nodes[res] = 1;
          }
        });
        return Promise.resolve(nodes);
      })
      .catch((err) => {
        return Promise.reject(err);
      });
  };

  const testTimesWithError = (poolCluster, filter, number) => {
    const promises = [];
    for (let i = 0; i < (number ? number : 9); i++) {
      promises.push(getConnectionAndCheck(poolCluster, filter));
    }
    return Promise.all(promises.map((p) => p.catch((e) => e))).then((results) => {
      const nodes = {};
      results.forEach((res) => {
        if (res instanceof Error) {
          res = 'error';
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

  const testTimesCallback = (poolCluster, cb, filter, number) => {
    const results = [];
    let idx = 0;
    if (!number) number = 9;
    for (let i = 0; i < number; i++) {
      getConnectionAndCheckCallback(poolCluster, filter, (err, res) => {
        idx++;
        if (err) {
          if (results['error']) {
            results['error'] = results['error'] + 1;
          } else {
            results['error'] = 1;
          }
        } else {
          if (results[res]) {
            results[res] = results[res] + 1;
          } else {
            results[res] = 1;
          }
        }
        if (idx === number) {
          cb(null, results);
        }
      });
    }
  };

  const getConnectionAndCheck = (cluster, pattern) => {
    let nodeName;
    return cluster.getConnection(pattern).then((conn) => {
      return conn
        .query('SELECT @node')
        .then((row) => {
          nodeName = row[0]['@node'];
          return conn.batch('INSERT INTO clusterInsert VALUES (?,?)', [
            [1, 'TOM'],
            [2, 'JERRY']
          ]);
        })
        .then((res) => {
          assert.equal(res.affectedRows, 2);
          return conn.end();
        })
        .then(() => {
          return nodeName;
        })
        .catch((err) => {
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
        conn.query('SELECT @node', (err, row) => {
          if (err) {
            callback(err);
          } else {
            conn.end(() => {
              callback(null, row[0]['@node']);
            });
          }
        });
      }
    });
  };
});
