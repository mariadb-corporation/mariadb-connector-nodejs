//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

const expect = require('chai').expect;
const Conf = require('../conf');
const basePromise = require('../../promise');
const baseCallback = require('../../callback');
const Proxy = require('../tools/proxy');
const base = require('../base.js');

const { assert } = require('chai');
const { isMaxscale } = require('../base');

describe('cluster', function () {
  before(async function () {
    await shareConn.query('DROP TABLE IF EXISTS clusterInsert');
    await shareConn.query('CREATE TABLE clusterInsert(id int, nam varchar(256))');
    await shareConn.query('FLUSH TABLES');
  });

  describe('promise', function () {
    beforeEach(async function () {
      await shareConn.query('TRUNCATE TABLE clusterInsert');
    });

    it('no node', function (done) {
      const cluster = basePromise.createPoolCluster();
      cluster
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
      const cluster = basePromise.createPoolCluster();
      const connOption1 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node1'",
        connectionLimit: 1,
        resetAfterUse: false
      });

      cluster.add('node1', connOption1);
      cluster
        .getConnection(/^M*$/)
        .then(() => {
          cluster.end().then(() => {
            done(new Error('must have thrown an error !'));
          });
        })
        .catch((err) => {
          expect(err.message).to.have.string("No node found for pattern '/^M*$/'");
          cluster.end().then(() => {
            done();
          });
        });
    });

    it('default id', function (done) {
      const cluster = basePromise.createPoolCluster();
      const connOption1 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node1'",
        connectionLimit: 1,
        resetAfterUse: false
      });

      cluster.add(connOption1);
      cluster
        .getConnection('PoolNode-0')
        .then((conn) => {
          conn.end();
          cluster.end().then(() => {
            done();
          });
        })
        .catch(done);
    });

    it('pool full', function (done) {
      this.timeout(30000);
      const cluster = basePromise.createPoolCluster({ removeNodeErrorCount: 1 });
      const connOption1 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node1'",
        connectionLimit: 1,
        resetAfterUse: false,
        connectTimeout: 1000,
        acquireTimeout: 500
      });

      cluster.add(connOption1);
      cluster
        .getConnection('PoolNode-0')
        .then((conn) => {
          cluster
            .getConnection('PoolNode-0')
            .then((conn2) => {
              conn.release();
              conn2.release();
              cluster.end();
              done(new Error('must have thrown an error !'));
            })
            .catch((err) => {
              expect(err.message).to.have.string('pool timeout: failed to retrieve a connection from pool after');
              expect(err.message).to.have.string('(pool connections: active=1 idle=0 limit=1)');

              cluster
                .getConnection('PoolNode-0')
                .then((conn2) => {
                  conn.release();
                  conn2.release();
                  cluster.end();
                  done(new Error('must have thrown an error !'));
                })
                .catch((err) => {
                  expect(err.message).to.have.string(
                    'No node have been added to cluster or nodes have been removed due to too much connection error'
                  );
                  cluster
                    .getConnection('PoolNode-0')
                    .then((conn2) => {
                      conn.release();
                      conn2.release();
                      cluster.end();
                      done(new Error('must have thrown an error !'));
                    })
                    .catch((err) => {
                      expect(err.message).to.have.string(
                        'No node have been added to cluster or nodes have been removed due' +
                          ' to too much connection error'
                      );
                      conn.release().finally(() => {
                        cluster.end().then(() => {
                          done();
                        });
                      });
                    });
                });
            });
        })
        .catch(done);
    });

    it('cluster add error', function (done) {
      const cluster = basePromise.createPoolCluster();
      const connOption1 = Object.assign({}, Conf.baseConfig, {
        connectionLimit: 1
      });

      cluster.add('node1', connOption1);
      try {
        cluster.add('node1', connOption1);
        cluster.end().then(() => {
          return done(new Error('must have thrown an error'));
        });
      } catch (e) {
        assert.isTrue(e.message.includes("Node identifier 'node1' already exist"));
        cluster.end().then(() => {
          done();
        });
      }
    });

    it('end no configuration', function (done) {
      const cluster = basePromise.createPoolCluster();
      cluster
        .end()
        .then(() => {
          done();
        })
        .catch(done);
    });

    it('select good pool', async function () {
      const cluster = get3NodeCluster();
      try {
        const res = await getConnectionAndCheck(cluster, /^node[01]$/);
        expect(res).to.equal('node1');
      } finally {
        await cluster.end();
      }
    });

    it('test wrong selector', function (done) {
      const cluster = get3NodeCluster({ defaultSelector: 'WRONG' });

      cluster
        .getConnection(/^node*/)
        .then(() => {
          cluster.end().then(() => {
            done(new Error('must have thrown an error'));
          });
        })
        .catch((err) => {
          expect(err.message).to.equal("Wrong selector value 'WRONG'. Possible values are 'RR','RANDOM' or 'ORDER'");
          cluster.end().then(() => {
            done();
          });
        });
    });

    it('select round-robin pools', async function () {
      const cluster = get3NodeCluster();
      try {
        const nodes = await testTimes(cluster);
        expect(nodes['node1']).to.equal(3);
        expect(nodes['node2']).to.equal(3);
        expect(nodes['node3']).to.equal(3);
      } finally {
        await cluster.end();
      }
    });

    it('remove/add nodes during use', async function () {
      this.timeout(10000);
      const cluster = get3NodeCluster();
      try {
        let nodes = await testTimes(cluster);
        expect(nodes['node1']).to.equal(3);
        expect(nodes['node2']).to.equal(3);
        expect(nodes['node3']).to.equal(3);

        cluster.remove(/^node2/);
        cluster.add(
          'node4',
          Object.assign({}, Conf.baseConfig, {
            initSql: "set @node='node4'",
            connectionLimit: 1,
            resetAfterUse: false
          })
        );
        nodes = await testTimes(cluster);
        expect(nodes['node1']).to.equal(3);
        expect(nodes['node2']).to.be.undefined;
        expect(nodes['node3']).to.equal(3);
        expect(nodes['node4']).to.equal(3);
      } finally {
        await cluster.end();
      }
    });

    it('select ordered pools', async function () {
      this.timeout(10000);
      const cluster = get3NodeCluster({ defaultSelector: 'ORDER' });
      try {
        const nodes = await testTimes(cluster);
        expect(nodes['node1']).to.equal(9);
        expect(nodes['node2']).to.be.undefined;
        expect(nodes['node3']).to.be.undefined;
      } finally {
        await cluster.end();
      }
    });

    it('select random pools', async function () {
      this.timeout(10000);
      const cluster = get3NodeCluster({ defaultSelector: 'RANDOM' });
      try {
        const nodes = await testTimes(cluster, /^node*/, 60);
        expect(nodes['node1']).to.be.below(40);
        expect(nodes['node1']).to.be.at.least(5);
        expect(nodes['node2']).to.be.below(40);
        expect(nodes['node2']).to.be.at.least(5);
        expect(nodes['node3']).to.be.below(40);
        expect(nodes['node3']).to.be.at.least(5);
      } finally {
        await cluster.end();
      }
    });

    it('ensure selector filter', async function () {
      this.timeout(10000);
      const cluster = get3NodeCluster();
      try {
        const nodes = await testTimes(cluster, /^node[12]/, 60);
        expect(nodes['node1']).to.equal(30);
        expect(nodes['node2']).to.equal(30);
        expect(nodes['node3']).to.be.undefined;
      } finally {
        await cluster.end();
      }
    });

    it("won't use bad host pools", function (done) {
      this.timeout(10000);
      const cluster = basePromise.createPoolCluster({ removeNodeErrorCount: 5 });
      let removedNode = [];
      cluster.on('remove', (node) => {
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

      cluster.add('node1', connOption1);
      cluster.add('node2', connOption2);
      cluster.add('node3', connOption3);

      testTimes(cluster, /^node[12]*/, 20)
        .then((nodes) => {
          expect(nodes['node1']).to.equal(10);
          expect(nodes['node2']).to.equal(10);
          expect(nodes['node3']).to.be.undefined;
          setTimeout(() => {
            expect(removedNode).to.have.length(1);
            expect(removedNode[0]).to.equal('node3');

            const nodesConf = cluster.__tests.getNodes();
            expect(Object.keys(nodesConf)).to.have.length(2);
            cluster.end().then(() => {
              done();
            });
          }, 100);
        })
        .catch((err) => {
          cluster.end().then(() => {
            done(err);
          });
        });
    });

    it("won't use bad host pools with rejection", function (done) {
      this.timeout(20000);
      const cluster = basePromise.createPoolCluster({
        canRetry: false,
        removeNodeErrorCount: 2
      });
      let removedNode = [];
      cluster.on('remove', (node) => {
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

      cluster.add('node1', connOption1);
      cluster.add('node2', connOption2);
      cluster.add('node3', connOption3);

      testTimesWithError(cluster, /^node*/, 10).then((nodes) => {
        expect(nodes['node1']).to.equal(4);
        expect(nodes['node2']).to.equal(3);
        expect(nodes['error']).to.equal(3);
        setTimeout(() => {
          expect(removedNode).to.have.length(1);
          expect(removedNode[0]).to.equal('node3');

          cluster
            .end()
            .then(() => {
              done();
            })
            .catch(done);
        }, 100);
      });
    });

    it('one node failing', async function () {
      if (isMaxscale()) this.skip();

      this.timeout(30000);
      const cluster = basePromise.createPoolCluster({});

      const proxy = new Proxy({
        port: Conf.baseConfig.port,
        host: Conf.baseConfig.host,
        resetAfterUse: false
      });
      await proxy.start();

      const connOption2 = Object.assign({}, Conf.baseConfig, {
        connectionLimit: 1,
        host: 'localhost',
        socketTimeout: 200,
        acquireTimeout: 500,
        minDelayValidation: 0,
        port: proxy.port(),
        resetAfterUse: false,
        trace: true
      });

      cluster.add('node2', connOption2);
      // wait for 100s so pool are loaded
      await new Promise(function (resolve, reject) {
        setTimeout(async () => {
          let conn;
          try {
            // first pass to make node1 blacklisted
            conn = await cluster.getConnection('node*', 'ORDER');
            await conn.query("SELECT '1'");
            await conn.release();
            conn = null;

            let initTime = Date.now();
            conn = await cluster.getConnection('node*', 'ORDER');
            await conn.query("SELECT '2'");
            await conn.release();
            conn = null;

            assert(Date.now() - initTime <= 50, 'expected < 50ms, but was ' + (Date.now() - initTime));
            await proxy.close();
            try {
              conn = await cluster.getConnection('node*', 'ORDER');
              await conn.query("SELECT '3'");
              throw Error('must have thrown error');
            } catch (e) {
              if (conn) await conn.release();
              conn = null;
            }
            await proxy.resume();

            conn = await cluster.getConnection('node*', 'ORDER');
            initTime = Date.now();
            await conn.query("SELECT '4'");
            await conn.release();
            conn = null;

            assert(Date.now() - initTime <= 50, 'expected < 50ms, but was ' + (Date.now() - initTime));
            await cluster.end();
            proxy.close();
            resolve();
          } catch (e) {
            console.log(e);
            if (conn) await conn.release();
            await cluster.end();
            proxy.close();
            reject(e);
          }
        }, 100);
      });
    });

    it('one node failing with blacklisted host', async function () {
      if (isMaxscale()) this.skip();

      this.timeout(30000);
      const cluster = basePromise.createPoolCluster({});

      const proxy = new Proxy({
        port: Conf.baseConfig.port,
        host: Conf.baseConfig.host,
        resetAfterUse: false
      });
      await proxy.start();
      const connOption1 = Object.assign({}, Conf.baseConfig, {
        connectionLimit: 1,
        host: 'wrong host',
        connectTimeout: 200,
        socketTimeout: 200,
        acquireTimeout: 250,
        resetAfterUse: false,
        trace: true
      });

      const connOption2 = Object.assign({}, Conf.baseConfig, {
        connectionLimit: 1,
        host: 'localhost',
        minDelayValidation: 0,
        socketTimeout: 200,
        acquireTimeout: 250,
        port: proxy.port(),
        resetAfterUse: false,
        trace: true
      });

      cluster.add('node1', connOption1);
      cluster.add('node2', connOption2);
      // wait for 100s so pool are loaded
      await new Promise(function (resolve, reject) {
        setTimeout(async () => {
          let conn;
          try {
            // first pass to make node1 blacklisted
            conn = await cluster.getConnection('node*', 'ORDER');
            await conn.query("SELECT '1'");
            await conn.release();
            conn = null;

            let initTime = Date.now();
            conn = await cluster.getConnection('node*', 'ORDER');
            await conn.query("SELECT '1'");
            await conn.release();
            conn = null;

            assert(Date.now() - initTime <= 50, 'expected < 50ms, but was ' + (Date.now() - initTime));
            await proxy.stop();
            try {
              conn = await cluster.getConnection('node*', 'ORDER');
              await conn.query("SELECT '1'");
              throw Error('must have thrown error');
            } catch (e) {
              if (conn) await conn.release();
              conn = null;
            }
            proxy.resume();
            await new Promise((resolve) => new setTimeout(resolve, 500));
            conn = await cluster.getConnection('node*', 'ORDER');
            initTime = Date.now();
            await conn.query("SELECT '1'");
            await conn.release();
            conn = null;

            assert(Date.now() - initTime <= 50, 'expected < 50ms, but was ' + (Date.now() - initTime));
            await cluster.end();
            proxy.close();
            resolve();
          } catch (e) {
            if (conn) await conn.release();
            await cluster.end();
            proxy.close();
            reject(e);
          }
        }, 100);
      });
    });

    it('reusing node after timeout', async function () {
      this.timeout(30000);
      const cl = await get3NodeClusterWithProxy({ restoreNodeTimeout: 500 }, basePromise);
      const cluster = cl.cluster;
      const proxy = cl.proxy;
      let removedNode = [];
      cluster.on('remove', (node) => {
        removedNode.push(node);
      });

      let nodes = await testTimesWithError(cluster, /^node*/, 10);
      assert.deepEqual(
        nodes,
        { node1: 4, node2: 3, node3: 3 },
        `wrong value: ${nodes} , expected { node1: 4, node2: 3, node3: 3 }`
      );

      await proxy.close();
      //wait for socket to end.
      await new Promise((resolve) => new setTimeout(resolve, 500));

      nodes = await testTimesWithError(cluster, /^node*/, 10);
      await proxy.resume();
      assert.deepEqual(nodes, { node1: 5, node3: 5 }, `wrong value: ${nodes} , expected { node1: 5, node3: 5 }`);
      await new Promise((resolve) => new setTimeout(resolve, 500));
      expect(removedNode).to.have.length(0);
      await new Promise((resolve) => new setTimeout(resolve, 2000));
      let node2s = await testTimesWithError(cluster, /^node*/, 10);

      if (node2s['node2'] === 0) {
        // in case of pool reconnection taking longer
        await new Promise((resolve) => new setTimeout(resolve, 2000));
        let node2s = await testTimesWithError(cluster, /^node*/, 10);
      }

      await cluster.end();
      await proxy.close();
      expect([3, 4]).to.contain.members([node2s['node1']]);
      expect([1, 2, 3, 4]).to.contain.members([node2s['node2']]);
      expect([3, 4]).to.contain.members([node2s['node3']]);
    });

    it('server close connection during query', function (done) {
      if (isMaxscale()) this.skip();
      this.timeout(20000);
      const cluster = basePromise.createPoolCluster({});

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

      cluster.add('node1', connOption1);
      cluster.add('node2', connOption2);
      cluster.add('node3', connOption3);

      const filteredCluster = cluster.of(/^node[12]/);
      filteredCluster
        .query('KILL CONNECTION_ID()')
        .then(() => {
          done(new Error('must have thrown error !'));
        })
        .catch((err) => {
          assert.equal(err.sqlState, '70100');
          cluster.end().then(() => {
            done();
          });
        });
    });

    it('socket close connection during query', function (done) {
      if (isMaxscale()) this.skip();
      if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 1, 2)) this.skip();
      this.timeout(10000);
      const cluster = basePromise.createPoolCluster({});

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

      cluster.add('node1', connOption1);
      cluster.add('node2', connOption2);
      cluster.add('node3', connOption3);
      const filteredCluster = cluster.of(/^node2/);
      filteredCluster
        .query(
          'SET STATEMENT max_statement_time=1 FOR select c1.* from information_schema.columns as c1,  information_schema.tables, information_schema.tables as t2'
        )
        .catch((err) => {
          //dismiss error
          cluster.end().then(() => {
            done();
          });
        });
    });

    it('get filtered', async function () {
      this.timeout(10000);
      const cluster = get3NodeCluster();
      try {
        const filteredCluster = cluster.of(/^node[12]/);
        const promises = [];
        for (let i = 0; i < 60; i++) {
          promises.push(getConnectionAndCheck(filteredCluster, /^node[12]/));
        }
        let results = await Promise.all(promises);
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
      } finally {
        await cluster.end();
      }
    });

    it('query on filtered', function (done) {
      this.timeout(10000);
      const cluster = get3NodeCluster();
      const filteredCluster = cluster.of(/^node[12]/);

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
          cluster.end().then(() => {
            done();
          });
        })
        .catch((err) => {
          cluster.end().then(() => {
            done(err);
          });
        });
    });

    it('query on filtered ORDER', function (done) {
      this.timeout(10000);
      const cluster = get3NodeCluster();
      const filteredCluster = cluster.of(/^node[12]/, 'ORDER');

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
          cluster.end().then(() => {
            done();
          });
        })
        .catch((err) => {
          cluster.end().then(() => {
            done(err);
          });
        });
    });

    it('execute on filtered ORDER', function (done) {
      this.timeout(10000);
      const cluster = get3NodeCluster();
      const filteredCluster = cluster.of(/^node[12]/, 'ORDER');

      const promises = [];
      for (let i = 0; i < 60; i++) {
        promises.push(filteredCluster.execute('SELECT @node'));
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
          cluster.end().then(() => {
            done();
          });
        })
        .catch((err) => {
          cluster.end().then(() => {
            done(err);
          });
        });
    });

    it('fail execute on filtered', async function () {
      this.timeout(10000);
      const cluster = get3NodeCluster();
      const filteredCluster = cluster.of(/^node[12]/, 'ORDER');

      try {
        await filteredCluster.execute('wrong query');
        throw Error('error must have be thrown');
      } catch (err) {
        cluster.end();
        if (err.errno === 1141) {
          // SKYSQL ERROR
          assert.isTrue(
            err.message.includes(
              'Query could not be tokenized and will hence be rejected. Please ensure that the SQL syntax is correct.'
            )
          );
          assert.equal(err.sqlState, 'HY000');
        } else {
          assert.equal(err.errno, 1064);
          assert.equal(err.code, 'ER_PARSE_ERROR');
          assert.equal(err.sqlState, 42000);
          assert.isTrue(err.message.includes('You have an error in your SQL syntax'));
          assert.isTrue(err.message.includes('wrong query'));
        }
      }
    });

    it('fail execute on filtered without pool', async function () {
      this.timeout(10000);
      const cluster = get3NodeCluster();
      const filteredCluster = cluster.of(/^node[56]/, 'ORDER');

      try {
        await filteredCluster.execute('wrong query');
        throw Error('error must have be thrown');
      } catch (err) {
        cluster.end();
        assert.isTrue(err.message.includes("No node found for pattern '/^node[56]/'"));
      }
    });

    it('batch on filtered', async function () {
      this.timeout(10000);
      const cluster = get3NodeCluster();
      const filteredCluster = cluster.of(/^node[12]/);

      await filteredCluster.query('DROP TABLE IF EXISTS filteredSimpleBatch');
      await filteredCluster.query(
        'CREATE TABLE filteredSimpleBatch(id int not null primary key auto_increment, val int)'
      );
      await filteredCluster.query('FLUSH TABLES');
      const promises = [];
      for (let i = 0; i < 60; i++) {
        promises.push(filteredCluster.batch('INSERT INTO filteredSimpleBatch(val) values (?)', [[1], [2], [3]]));
      }
      await Promise.all(promises);
      const res = await filteredCluster.query('SELECT count(*) as nb FROM filteredSimpleBatch');
      expect(res[0].nb).to.equal(180n);
      await cluster.end();
    });

    it('batch error on filtered', function (done) {
      this.timeout(10000);
      const cluster = get3NodeCluster();
      const filteredCluster = cluster.of(/^node[12]/);

      filteredCluster
        .batch('INSERT INTO notexistingtable(val) values (?)', [[1], [2], [3]])
        .then((res) => {
          cluster.end().then(() => {
            done(new Error('must have thrown an error !'));
          });
        })
        .catch((err) => {
          expect(err.message).to.have.string("notexistingtable' doesn't exist");
          cluster.end().then(() => {
            done();
          });
        });
    });

    it('ensure failing connection on pool not exiting application', async function () {
      this.timeout(5000);
      const cluster = basePromise.createPoolCluster();
      const connOption1 = Object.assign({}, Conf.baseConfig, {
        port: 8888,
        initializationTimeout: 100
      });
      cluster.add('node1', connOption1);

      // pool will throw an error after some time and must not exit test suite
      await new Promise((resolve, reject) => {
        new setTimeout(resolve, 3000);
      });
      await cluster.end();
    });
  });

  describe('callback', () => {
    beforeEach(async function () {
      await shareConn.query('TRUNCATE TABLE clusterInsert');
    });

    it('no node', function (done) {
      const cluster = baseCallback.createPoolCluster();
      cluster.getConnection((err, conn) => {
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
      const cluster = baseCallback.createPoolCluster();
      cluster.end((err) => {
        if (err) {
          done(err);
        } else done();
      });
    });

    it('pool full', function (done) {
      this.timeout(30000);
      const cluster = baseCallback.createPoolCluster({ removeNodeErrorCount: 5 });
      const connOption1 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node1'",
        connectionLimit: 1,
        resetAfterUse: false,
        connectTimeout: 1000,
        acquireTimeout: 500
      });

      cluster.add(connOption1);
      cluster.getConnection('PoolNode-0', (err, conn) => {
        if (err) {
          done(err);
        } else {
          cluster.getConnection('PoolNode-0', (err, conn2) => {
            if (!err) {
              cluster.end();
              done(new Error('must have thrown an error !'));
            } else {
              expect(err.message).to.have.string(
                "No Connection available for 'PoolNode-0'. Last connection error was: (conn:-1, no: 45028, SQLState: HY000) pool timeout: failed to retrieve a connection from pool after"
              );
              conn.end();
              cluster.end();
              done();
            }
          });
        }
      });
    });

    it('end with bad callback parameter', function (done) {
      const cluster = baseCallback.createPoolCluster();
      try {
        cluster.end('wrong callback');
        done(new Error('must have thrown an error !'));
      } catch (err) {
        expect(err.message).to.equal('callback parameter must be a function');
        done();
      }
    });

    it('select good pool', function (done) {
      const cluster = get3NodeCallbackCluster();

      getConnectionAndCheckCallback(cluster, /^node[01]$/, (err, res) => {
        cluster.end(() => {
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
      const cluster = get3NodeCallbackCluster({ defaultSelector: 'WRONG' });
      const filteredCluster = cluster.of(/^node[12]/);
      cluster.getConnection(/^node*/, (err, conn) => {
        cluster.end(() => {
          if (err) {
            expect(err.message).to.equal("Wrong selector value 'WRONG'. Possible values are 'RR','RANDOM' or 'ORDER'");
            done();
          } else {
            done(new Error('must have thrown an error'));
          }
        });
      });
    });

    it('select round-robin pools', function (done) {
      const cluster = get3NodeCallbackCluster();

      testTimesCallback(cluster, (err, nodes) => {
        cluster.end(() => {
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
      const cluster = get3NodeCallbackCluster();
      testTimesCallback(cluster, (err, nodes) => {
        if (err) {
          cluster.end(() => {
            done(err);
          });
        } else {
          expect(nodes['node1']).to.equal(3);
          expect(nodes['node2']).to.equal(3);
          expect(nodes['node3']).to.equal(3);

          cluster.remove(/^node2/);
          cluster.add(
            'node4',
            Object.assign({}, Conf.baseConfig, {
              initSql: "set @node='node4'",
              connectionLimit: 1,
              resetAfterUse: false
            })
          );
          testTimesCallback(cluster, (err, nodes) => {
            if (err) {
              cluster.end(() => {
                done(err);
              });
            } else {
              expect(nodes['node1']).to.equal(3);
              expect(nodes['node2']).to.be.undefined;
              expect(nodes['node3']).to.equal(3);
              expect(nodes['node4']).to.equal(3);
              cluster.end(() => {
                done();
              });
            }
          });
        }
      });
    });

    it('select ordered pools', function (done) {
      const cluster = get3NodeCallbackCluster({ defaultSelector: 'ORDER' });

      testTimesCallback(cluster, (err, nodes) => {
        if (err) {
          cluster.end(() => {
            done(err);
          });
        } else {
          expect(nodes['node1']).to.equal(9);
          expect(nodes['node2']).to.be.undefined;
          expect(nodes['node3']).to.be.undefined;
          cluster.end(() => {
            done();
          });
        }
      });
    });

    it('select random pools', function (done) {
      this.timeout(10000);
      const cluster = get3NodeCallbackCluster({
        defaultSelector: 'RANDOM'
      });
      const cb = (err, nodes) => {
        cluster.end(() => {
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

      testTimesCallback(cluster, cb, /^node*/, 60);
    });

    it('ensure selector filter', function (done) {
      this.timeout(10000);
      const cluster = get3NodeCallbackCluster();
      const cb = (err, nodes) => {
        cluster.end(() => {
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
      testTimesCallback(cluster, cb, /^node[12]/, 60);
    });

    it("won't use bad host pools", function (done) {
      this.timeout(10000);
      const cluster = baseCallback.createPoolCluster({ removeNodeErrorCount: 5 });
      let removedNode = [];
      cluster.on('remove', (node) => {
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

      cluster.add('node1', connOption1);
      cluster.add('node2', connOption2);
      cluster.add('node3', connOption3);
      const cb = (err, nodes) => {
        if (err) {
          cluster.end(() => {
            done(err);
          });
        } else {
          expect(nodes['node1']).to.equal(10);
          expect(nodes['node2']).to.equal(10);
          expect(nodes['node3']).to.be.undefined;
          setTimeout(() => {
            expect(removedNode).to.have.length(1);
            expect(removedNode[0]).to.equal('node3');

            const nodesConf = cluster.__tests.getNodes();
            expect(Object.keys(nodesConf)).to.have.length(2);
            cluster.end(() => {
              done();
            });
          }, 100);
        }
      };
      testTimesCallback(cluster, cb, /^node[12]*/, 20);
    });

    it("won't use bad host pools with rejection", function (done) {
      this.timeout(20000);
      const cluster = baseCallback.createPoolCluster({
        canRetry: false,
        removeNodeErrorCount: 2
      });
      let removedNode = [];
      cluster.on('remove', (node) => {
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

      cluster.add('node1', connOption1);
      cluster.add('node2', connOption2);
      cluster.add('node3', connOption3);

      const cb = (err, nodes) => {
        if (err) {
          cluster.end(() => {
            done(err);
          });
        } else {
          expect(nodes['node1']).to.equal(4);
          expect(nodes['node2']).to.equal(3);
          expect(nodes['error']).to.equal(3);
          setTimeout(() => {
            expect(removedNode).to.have.length(1);
            expect(removedNode[0]).to.equal('node3');

            cluster.end(() => {
              done();
            });
          }, 100);
        }
      };

      testTimesCallback(cluster, cb, /^node*/, 10);
    });

    it('reusing node after timeout', function (done) {
      get3NodeClusterWithProxy({ restoreNodeTimeout: 500 }, baseCallback).then((cl) => {
        const cluster = cl.cluster;
        const proxy = cl.proxy;
        let removedNode = [];
        cluster.on('remove', (node) => {
          removedNode.push(node);
        });

        testTimesCallback(
          cluster,
          (err, nodes) => {
            expect(nodes['node1']).to.equal(4);
            expect(nodes['node2']).to.equal(3);
            expect(nodes['node3']).to.equal(3);

            proxy.close();
            //wait for socket to end.
            setTimeout(() => {
              testTimesCallback(
                cluster,
                (err, nodes) => {
                  expect(nodes['node1']).to.equal(5);
                  expect(nodes['node2']).to.be.undefined;
                  expect(nodes['node3']).to.equal(5);

                  expect(removedNode).to.have.length(0);

                  proxy.resume();
                  setTimeout(() => {
                    testTimesCallback(
                      cluster,
                      (err, nodes) => {
                        cluster.end(() => {
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
    });

    it('get filtered', async function () {
      this.timeout(20000);
      const cluster = get3NodeCluster();
      try {
        const filteredCluster = cluster.of(/^node[12]/);
        const promises = [];
        for (let i = 0; i < 60; i++) {
          promises.push(getConnectionAndCheck(filteredCluster, /^node[12]/));
        }
        const results = await Promise.all(promises);
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
      } finally {
        await cluster.end();
      }
    });

    it('query on filtered', function (done) {
      this.timeout(10000);
      const cluster = get3NodeCluster();
      const filteredCluster = cluster.of(/^node[12]/);

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
          cluster.end().then(() => {
            done();
          });
        })
        .catch((err) => {
          cluster.end().then(() => {
            done(err);
          });
        });
    });

    it('query on filtered ORDER', function (done) {
      this.timeout(10000);
      const cluster = get3NodeCluster();
      const filteredCluster = cluster.of(/^node[12]/, 'ORDER');

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
          cluster.end().then(() => {
            done();
          });
        })
        .catch((err) => {
          cluster.end().then(() => {
            done(err);
          });
        });
    });

    it('ensure failing connection on pool not exiting application', async function () {
      this.timeout(5000);
      const cluster = baseCallback.createPoolCluster();
      const connOption1 = Object.assign({}, Conf.baseConfig, {
        port: 8888,
        initializationTimeout: 100
      });
      cluster.add('node1', connOption1);

      // pool will throw an error after some time and must not exit test suite
      await new Promise((resolve, reject) => {
        new setTimeout(resolve, 3000);
      });
      await cluster.end();
    });
  });

  const get3NodeCallbackCluster = (opts) => {
    const cluster = baseCallback.createPoolCluster(opts);

    const connOption1 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node1'",
      connectionLimit: 1,
      resetAfterUse: false,
      trace: true
    });
    const connOption2 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node2'",
      connectionLimit: 1,
      resetAfterUse: false,
      trace: true
    });
    const connOption3 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node3'",
      connectionLimit: 1,
      resetAfterUse: false,
      trace: true
    });

    cluster.add('node1', connOption1);
    cluster.add('node2', connOption2);
    cluster.add('node3', connOption3);
    return cluster;
  };

  const get3NodeCluster = (opts) => {
    const cluster = basePromise.createPoolCluster(opts);

    const connOption1 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node1'",
      connectionLimit: 1,
      resetAfterUse: false,
      trace: true
    });
    const connOption2 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node2'",
      connectionLimit: 1,
      resetAfterUse: false,
      trace: true
    });
    const connOption3 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node3'",
      connectionLimit: 1,
      resetAfterUse: false,
      trace: true
    });

    cluster.add('node1', connOption1);
    cluster.add('node2', connOption2);
    cluster.add('node3', connOption3);
    return cluster;
  };

  const get3NodeClusterWithProxy = async (opts, base) => {
    const cluster = base.createPoolCluster(opts);

    const connOption1 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node1'",
      connectionLimit: 1,
      resetAfterUse: false
    });
    const proxy = new Proxy({
      port: Conf.baseConfig.port,
      host: Conf.baseConfig.host,
      resetAfterUse: false,
      trace: true
    });
    await proxy.start();

    // permit proxy to start
    await new Promise((resolve, reject) => {
      new setTimeout(resolve, 20);
    });

    const connOption2 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node2'",
      connectionLimit: 1,
      host: 'localhost',
      connectTimeout: 200,
      socketTimeout: 200,
      acquireTimeout: 250,
      port: proxy.port(),
      resetAfterUse: false,
      trace: true
    });

    const connOption3 = Object.assign({}, Conf.baseConfig, {
      initSql: "set @node='node3'",
      connectionLimit: 1,
      resetAfterUse: false,
      trace: true
    });

    cluster.add('node1', connOption1);
    cluster.add('node2', connOption2);
    cluster.add('node3', connOption3);
    return { cluster: cluster, proxy: proxy };
  };

  const testTimes = async (cluster, filter, number) => {
    const promises = [];
    for (let i = 0; i < (number ? number : 9); i++) {
      promises.push(getConnectionAndCheck(cluster, filter));
    }
    const results = await Promise.all(promises);
    const nodes = {};
    results.forEach((res) => {
      if (nodes[res]) {
        nodes[res]++;
      } else {
        nodes[res] = 1;
      }
    });
    return nodes;
  };

  const testTimesWithError = (cluster, filter, number) => {
    const promises = [];
    for (let i = 0; i < (number ? number : 9); i++) {
      promises.push(getConnectionAndCheck(cluster, filter));
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

  const testTimesCallback = (cluster, cb, filter, number) => {
    const results = [];
    let idx = 0;
    if (!number) number = 9;
    for (let i = 0; i < number; i++) {
      getConnectionAndCheckCallback(cluster, filter, (err, res) => {
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

  const getConnectionAndCheck = async function (cluster, pattern) {
    let nodeName;
    const conn = await cluster.getConnection(pattern);
    const row = await conn.query('SELECT @node');
    nodeName = row[0]['@node'];
    const res = await conn.batch({ sql: 'INSERT INTO clusterInsert VALUES (?,?)', fullResult: false }, [
      [1, 'TOM'],
      [2, 'JERRY']
    ]);
    assert.equal(res.affectedRows, 2);
    conn.end();
    return nodeName;
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
