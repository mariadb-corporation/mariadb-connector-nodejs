//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2023 MariaDB Corporation Ab

'use strict';

const base = require('../../base.js');
const { assert } = require('chai');

describe('enum', async () => {
  it('enum type verification', async () => {
    await shareConn.query('DROP TABLE IF EXISTS fruits');
    await shareConn.query(
      'CREATE TABLE fruits (\n' +
        '  id INT NOT NULL auto_increment PRIMARY KEY,\n' +
        "  fruit ENUM('apple','orange','pear'),\n" +
        '  bushels INT)'
    );
    await shareConn.query('INSERT INTO fruits (fruit,bushels) VALUES (?, ?)', ['pear', 20]);
    await shareConn.query('INSERT INTO fruits (fruit,bushels) VALUES (?, ?)', ['apple', 100]);
    await shareConn.query('INSERT INTO fruits (fruit,bushels) VALUES (?, ?)', [2, 110]);
    await shareConn.query('INSERT INTO fruits (fruit,bushels) VALUES (?, ?)', [null, 120]);

    let rows = await shareConn.query('SELECT * FROM fruits');
    assert.deepEqual(rows, [
      { id: 1, fruit: 'pear', bushels: 20 },
      { id: 2, fruit: 'apple', bushels: 100 },
      { id: 3, fruit: 'orange', bushels: 110 },
      { id: 4, fruit: null, bushels: 120 }
    ]);

    rows = await shareConn.execute('SELECT * FROM fruits');
    assert.deepEqual(rows, [
      { id: 1, fruit: 'pear', bushels: 20 },
      { id: 2, fruit: 'apple', bushels: 100 },
      { id: 3, fruit: 'orange', bushels: 110 },
      { id: 4, fruit: null, bushels: 120 }
    ]);
  });

  it('enum type verification exec', async () => {
    await shareConn.query('DROP TABLE IF EXISTS fruitsExec');
    await shareConn.query(
      'CREATE TABLE fruitsExec (\n' +
        '  id INT NOT NULL auto_increment PRIMARY KEY,\n' +
        "  fruit ENUM('apple','orange','pear'),\n" +
        '  bushels INT)'
    );
    await shareConn.beginTransaction();
    await shareConn.execute('INSERT INTO fruitsExec (fruit,bushels) VALUES (?, ?)', ['pear', 20]);
    await shareConn.execute('INSERT INTO fruitsExec (fruit,bushels) VALUES (?, ?)', ['apple', 100]);
    await shareConn.execute('INSERT INTO fruitsExec (fruit,bushels) VALUES (?, ?)', [2, 110]);
    await shareConn.execute('INSERT INTO fruitsExec (fruit,bushels) VALUES (?, ?)', [null, 120]);

    let rows = await shareConn.execute('SELECT * FROM fruitsExec');
    assert.deepEqual(rows, [
      { id: 1, fruit: 'pear', bushels: 20 },
      { id: 2, fruit: 'apple', bushels: 100 },
      { id: 3, fruit: 'orange', bushels: 110 },
      { id: 4, fruit: null, bushels: 120 }
    ]);

    rows = await shareConn.execute('SELECT * FROM fruits');
    assert.deepEqual(rows, [
      { id: 1, fruit: 'pear', bushels: 20 },
      { id: 2, fruit: 'apple', bushels: 100 },
      { id: 3, fruit: 'orange', bushels: 110 },
      { id: 4, fruit: null, bushels: 120 }
    ]);
    shareConn.commit();
  });
});
