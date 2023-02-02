'use strict';

const base = require('../../base.js');
const { assert } = require('chai');
const { isXpand } = require('../../base');

describe('time', () => {
  it('time data', async function () {
    // skipping test for mysql since TIME doesn't have microseconds
    if (!shareConn.info.isMariaDB()) this.skip();

    await shareConn.query('DROP TABLE IF EXISTS time_data');
    await shareConn.query('CREATE TABLE time_data(t1 time(6), t2 time(6))');
    await shareConn.query('INSERT INTO time_data VALUES (?, ?)', ['-838:59:58', '-838:59:59.999999']);
    await shareConn.query('INSERT INTO time_data VALUES (?, ?)', ['-1:00:00', '25:00:00']);
    let results = await shareConn.query('SELECT * FROM time_data');
    assert.equal(results[0].t1, '-838:59:58.000000');
    assert.equal(results[0].t2, '-838:59:59.999999');
    assert.equal(results[1].t1, '-01:00:00.000000');
    assert.equal(results[1].t2, '25:00:00.000000');
    results = await shareConn.execute('SELECT * FROM time_data');
    assert.equal(results[0].t1, '-838:59:58');
    assert.equal(results[0].t2, '-838:59:59.999999');
    assert.equal(results[1].t1, '-01:00:00');
    assert.equal(results[1].t2, '25:00:00');
  });
});
