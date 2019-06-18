'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const Conf = require('../conf');
const stream = require('stream');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Pool callback event', () => {
  it('pool connection creation', function(done) {
    this.timeout(5000);
    const pool = base.createPoolCallback();
    let connectionNumber = 0;
    pool.on('connection', conn => {
      assert.isTrue(conn !== undefined);
      connectionNumber++;
    });
    setTimeout(() => {
      assert.equal(connectionNumber, 10);
      pool.end();
      done();
    }, 2000);
  });

  it('pool connection acquire', function(done) {
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

  it('pool connection enqueue', function(done) {
    this.timeout(5000);
    const pool = base.createPoolCallback({ connectionLimit: 2 });
    let enqueueNumber = 0;
    let releaseNumber = 0;
    pool.on('enqueue', () => {
      enqueueNumber++;
    });
    pool.on('release', conn => {
      assert.isTrue(conn !== undefined);
      releaseNumber++;
    });

    setTimeout(() => {
      const requests = [];
      for (let i = 0; i < 499; i++) {
        requests.push(pool.query('SELECT ' + i));
      }
      pool.query('SELECT 499', (err, res) => {
        assert.isTrue(enqueueNumber <= 498);
        assert.isTrue(enqueueNumber > 490);
        setTimeout(() => {
          assert.equal(releaseNumber, 500);
          pool.end();
          done();
        }, 10);
      });
    }, 500);
  });
});
