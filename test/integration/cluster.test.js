//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import Conf from '../conf.js';
import * as basePromise from '../../promise.js';
import * as baseCallback from '../../callback.js';
import Proxy from '../tools/proxy.js';
import { createConnection, isMaxscale } from '../base.js';
import { assert, expect, describe, test, beforeAll, afterAll, beforeEach } from 'vitest';

describe.sequential('cluster', function () {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
    await shareConn.query('DROP TABLE IF EXISTS clusterInsert');
    await shareConn.query('CREATE TABLE clusterInsert(id int, nam varchar(256))');
    await shareConn.query('FLUSH TABLES');
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });

  describe.sequential('promise', function () {
    beforeEach(async function () {
      await shareConn.query('TRUNCATE TABLE clusterInsert');
    });

    test('no node', async () => {
      const cluster = basePromise.createPoolCluster();
      try {
        await cluster.getConnection();
        throw new Error('must have thrown an error !');
      } catch (err) {
        expect(err.message).to.equal(
          'No node have been added to cluster or nodes have been removed due to too much connection error'
        );
      }
    });

    test('no pattern match', async () => {
      const cluster = basePromise.createPoolCluster();
      const connOption1 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node1'",
        connectionLimit: 1,
        resetAfterUse: false
      });

      cluster.add('node1', connOption1);
      try {
        await cluster.getConnection(/^M*$/);
        throw new Error('must have thrown an error !');
      } catch (err) {
        expect(err.message).to.have.string("No node found for pattern '/^M*$/'");
        await cluster.end();
      }
    });

    test('default id', async () => {
      const cluster = basePromise.createPoolCluster();
      const connOption1 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node1'",
        connectionLimit: 1,
        resetAfterUse: false
      });

      cluster.add(connOption1);
      const conn = await cluster.getConnection('PoolNode-0');
      await conn.end();
      await cluster.end();
    });

    test('pool full', async () => {
      const cluster = basePromise.createPoolCluster({ removeNodeErrorCount: 1 });
      const connOption1 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node1'",
        connectionLimit: 1,
        resetAfterUse: false,
        connectTimeout: 1000,
        acquireTimeout: 500
      });

      cluster.add(connOption1);
      let conn = await cluster.getConnection('PoolNode-0');
      try {
        let conn2 = await cluster.getConnection('PoolNode-0');
        await conn.release();
        await conn2.release();
        await cluster.end();
        throw new Error('must have thrown an error !');
      } catch (err) {
        expect(err.message).to.have.string('pool timeout: failed to retrieve a connection from pool after');
        expect(err.message).to.have.string('(pool connections: active=1 idle=0 limit=1)');
      }

      try {
        let conn2 = await cluster.getConnection('PoolNode-0');
        await conn.release();
        await conn2.release();
        await cluster.end();
        throw new Error('must have thrown an error !');
      } catch (err) {
        expect(err.message).to.have.string(
          'No node have been added to cluster or nodes have been removed due to too much connection error'
        );
      }
      try {
        let conn2 = await cluster.getConnection('PoolNode-0');
        await conn.release();
        await conn2.release();
        await cluster.end();
        throw new Error('must have thrown an error !');
      } catch (err) {
        expect(err.message).to.have.string(
          'No node have been added to cluster or nodes have been removed due to too much connection error'
        );
      }
      await conn.release();
      await cluster.end();
    }, 30000);

    test('cluster add error', async () => {
      const cluster = basePromise.createPoolCluster();
      const connOption1 = Object.assign({}, Conf.baseConfig, {
        connectionLimit: 1
      });

      cluster.add('node1', connOption1);
      try {
        cluster.add('node1', connOption1);
        cluster.end();
        throw new Error('must have thrown an error');
      } catch (e) {
        assert.isTrue(e.message.includes("Node identifier 'node1' already exist"));
        await cluster.end();
      }
    });

    test('end no configuration', async () => {
      const cluster = basePromise.createPoolCluster();
      await cluster.end();
    });

    test('select good pool', async () => {
      const cluster = get3NodeCluster();
      try {
        const res = await getConnectionAndCheck(cluster, /^node[01]$/);
        expect(res).to.equal('node1');
      } finally {
        await cluster.end();
      }
    });

    test('test wrong selector', async () => {
      const cluster = get3NodeCluster({ defaultSelector: 'WRONG' });
      try {
        await cluster.getConnection(/^node*/);
        throw new Error('must have thrown an error');
      } catch (err) {
        expect(err.message).to.equal("Wrong selector value 'WRONG'. Possible values are 'RR','RANDOM' or 'ORDER'");
        await cluster.end();
      }
    });

    test('select round-robin pools', async function () {
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

    test('remove/add nodes during use', async () => {
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
    }, 10000);

    test('select ordered pools', async () => {
      const cluster = get3NodeCluster({ defaultSelector: 'ORDER' });
      try {
        const nodes = await testTimes(cluster);
        expect(nodes['node1']).to.equal(9);
        expect(nodes['node2']).to.be.undefined;
        expect(nodes['node3']).to.be.undefined;
      } finally {
        await cluster.end();
      }
    }, 10000);

    test('select random pools', async function () {
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
    }, 10000);

    test('ensure selector filter', async function () {
      const cluster = get3NodeCluster();
      try {
        const nodes = await testTimes(cluster, /^node[12]/, 60);
        expect(nodes['node1']).to.equal(30);
        expect(nodes['node2']).to.equal(30);
        expect(nodes['node3']).to.be.undefined;
      } finally {
        await cluster.end();
      }
    }, 10000);

    test('ensure filtered command commands', async () => {
      const cluster = get3NodeCallbackCluster();
      const filteredCluster = cluster.of(/^node[12]/);
      await new Promise((resolve, reject) => {
        filteredCluster.query('SELECT 1+? as a', 1, (err, res) => {
          if (err) {
            reject(err);
          } else {
            filteredCluster.execute('SELECT 1,? as a', 1, (err, res) => {
              if (err) {
                reject(err);
              } else {
                cluster.end((err) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve();
                  }
                });
              }
            });
          }
        });
      });
    }, 10000);

    test("won't use bad host pools", async () => {
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
      await new Promise((resolve, reject) => {
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
                resolve();
              });
            }, 100);
          })
          .catch((err) => {
            cluster.end().then(() => {
              reject(err);
            });
          });
      });
    }, 10000);

    test("won't use bad host pools with rejection", async () => {
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
      await new Promise((resolve, reject) => {
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
                resolve();
              })
              .catch(reject);
          }, 100);
        });
      });
    }, 20000);

    test('one node failing', async ({ skip }) => {
      if (isMaxscale(shareConn)) return skip();
      const cluster = basePromise.createPoolCluster({});

      const proxy = new Proxy({
        port: Conf.baseConfig.port,
        host: Conf.baseConfig.host
      });
      await proxy.start();

      const connOption2 = Object.assign({}, Conf.baseConfig, {
        connectionLimit: 1,
        host: 'localhost',
        socketTimeout: 200,
        connectTimeout: 200,
        acquireTimeout: 500,
        minDelayValidation: 0,
        port: proxy.port(),
        resetAfterUse: false,
        trace: true
      });

      cluster.add('node2', connOption2);
      // wait for 100s so pool is loaded
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
    }, 30000);

    test('one node failing with blacklisted host', async ({ skip }) => {
      if (isMaxscale(shareConn)) return skip();

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
      // wait for 100s so pool is loaded
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
    }, 30000);

    test('reusing node after timeout', async () => {
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
      //wait for the socket to end.
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
    }, 30000);

    test('server close connection during query', async ({ skip }) => {
      if (isMaxscale(shareConn)) return skip();
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
      try {
        await filteredCluster.query('KILL CONNECTION_ID()');
        throw new Error('must have thrown error !');
      } catch (err) {
        assert.equal(err.sqlState, '70100');
        await cluster.end();
      }
    }, 20000);

    test('socket close connection during query', async ({ skip }) => {
      if (isMaxscale(shareConn)) return skip();
      if (!shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 1, 2)) return skip();

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
      try {
        await filteredCluster.query(
          'SET STATEMENT max_statement_time=1 FOR select c1.* from information_schema.columns as c1, ' +
            'information_schema.tables, information_schema.tables as t2'
        );
        throw new Error('must have throw an eror');
      } catch (err) {
        assert.equal(err.sqlState, '70100');
        await cluster.end();
      }
    }, 10000);

    test('get filtered', async () => {
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
    }, 10000);

    test('query on filtered', async () => {
      const cluster = get3NodeCluster();
      const filteredCluster = cluster.of(/^node[12]/);

      const promises = [];
      for (let i = 0; i < 60; i++) {
        promises.push(filteredCluster.query('SELECT @node'));
      }
      await new Promise((resolve, reject) => {
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
              resolve();
            });
          })
          .catch((err) => {
            cluster.end().then(() => {
              reject(err);
            });
          });
      });
    }, 10000);

    test('query on filtered ORDER', async () => {
      const cluster = get3NodeCluster();
      const filteredCluster = cluster.of(/^node[12]/, 'ORDER');

      const promises = [];
      for (let i = 0; i < 60; i++) {
        promises.push(filteredCluster.query('SELECT @node'));
      }
      await new Promise((resolve, reject) => {
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
              resolve();
            });
          })
          .catch((err) => {
            cluster.end().then(() => {
              reject(err);
            });
          });
      });
    }, 10000);

    test('execute on filtered ORDER', async () => {
      const cluster = get3NodeCluster();
      const filteredCluster = cluster.of(/^node[12]/, 'ORDER');

      const promises = [];
      for (let i = 0; i < 60; i++) {
        promises.push(filteredCluster.execute('SELECT @node'));
      }
      const results = await Promise.all(promises);
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
      await cluster.end();
    }, 10000);

    test('fail execute on filtered', async function () {
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
    }, 10000);

    test('fail execute on filtered without pool', async function () {
      const cluster = get3NodeCluster();
      const filteredCluster = cluster.of(/^node[56]/, 'ORDER');

      try {
        await filteredCluster.execute('wrong query');
        throw Error('error must have be thrown');
      } catch (err) {
        cluster.end();
        assert.isTrue(err.message.includes("No node found for pattern '/^node[56]/'"));
      }
    }, 10000);

    test('batch on filtered', async function () {
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
    }, 10000);

    test('batch error on filtered', async () => {
      const cluster = get3NodeCluster();
      const filteredCluster = cluster.of(/^node[12]/);

      try {
        await filteredCluster.batch('INSERT INTO notexistingtable(val) values (?)', [[1], [2], [3]]);
        throw new Error('must have thrown an error !');
      } catch (err) {
        expect(err.message).to.have.string("notexistingtable' doesn't exist");
      } finally {
        await cluster.end();
      }
    }, 10000);

    test('ensure failing connection on pool not exiting application', async function () {
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
    }, 5000);
  });

  describe.sequential('callback', () => {
    beforeEach(async function () {
      await shareConn.query('TRUNCATE TABLE clusterInsert');
    });

    test('no node', async () => {
      const cluster = baseCallback.createPoolCluster();
      await new Promise((resolve, reject) => {
        cluster.getConnection((err, conn) => {
          if (err) {
            expect(err.message).to.equal(
              'No node have been added to cluster or nodes have been removed due to too much connection error'
            );
            resolve();
          } else {
            reject(new Error('must have thrown an error !'));
          }
        });
      });
    });

    test('end with callback', async () => {
      const cluster = baseCallback.createPoolCluster();
      await new Promise((resolve, reject) => {
        cluster.end((err) => {
          if (err) {
            reject(err);
          } else resolve();
        });
      });
    });

    test('pool full', async () => {
      const cluster = baseCallback.createPoolCluster({ removeNodeErrorCount: 5 });
      const connOption1 = Object.assign({}, Conf.baseConfig, {
        initSql: "set @node='node1'",
        connectionLimit: 1,
        resetAfterUse: false,
        connectTimeout: 1000,
        acquireTimeout: 500
      });

      cluster.add(connOption1);
      await new Promise((resolve, reject) => {
        cluster.getConnection('PoolNode-0', (err, conn) => {
          if (err) {
            reject(err);
          } else {
            cluster.getConnection('PoolNode-0', (err, conn2) => {
              if (!err) {
                cluster.end();
                reject(new Error('must have thrown an error !'));
              } else {
                expect(err.message).to.have.string('pool timeout: failed to retrieve a connection from pool after');
                conn.end(() => {
                  cluster.end(resolve);
                });
              }
            });
          }
        });
      });
    }, 30000);

    test('end with bad callback parameter', async () => {
      const cluster = baseCallback.createPoolCluster();
      await new Promise((resolve, reject) => {
        try {
          cluster.end('wrong callback');
          reject(new Error('must have thrown an error !'));
        } catch (err) {
          expect(err.message).to.equal('callback parameter must be a function');
          resolve();
        } finally {
          cluster.end();
        }
      });
    });

    test('select good pool', async () => {
      const cluster = get3NodeCallbackCluster();

      await new Promise((resolve, reject) => {
        getConnectionAndCheckCallback(cluster, /^node[01]$/, (err, res) => {
          cluster.end(() => {
            if (err) {
              reject(err);
            } else {
              expect(res).to.equal('node1');
              resolve();
            }
          });
        });
      });
    });

    test('test wrong selector', async () => {
      const cluster = get3NodeCallbackCluster({ defaultSelector: 'WRONG' });
      const filteredCluster = cluster.of(/^node[12]/);
      await new Promise((resolve, reject) => {
        filteredCluster.getConnection((err, conn) => {
          cluster.end(() => {
            if (err) {
              expect(err.message).to.equal(
                "Wrong selector value 'WRONG'. Possible values are 'RR','RANDOM' or 'ORDER'"
              );
              resolve();
            } else {
              reject(new Error('must have thrown an error'));
            }
          });
        });
      });
    });

    test('select round-robin pools', async () => {
      const cluster = get3NodeCallbackCluster();
      await new Promise((resolve, reject) => {
        testTimesCallback(cluster, (err, nodes) => {
          cluster.end(() => {
            if (err) {
              reject(err);
            } else {
              expect(nodes['node1']).to.equal(3);
              expect(nodes['node2']).to.equal(3);
              expect(nodes['node3']).to.equal(3);
              resolve();
            }
          });
        });
      });
    });

    test('remove/add nodes during use', async () => {
      const cluster = get3NodeCallbackCluster();
      await new Promise((resolve, reject) => {
        testTimesCallback(cluster, (err, nodes) => {
          if (err) {
            cluster.end(() => {
              reject(err);
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
                  reject(err);
                });
              } else {
                expect(nodes['node1']).to.equal(3);
                expect(nodes['node2']).to.be.undefined;
                expect(nodes['node3']).to.equal(3);
                expect(nodes['node4']).to.equal(3);
                cluster.end(() => {
                  resolve();
                });
              }
            });
          }
        });
      });
    });

    test('select ordered pools', async () => {
      const cluster = get3NodeCallbackCluster({ defaultSelector: 'ORDER' });
      await new Promise((resolve, reject) => {
        testTimesCallback(cluster, (err, nodes) => {
          if (err) {
            cluster.end(() => {
              reject(err);
            });
          } else {
            expect(nodes['node1']).to.equal(9);
            expect(nodes['node2']).to.be.undefined;
            expect(nodes['node3']).to.be.undefined;
            cluster.end(() => {
              resolve();
            });
          }
        });
      });
    });

    test('select random pools', async () => {
      const cluster = get3NodeCallbackCluster({
        defaultSelector: 'RANDOM'
      });
      await new Promise((resolve, reject) => {
        const cb = (err, nodes) => {
          cluster.end(() => {
            if (err) {
              reject(err);
            } else {
              expect(nodes['node1']).to.be.below(40);
              expect(nodes['node1']).to.be.at.least(5);
              expect(nodes['node2']).to.be.below(40);
              expect(nodes['node2']).to.be.at.least(5);
              expect(nodes['node3']).to.be.below(40);
              expect(nodes['node3']).to.be.at.least(5);
              resolve();
            }
          });
        };

        testTimesCallback(cluster, cb, /^node*/, 60);
      });
    }, 10000);

    test('ensure selector filter', async () => {
      const cluster = get3NodeCallbackCluster();
      await new Promise((resolve, reject) => {
        const cb = (err, nodes) => {
          cluster.end(() => {
            if (err) {
              reject(err);
            } else {
              expect(nodes['node1']).to.equal(30);
              expect(nodes['node2']).to.equal(30);
              expect(nodes['node3']).to.be.undefined;
              resolve();
            }
          });
        };
        testTimesCallback(cluster, cb, /^node[12]/, 60);
      });
    }, 10000);

    test("won't use bad host pools", async () => {
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
      await new Promise((resolve, reject) => {
        const cb = (err, nodes) => {
          if (err) {
            cluster.end(() => {
              reject(err);
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
                resolve();
              });
            }, 100);
          }
        };
        testTimesCallback(cluster, cb, /^node[12]*/, 20);
      });
    }, 10000);

    test("won't use bad host pools with rejection", async () => {
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
      await new Promise((resolve, reject) => {
        const cb = (err, nodes) => {
          if (err) {
            cluster.end(() => {
              reject(err);
            });
          } else {
            expect(nodes['node1']).to.equal(4);
            expect(nodes['node2']).to.equal(3);
            expect(nodes['error']).to.equal(3);
            setTimeout(() => {
              expect(removedNode).to.have.length(1);
              expect(removedNode[0]).to.equal('node3');

              cluster.end(() => {
                resolve();
              });
            }, 100);
          }
        };

        testTimesCallback(cluster, cb, /^node*/, 10);
      });
    }, 20000);

    test('reusing node after timeout', async () => {
      await new Promise((resolve, reject) => {
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
              //wait for the socket to end.
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
                          resolve();
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
    });

    test('get filtered', async function () {
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
    }, 20000);

    test('query on filtered', async () => {
      const cluster = get3NodeCluster();
      const filteredCluster = cluster.of(/^node[12]/);

      const promises = [];
      for (let i = 0; i < 60; i++) {
        promises.push(filteredCluster.query('SELECT @node'));
      }
      await new Promise((resolve, reject) => {
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
              resolve();
            });
          })
          .catch((err) => {
            cluster.end().then(() => {
              reject(err);
            });
          });
      });
    }, 10000);

    test('query on filtered ORDER', async () => {
      const cluster = get3NodeCluster();
      const filteredCluster = cluster.of(/^node[12]/, 'ORDER');

      const promises = [];
      for (let i = 0; i < 60; i++) {
        promises.push(filteredCluster.query('SELECT @node'));
      }
      await new Promise((resolve, reject) => {
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
              resolve();
            });
          })
          .catch((err) => {
            cluster.end().then(() => {
              reject(err);
            });
          });
      });
    });

    test('ensure failing connection on pool not exiting application', async function () {
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
    }, 5000);
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
    await conn.end();
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
