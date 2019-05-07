'use strict';

const { assert } = require('chai');
const ConnOptions = require('../../../lib/config/connection-options');

describe('test connection options', () => {
  it('permitLocalInfile/pipelining combination ', () => {
    let opt = new ConnOptions();
    assert.isFalse(opt.permitLocalInfile);
    assert.isTrue(opt.pipelining);

    opt = new ConnOptions({ permitLocalInfile: false });
    assert.isFalse(opt.permitLocalInfile);
    assert.isTrue(opt.pipelining);

    opt = new ConnOptions({ permitLocalInfile: true });
    assert.isTrue(opt.permitLocalInfile);
    assert.isFalse(opt.pipelining);

    opt = new ConnOptions({ pipelining: false, permitLocalInfile: true });
    assert.isTrue(opt.permitLocalInfile);
    assert.isFalse(opt.pipelining);

    try {
      new ConnOptions({ pipelining: true, permitLocalInfile: true });
      throw new Error('Must have thrown error');
    } catch (e) {
      assert.isTrue(
        e.message.includes(
          'enabling options `permitLocalInfile` ' +
            'and `pipelining` is not possible, options are incompatible.'
        )
      );
    }
  });

  it('with options', () => {
    const result = new ConnOptions(
      'mariadb://root:pass@example.com:3307/db?metaAsArray=false&ssl=true&dateStrings=true'
    );
    assert.equal(result.database, 'db');
    assert.equal(result.host, 'example.com');
    assert.equal(result.metaAsArray, false);
    assert.equal(result.password, 'pass');
    assert.equal(result.dateStrings, true);
    assert.equal(result.port, 3307);
    assert.equal(result.ssl, true);
    assert.equal(result.user, 'root');
  });

  it('unknown option', () => {
    const result = new ConnOptions(
      'mariadb://root:pass@example.com:3307/db?wrongOption=false&ssl=true&dateStrings=true'
    );
    assert.equal(result.database, 'db');
    assert.equal(result.host, 'example.com');
    assert.equal(result.wrongOption, undefined);
    assert.equal(result.password, 'pass');
    assert.equal(result.dateStrings, true);
    assert.equal(result.port, 3307);
    assert.equal(result.ssl, true);
    assert.equal(result.user, 'root');
  });

  it('wrong maxAllowedPacket value', () => {
    try {
      new ConnOptions({ maxAllowedPacket: 'abc' });
      return new Error('must have thrown exception');
    } catch (e) {
      assert.isTrue(
        e.message.includes("maxAllowedPacket must be an integer. was 'abc'")
      );
    }
  });

  describe('parsing', () => {
    it('error', () => {
      try {
        ConnOptions.parse('mariadb://localhost/');
        throw new Error('must have thrown error !');
      } catch (e) {
        assert.isTrue(e.message.includes('error parsing connection string'));
      }
    });

    it('minimum', () => {
      const result = ConnOptions.parse('mariadb://localhost/db');
      assert.deepEqual(result, {
        user: undefined,
        password: undefined,
        host: 'localhost',
        port: undefined,
        database: 'db'
      });
    });

    it('minimum constructor', () => {
      const result = new ConnOptions('mariadb://localhost/db');
      assert.equal(result.port, 3306);
    });

    it('simple', () => {
      const result = ConnOptions.parse('mariadb://localhost:3307/db');
      assert.deepEqual(result, {
        user: undefined,
        password: undefined,
        host: 'localhost',
        port: 3307,
        database: 'db'
      });
    });

    it('simple with user/pwd', () => {
      const result = ConnOptions.parse('mariadb://root:pass@localhost:3307/db');
      assert.deepEqual(result, {
        user: 'root',
        password: 'pass',
        host: 'localhost',
        port: 3307,
        database: 'db'
      });
    });

    it('single option', () => {
      const result = ConnOptions.parse(
        'mariadb://root:pass@localhost:3307/db?metaAsArray=false'
      );
      assert.deepEqual(result, {
        database: 'db',
        host: 'localhost',
        metaAsArray: false,
        password: 'pass',
        port: 3307,
        user: 'root'
      });
    });

    it('unknown option', () => {
      const result = ConnOptions.parse(
        'mariadb://root:pass@localhost:3307/db?wrongOption=false'
      );
      assert.deepEqual(result, {
        database: 'db',
        host: 'localhost',
        password: 'pass',
        port: 3307,
        wrongOption: 'false',
        user: 'root'
      });
    });

    it('with options', () => {
      const result = ConnOptions.parse(
        'mariadb://root:pass@localhost:3307/db?metaAsArray=false&ssl=true&dateStrings=true&charset=latin1_swedish_ci&maxAllowedPacket=1048576&permitSetMultiParamEntries=true'
      );
      assert.deepEqual(result, {
        database: 'db',
        dateStrings: true,
        host: 'localhost',
        metaAsArray: false,
        password: 'pass',
        port: 3307,
        ssl: true,
        user: 'root',
        charset: 'latin1_swedish_ci',
        maxAllowedPacket: 1048576,
        permitSetMultiParamEntries: true
      });
    });
  });
});
