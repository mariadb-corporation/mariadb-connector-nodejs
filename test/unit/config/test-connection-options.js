'use strict';

const { assert } = require('chai');
const ConnOptions = require('../../../lib/config/connection-options');

describe('test connection options', () => {
  it('charset option', () => {
    let opt = new ConnOptions();
    assert.equal(opt.collation.name, 'UTF8MB4_UNICODE_CI');

    opt = new ConnOptions({ collation: 'utf8mb4_esperanto_ci' });
    assert.equal(opt.collation.name, 'UTF8MB4_ESPERANTO_CI');

    //for compatibility, but will be removed in the future
    opt = new ConnOptions({ charset: 'utf8mb4_esperanto_ci' });
    assert.equal(opt.collation.name, 'UTF8MB4_ESPERANTO_CI');

    opt = new ConnOptions({ charset: 'utf8' });
    assert.equal(opt.collation.name, 'UTF8_GENERAL_CI');

    opt = new ConnOptions({ charset: 'utf8mb4' });
    //yes standard default to UTF8MB4_GENERAL_CI, not UTF8MB4_UNICODE_CI
    assert.equal(opt.collation.name, 'UTF8MB4_GENERAL_CI');
  });

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

  it('unknown collation', () => {
    try {
      new ConnOptions({ collation: 'not_existing_collation' });
      throw new Error('Must have thrown error');
    } catch (e) {
      assert.isTrue(e.message.includes("Unknown collation 'not_existing_collation'"));
    }
  });

  it('timezone error', () => {
    try {
      new ConnOptions({ timezone: '+02:20' });
      throw new Error('Must have thrown error');
    } catch (e) {
      assert.isTrue(
        e.message.includes(
          "timezone format incompatible with IANA standard timezone format was '+02:20'"
        )
      );
    }
  });

  it('wrong format', () => {
    try {
      new ConnOptions(
        'mariasdb://root:pass@example.com:3307/db?metaAsArray=false&ssl=true&dateStrings=true'
      );
    } catch (e) {
      e.message.includes('error parsing connection string');
    }
  });

  it('with options', () => {
    const result = new ConnOptions(
      'mariadb://root:pass@example.com:3307/db?metaAsArray=false&ssl=true&dateStrings=true&charsetNumber=200'
    );
    assert.equal(result.database, 'db');
    assert.equal(result.host, 'example.com');
    assert.equal(result.metaAsArray, false);
    assert.equal(result.password, 'pass');
    assert.equal(result.dateStrings, true);
    assert.equal(result.port, 3307);
    assert.equal(result.ssl, true);
    assert.equal(result.user, 'root');
    assert.equal(result.collation.index, 200);
  });

  it('URL decoding test', () => {
    const result = new ConnOptions(
      'mariadb://root%C3%A5:p%40ssword@example.com:3307/%D1%88db?connectAttributes=%7B"par1":"bouh","par2":"bla"%7D'
    );
    assert.equal(result.database, 'шdb');
    assert.equal(result.host, 'example.com');
    assert.equal(result.password, 'p@ssword');
    assert.equal(result.keepAliveDelay, 0);
    assert.equal(result.port, 3307);
    assert.equal(result.user, 'rootå');
    assert.deepEqual(result.connectAttributes, { par1: 'bouh', par2: 'bla' });
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
      throw new Error('must have thrown exception');
    } catch (e) {
      assert.isTrue(e.message.includes("maxAllowedPacket must be an integer. was 'abc'"));
    }
  });

  it('wrong maxAllowedPacket value', () => {
    try {
      new ConnOptions({ collation: 'wrongcollation' });
      throw new Error('must have thrown exception');
    } catch (e) {
      assert.isTrue(e.message.includes("Unknown collation 'wrongcollation'"));
    }
  });

  it('wrong value is skipped charsetNumber', () => {
    const result = new ConnOptions(
      'mariadb://root:pass@example.com:3307/db?wrongOption=false&ssl=true&dateStrings=true&charsetNumber=aaa'
    );
    assert.equal(result.database, 'db');
    assert.isUndefined(result.charsetNumber);
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
      const result = ConnOptions.parse('mariadb://root:pass@localhost:3307/db?metaAsArray=false');
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
      const result = ConnOptions.parse('mariadb://root:pass@localhost:3307/db?wrongOption=false');
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
        'mariadb://root:pass@localhost:3307/db?metaAsArray=false&ssl=true&dateStrings=true&collation=latin1_swedish_ci&maxAllowedPacket=1048576&permitSetMultiParamEntries=true&keepAliveDelay=1000'
      );
      assert.deepEqual(result, {
        database: 'db',
        dateStrings: true,
        host: 'localhost',
        metaAsArray: false,
        keepAliveDelay: 1000,
        password: 'pass',
        port: 3307,
        ssl: true,
        user: 'root',
        collation: 'latin1_swedish_ci',
        maxAllowedPacket: 1048576,
        permitSetMultiParamEntries: true
      });
    });
  });
});
