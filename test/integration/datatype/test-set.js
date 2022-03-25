'use strict';

const base = require('../../base.js');
const { assert } = require('chai');
const { isXpand } = require('../../base');

describe('set', () => {
  it('set array', async function () {
    // https://jira.mariadb.org/browse/XPT-291
    if (isXpand()) this.skip();

    await shareConn.query('DROP TABLE IF EXISTS set_array');
    await shareConn.query("CREATE TABLE set_array(tt SET('v1','v2', 'v3'))");
    await shareConn.query(
      'INSERT INTO set_array values ' +
        "('v1'), " +
        "('v2'), " +
        "('v1,v2'), " +
        "('v3'), " +
        "('v3,v2'), " +
        "('')," +
        '(null)'
    );

    const expected = [
      { tt: ['v1'] },
      { tt: ['v2'] },
      { tt: ['v1', 'v2'] },
      { tt: ['v3'] },
      { tt: ['v2', 'v3'] },
      { tt: [] },
      { tt: null }
    ];
    let rows = await shareConn.query('SELECT * from set_array');
    assert.deepEqual(rows, expected);
    rows = await shareConn.execute('SELECT * from set_array');
    assert.deepEqual(rows, expected);
  });
});
