'use strict';

const base = require('../base.js');
const { assert } = require('chai');

describe('pipelining', () => {
  let conn1, conn2;
  const iterations = 500;

  before(function (done) {
    Promise.all([
      base.createConnection({ pipelining: false }),
      base.createConnection({ pipelining: true })
    ])
      .then((connections) => {
        conn1 = connections[0];
        conn2 = connections[1];
        done();
      })
      .catch(done);
  });

  after((done) => {
    conn1
      .end()
      .then(() => {
        return conn2.end();
      })
      .then(() => {
        done();
      })
      .catch(done);
  });

  it('simple query chain no pipelining', function (done) {
    conn1
      .query('DO 1')
      .then((rows) => {
        assert.deepEqual(rows, {
          affectedRows: 0,
          insertId: 0,
          warningStatus: 0
        });
        return conn1.query('DO 2');
      })
      .then((rows) => {
        assert.deepEqual(rows, {
          affectedRows: 0,
          insertId: 0,
          warningStatus: 0
        });
        done();
      })
      .catch(done);
  });

  it('pipelining without waiting for connect', function (done) {
    const conn = base.createCallbackConnection();
    conn.connect((err) => {});
    conn.query('DO 1');
    conn.query('SELECT 1', (err, rows) => {
      assert.deepEqual(rows, [{ 1: 1 }]);
      conn.end();
      done();
    });
  });

  it('500 insert test speed', function (done) {
    this.timeout(60000);
    let diff, pipelineDiff;
    conn1
      .query('DROP TABLE IF EXISTS pipeline1')
      .then(() => {
        return conn2.query('DROP TABLE IF EXISTS pipeline2');
      })
      .then(() => {
        return conn1.query('CREATE TABLE pipeline1 (test int)');
      })
      .then(() => {
        return conn2.query('CREATE TABLE pipeline2 (test int)');
      })
      .then(() => {
        return insertBulk(conn1, 'pipeline1');
      })
      .then((time) => {
        diff = time;
        return insertBulk(conn2, 'pipeline2');
      })
      .then((time) => {
        pipelineDiff = time;
        if (shareConn.info.hasMinVersion(10, 2, 0)) {
          //before 10.1, speed is sometime nearly equivalent using pipelining or not
          //remove speed test then to avoid random error in CIs
          if (
            diff[0] < pipelineDiff[0] ||
            (diff[0] === pipelineDiff[0] && diff[1] < pipelineDiff[1])
          ) {
            console.log(
              'time to insert 1000 : std=' +
                Math.floor(diff[0] * 1000 + diff[1] / 1000000) +
                'ms pipelining=' +
                Math.floor(pipelineDiff[0] * 1000 + pipelineDiff[1] / 1000000) +
                'ms'
            );
          }
        }
        done();
      })
      .catch(done);
  });

  function insertBulk(conn, tableName) {
    const startTime = process.hrtime();
    let ended = 0;
    return new Promise(function (resolve, reject) {
      for (let i = 0; i < iterations; i++) {
        conn
          .query('INSERT INTO ' + tableName + ' VALUES(?)', [i])
          .then(() => {
            if (++ended === iterations) {
              resolve(process.hrtime(startTime));
            }
          })
          .catch(reject);
      }
    });
  }
});
