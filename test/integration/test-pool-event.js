'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const Conf = require('../conf');
const stream = require('stream');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Pool event', () => {
  before(function () {
    if (process.env.SKYSQL || process.env.SKYSQL_HA) this.skip();
  });

  it('pool connection creation', function (done) {
    this.timeout(5000);
    const pool = base.createPool();
    let connectionNumber = 0;
    pool.on('connection', (conn) => {
      assert.isTrue(conn !== undefined);
      connectionNumber++;
    });
    setTimeout(() => {
      assert.equal(connectionNumber, 10);
      pool.end();
      done();
    }, 2000);
  });

  it('pool connection acquire', function (done) {
    const pool = base.createPool({ connectionLimit: 2 });
    let acquireNumber = 0;
    pool.on('acquire', () => {
      acquireNumber++;
    });

    pool
      .query('SELECT 1')
      .then((res) => {
        assert.equal(acquireNumber, 1);
        return pool.getConnection();
      })
      .then((conn) => {
        assert.equal(acquireNumber, 2);
        conn.release();
        pool.end();
        done();
      })
      .catch(done);
  });

  it('pool connection enqueue', function (done) {
    this.timeout(20000);
    const pool = base.createPool({ connectionLimit: 2, acquireTimeout: 20000 });
    let enqueueNumber = 0;
    let releaseNumber = 0;
    pool.on('enqueue', () => {
      enqueueNumber++;
    });
    pool.on('release', (conn) => {
      assert.isTrue(conn !== undefined);
      releaseNumber++;
    });

    setTimeout(() => {
      const requests = [];
      for (let i = 0; i < 500; i++) {
        requests.push(pool.query('SELECT ' + i));
      }
      Promise.all(requests)
        .then(() => {
          assert.isTrue(enqueueNumber <= 498, enqueueNumber);
          assert.isTrue(enqueueNumber > 490, enqueueNumber);
          setTimeout(() => {
            assert.equal(releaseNumber, 500, releaseNumber);
            pool.end();
            done();
          }, 1000);
        })
        .catch(done);
    }, 500);
  });
});
