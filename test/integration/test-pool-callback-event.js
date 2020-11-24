'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const Conf = require('../conf');
const stream = require('stream');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Pool callback event', () => {
  before(function () {
    if (process.env.SKYSQL != null || process.env.SKYSQL_HA != null) this.skip();
  });

  it('pool connection creation', function (done) {
    this.timeout(10000);
    const pool = base.createPoolCallback();
    let connectionNumber = 0;
    pool.on('connection', (conn) => {
      assert.isTrue(conn !== undefined);
      connectionNumber++;
    });
    setTimeout(() => {
      assert.equal(connectionNumber, 10);
      pool.end();
      done();
    }, 7000);
  });

  it('pool connection acquire', function (done) {
    const pool = base.createPoolCallback({ connectionLimit: 2 });
    let acquireNumber = 0;
    pool.on('acquire', () => {
      acquireNumber++;
    });

    pool.query('SELECT 1', (err, res) => {
      assert.equal(acquireNumber, 1);
      pool.getConnection((err, conn) => {
        assert.equal(acquireNumber, 2);
        conn.release();
        pool.end();
        done();
      });
    });
  });

  it('pool connection enqueue', function (done) {
    if (process.env.SKYSQL || process.env.SKYSQL_HA) this.skip();
    this.timeout(20000);
    const pool = base.createPoolCallback({ connectionLimit: 2, acquireTimeout: 20000 });
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
      for (let i = 0; i < 499; i++) {
        requests.push(pool.query('SELECT ' + i));
      }
      pool.query('SELECT 499', (err, res) => {
        assert.isTrue(enqueueNumber <= 499, enqueueNumber);
        assert.isTrue(enqueueNumber > 490, enqueueNumber);
        setTimeout(() => {
          assert.equal(releaseNumber, 500, releaseNumber);
          pool.end();
          done();
        }, 5000);
      });
    }, 1000);
  });
});
