'use strict';

const { assert } = require('chai');
const PoolOptions = require('../../../lib/config/pool-options');

describe('test pool options', () => {
  it('with options', () => {
    const result = new PoolOptions(
      'mariadb://root:pass@example.com:3307/db?metaAsArray=false&ssl=true&dateStrings=true&resetAfterUse=false&acquireTimeout=200&connectionLimit=2&minDelayValidation=100&minimumIdle=2&noControlAfterUse=true&initializationTimeout=200'
    );
    assert.equal(result.connOptions.database, 'db');
    assert.equal(result.connOptions.host, 'example.com');
    assert.equal(result.connOptions.metaAsArray, false);
    assert.equal(result.connOptions.password, 'pass');
    assert.equal(result.connOptions.dateStrings, true);
    assert.equal(result.connOptions.port, 3307);
    assert.equal(result.connOptions.ssl, true);
    assert.equal(result.connOptions.user, 'root');
    assert.equal(result.resetAfterUse, false);
    assert.equal(result.acquireTimeout, 200);
    assert.equal(result.connectionLimit, 2);
    assert.equal(result.minDelayValidation, 100);
    assert.equal(result.minimumIdle, 2);
    assert.equal(result.noControlAfterUse, true);
    assert.equal(result.initializationTimeout, 200);
  });

  it('with other options', () => {
    const result = new PoolOptions(
      'mariadb://root:pass@example.com:3307/db?metaAsArray=true&ssl=false&dateStrings=false&resetAfterUse=true&acquireTimeout=800&connectionLimit=2&minDelayValidation=100&minimumIdle=2&noControlAfterUse=false&initializationTimeout=300'
    );
    assert.equal(result.connOptions.database, 'db');
    assert.equal(result.connOptions.host, 'example.com');
    assert.equal(result.connOptions.metaAsArray, true);
    assert.equal(result.connOptions.password, 'pass');
    assert.equal(result.connOptions.dateStrings, false);
    assert.equal(result.connOptions.port, 3307);
    assert.equal(result.connOptions.ssl, false);
    assert.equal(result.connOptions.user, 'root');
    assert.equal(result.resetAfterUse, true);
    assert.equal(result.acquireTimeout, 800);
    assert.equal(result.connectionLimit, 2);
    assert.equal(result.minDelayValidation, 100);
    assert.equal(result.minimumIdle, 2);
    assert.equal(result.noControlAfterUse, false);
    assert.equal(result.initializationTimeout, 300);
  });
});
