'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isXpand } = require('../base');

describe('prepare and execute', () => {
  let bigVal;
  let maxAllowedSize;

  before(async function () {
    const row = await shareConn.query('SELECT @@max_allowed_packet as t');
    maxAllowedSize = Number(row[0].t);
    await shareConn.query('DROP TABLE IF EXISTS big_test_table');
    await shareConn.query('DROP TABLE IF EXISTS big_test_table2');
    await shareConn.query('CREATE TABLE big_test_table (a LONGTEXT, b BIGINT)');
    await shareConn.query('CREATE TABLE big_test_table2 (a LONGTEXT, b LONGTEXT)');
    await shareConn.query('FLUSH TABLES');
    let bigBuf = Buffer.alloc(16 * 1024 * 1024 - 22);
    for (let i = 0; i < bigBuf.length; i++) {
      bigBuf[i] = 97 + (i % 10);
    }
    bigVal = bigBuf.toString();
  });

  beforeEach(async function () {
    await shareConn.query('TRUNCATE big_test_table');
    await shareConn.query('TRUNCATE big_test_table2');
  });

  after(async function () {
    await shareConn.query('DROP TABLE IF EXISTS big_test_table');
    await shareConn.query('DROP TABLE IF EXISTS big_test_table2');
  });

  it('prepare error', async () => {
    const conn = await base.createConnection({ prepareCacheLength: 0 });
    try {
      await conn.prepare('wrong query');
      throw new Error('Expect error');
    } catch (err) {
      if (!isXpand()) {
        assert.isTrue(err.message.includes('You have an error in your SQL syntax'));
        assert.isTrue(err.message.includes('sql: wrong query'));
        assert.equal(err.sqlState, 42000);
      }
      assert.equal(err.errno, 1064);
      assert.equal(err.code, 'ER_PARSE_ERROR');
    }
    conn.end();
  });

  it('prepare close, no cache', async () => {
    const conn = await base.createConnection({ prepareCacheLength: 0 });
    const prepare = await conn.prepare('select ?', [2]);
    assert.equal(prepare.parameterCount, 1);
    assert.equal(prepare.columns.length, 1);
    prepare.close();
    conn.end();
  });

  it('prepare close with cache', async () => {
    const conn = await base.createConnection({ prepareCacheLength: 2 });
    for (let i = 0; i < 10; i++) {
      const prepare = await conn.prepare('select ' + i + ',?', [i]);
      assert.equal(prepare.parameterCount, 1);
      assert.equal(prepare.columns.length, 2);
      prepare.close();
    }
    conn.end();
  });

  it('prepare after prepare close - no cache', async () => {
    const conn = await base.createConnection({ prepareCacheLength: 0 });
    const prepare = await conn.prepare('select ?');
    await prepare.execute('1');
    await prepare.close();
    try {
      await prepare.execute('1');
      throw new Error('must have thrown error');
    } catch (e) {
      assert.isTrue(e.message.includes('Execute fails, prepare command as already been closed'));
    }

    const prepare2 = await conn.prepare('select ?');
    await prepare2.execute('2');
    await prepare2.close();

    conn.end();
  });

  it('prepare after prepare close - with cache', async () => {
    const conn = await base.createConnection({ prepareCacheLength: 2 });
    const prepare = await conn.prepare('select ?');
    await prepare.execute('1');
    await prepare.close();

    //in cache, so must still work
    await prepare.execute('1');

    await conn.execute('select 1, ?', ['2']);
    await conn.execute('select 2, ?', ['2']);
    await conn.execute('select 3, ?', ['2']);
    await conn.execute('select 4, ?', ['2']);

    //removed from cache, must really be closed
    try {
      await prepare.execute('1');
      throw new Error('must have thrown error');
    } catch (e) {
      assert.isTrue(e.message.includes('Execute fails, prepare command as already been closed'));
    }
    //not in cache, so re-prepare
    const prepare2 = await conn.prepare('select ?');
    await prepare2.execute('2');
    await prepare2.close();

    conn.end();
  });

  it('prepare cache reuse', async () => {
    const conn = await base.createConnection({ prepareCacheLength: 2 });
    let prepare = await conn.prepare('select ?', [1]);
    const initialPrepareId = prepare.id;

    prepare.close();
    await conn.prepare('select ? + 1', [1]);
    await conn.prepare('select ? + 2', [1]);
    await conn.prepare('select ? + 3', [1]);
    await conn.prepare({ sql: 'select ? + 3' }, [1]);
    await conn.prepare({ sql: 'select 4' });

    prepare = await conn.prepare('select ?', [1]);
    assert.notEqual(prepare.id, initialPrepareId);
    const secondPrepareId = prepare.id;
    for (let i = 0; i < 10; i++) {
      const prepare2 = await conn.prepare('select ?', [i]);
      assert.equal(prepare2.id, secondPrepareId);
      prepare2.close();
    }
    conn.end();
  });

  it('basic prepare and execute', async () => {
    const conn = await base.createConnection({ prepareCacheLength: 0 });
    // https://jira.mariadb.org/browse/XPT-266
    if (isXpand()) {
      await conn.query('SET NAMES UTF8');
    }
    const prepare = await conn.prepare('select ? as a');
    assert.equal(prepare.parameterCount, 1);
    assert.equal(prepare.columns.length, 1);

    let res = await prepare.execute([2]);
    assert.isTrue(res[0].a === 2 || res[0].a === 2n);

    res = await prepare.execute([3]);
    assert.isTrue(res[0].a === 3 || res[0].a === 3n);

    if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(8, 0, 0)) {
      res = await prepare.execute(['a']);
      assert.isTrue(res[0].a === 'a');
    }

    prepare.close();
    conn.end();
  });

  it('direct execution without cache', async () => {
    const conn = await base.createConnection({ prepareCacheLength: 0 });
    // https://jira.mariadb.org/browse/XPT-266
    if (isXpand()) {
      await conn.query('SET NAMES UTF8');
    }
    let res = await conn.execute('select ? as a', [2]);
    assert.isTrue(res[0].a === 2 || res[0].a === 2n);

    res = await conn.execute('select ? as a', [3]);
    assert.isTrue(res[0].a === 3 || res[0].a === 3n);

    res = await conn.execute('select ? as a', ['a']);
    if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(8, 0, 0)) {
      assert.isTrue(res[0].a === 'a');
    }
    conn.end();
  });

  it('direct execution with cache', async () => {
    const conn = await base.createConnection({});
    // https://jira.mariadb.org/browse/XPT-266
    if (isXpand()) {
      await conn.query('SET NAMES UTF8');
    }
    let res = await conn.execute('select ? as a', [2]);
    assert.isTrue(res[0].a === 2 || res[0].a === 2n);

    res = await conn.execute('select ? as a', [3]);
    assert.isTrue(res[0].a === 3 || res[0].a === 3n);

    res = await conn.execute('select ? as a', ['a']);
    if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(8, 0, 0)) {
      assert.isTrue(res[0].a === 'a');
    }
    conn.end();
  });

  it('execution with namedPlaceholders', async () => {
    const conn = await base.createConnection({ namedPlaceholders: true });

    let res = await conn.execute('select :param2 as a, :param1 as b', { param1: 2, param2: 3 });
    assert.isTrue(res[0].a === 3 || res[0].a === 3n);
    assert.isTrue(res[0].b === 2 || res[0].b === 2n);

    try {
      await conn.execute('select :param2 as a, :param1 as b', { param1: 2, param3: 3 });
      throw new Error('must have throw error');
    } catch (e) {
      assert.isTrue(e.message.includes('Parameter named param2 is not set'));
    }

    conn.end();
  });

  it('prepare buffer overflow bigint', async function () {
    if (maxAllowedSize < 20 * 1024 * 1024) this.skip();
    this.timeout(30000);
    const conn = await base.createConnection({ prepareCacheLength: 0 });
    // https://jira.mariadb.org/browse/XPT-266
    if (isXpand()) {
      await conn.query('SET NAMES UTF8');
    }
    await conn.query('START TRANSACTION');
    const prepare = await conn.prepare('INSERT INTO big_test_table (a,b) VALUES (?, ?)');
    await prepare.execute([bigVal, 2n]);
    prepare.close();
    const res = await conn.query('SELECT * from big_test_table');
    assert.equal(res[0].a, bigVal);
    assert.equal(res[0].b, 2n);
    conn.end();
  });

  it('execute stack trace', async function () {
    if (process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    const conn = await base.createConnection({ trace: true });
    try {
      await conn.execute('wrong query');
      throw Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.stack.includes('test-execute.js:'), err.stack);
    } finally {
      await conn.end();
    }
  });

  it('execute wrong param stack trace', async function () {
    if (process.env.srv === 'skysql' || process.env.srv === 'skysql-ha') this.skip();
    const conn = await base.createConnection({ trace: true });
    try {
      await conn.execute('SELECT ?', []);
      throw Error('must have thrown error');
    } catch (err) {
      assert.isTrue(err.stack.includes('test-execute.js:'), err.stack);
    } finally {
      await conn.end();
    }
  });

  it('prepare buffer overflow writeInt16', async function () {
    if (maxAllowedSize < 20 * 1024 * 1024) this.skip();
    this.timeout(30000);
    let val = Buffer.alloc(300);
    for (let i = 0; i < val.length; i++) {
      val[i] = 97 + (i % 10);
    }
    const stVal = val.toString();
    const conn = await base.createConnection({ prepareCacheLength: 0 });
    // https://jira.mariadb.org/browse/XPT-266
    if (isXpand()) {
      await conn.query('SET NAMES UTF8');
    }
    await conn.query('START TRANSACTION');
    const prepare = await conn.prepare('INSERT INTO big_test_table2 (a,b) VALUES (?, ?)');
    await prepare.execute([bigVal, stVal]);
    prepare.close();
    const res = await conn.query('SELECT * from big_test_table2');
    assert.equal(res[0].a, bigVal);
    assert.equal(res[0].b, stVal);
    conn.end();
  });

  it('prepare buffer overflow writeInt24', async function () {
    if (maxAllowedSize < 20 * 1024 * 1024) this.skip();
    this.timeout(30000);
    let val = Buffer.alloc(70000);
    for (let i = 0; i < val.length; i++) {
      val[i] = 97 + (i % 10);
    }
    const stVal = val.toString();

    const conn = await base.createConnection({ prepareCacheLength: 0 });
    // https://jira.mariadb.org/browse/XPT-266
    if (isXpand()) {
      await conn.query('SET NAMES UTF8');
    }
    await conn.query('START TRANSACTION');
    const prepare = await conn.prepare('INSERT INTO big_test_table2 (a,b) VALUES (?, ?)');
    await prepare.execute([bigVal, stVal]);
    prepare.close();
    const res = await conn.query('SELECT * from big_test_table2');
    assert.equal(res[0].a, bigVal);
    assert.equal(res[0].b, stVal);
    conn.end();
  });

  it('prepare buffer overflow double', async function () {
    if (maxAllowedSize < 20 * 1024 * 1024) this.skip();
    this.timeout(30000);
    const conn = await base.createConnection({ prepareCacheLength: 0 });
    // https://jira.mariadb.org/browse/XPT-266
    if (isXpand()) {
      await conn.query('SET NAMES UTF8');
    }
    await conn.query('START TRANSACTION');
    const prepare = await conn.prepare('INSERT INTO big_test_table2 (a,b) VALUES (?, ?)');
    await prepare.execute([bigVal, 2.156]);
    await prepare.execute(['t', 3.156]);
    prepare.close();
    const res = await conn.query('SELECT * from big_test_table2');
    assert.equal(res[0].a, bigVal);
    assert.equal(res[0].b, 2.156);
    assert.equal(res[1].a, 't');
    assert.equal(res[1].b, 3.156);
    conn.end();
  });

  it('prepare buffer overflow string', async function () {
    if (maxAllowedSize < 20 * 1024 * 1024) this.skip();
    this.timeout(30000);
    const conn = await base.createConnection({ prepareCacheLength: 0 });
    // https://jira.mariadb.org/browse/XPT-266
    if (isXpand()) {
      await conn.query('SET NAMES UTF8');
    }
    await conn.query('START TRANSACTION');
    const prepare = await conn.prepare('INSERT INTO big_test_table2 (a,b) VALUES (?, ?)');
    await prepare.execute([bigVal, 'test']);
    prepare.close();
    const res = await conn.query('SELECT * from big_test_table2');
    assert.equal(res[0].a, bigVal);
    assert.equal(res[0].b, 'test');
    conn.end();
  });

  it('prepare buffer overflow string iconv', async function () {
    if (maxAllowedSize < 20 * 1024 * 1024) this.skip();
    if (isXpand()) this.skip();
    this.timeout(30000);
    const conn = await base.createConnection({ prepareCacheLength: 0, charset: 'big5' });
    // https://jira.mariadb.org/browse/XPT-266
    if (isXpand()) {
      await conn.query('SET NAMES UTF8');
    }
    await conn.query('START TRANSACTION');
    const prepare = await conn.prepare('INSERT INTO big_test_table2 (a,b) VALUES (?, ?)');
    await prepare.execute([bigVal, 'test']);
    prepare.close();
    const res = await conn.query('SELECT * from big_test_table2');
    assert.equal(res[0].a, bigVal);
    assert.equal(res[0].b, 'test');
    conn.end();
  });

  it('prepare buffer overflow date', async function () {
    if (maxAllowedSize < 20 * 1024 * 1024) this.skip();
    this.timeout(30000);
    const date3 = new Date('2001-12-31 23:59:59.123456');
    const conn = await base.createConnection({ prepareCacheLength: 0 });
    // https://jira.mariadb.org/browse/XPT-266
    if (isXpand()) {
      await conn.query('SET NAMES UTF8');
    }
    await conn.query('START TRANSACTION');
    const prepare = await conn.prepare('INSERT INTO big_test_table2 (a,b) VALUES (?, ?)');
    await prepare.execute([bigVal, date3]);
    prepare.close();
    const res = await conn.query('SELECT * from big_test_table2');
    assert.equal(res[0].a, bigVal);
    assert.isTrue(res[0].b.includes('2001-12-31 23:59:59'));
    conn.end();
  });

  it('prepare buffer overflow empty packet', async function () {
    if (maxAllowedSize < 20 * 1024 * 1024) this.skip();
    this.timeout(30000);
    const conn = await base.createConnection({ prepareCacheLength: 0 });
    // https://jira.mariadb.org/browse/XPT-266
    if (isXpand()) {
      await conn.query('SET NAMES UTF8');
    }
    await conn.query('START TRANSACTION');
    const prepare = await conn.prepare('INSERT INTO big_test_table2 (a,b) VALUES (?, ?)');
    await prepare.execute([bigVal, true]);
    conn.debug(true);
    await prepare.execute([bigVal, false]);
    conn.debug(false);
    prepare.close();
    const res = await conn.query('SELECT * from big_test_table2');
    assert.equal(res[0].a, bigVal);
    assert.equal(res[0].b, '1');
    assert.equal(res[1].a, bigVal);
    assert.equal(res[1].b, '0');
    conn.end();
  });

  it('prepare streaming', async function () {
    // skipping for mariadb until https://jira.mariadb.org/browse/MDEV-25839 is solved.
    if (shareConn.info.isMariaDB() || !shareConn.info.hasMinVersion(10, 3, 0)) this.skip();
    this.timeout(30000);

    const data = 'you rocks 🔥';
    const fileName = path.join(os.tmpdir(), Math.random() + 'tempExecuteFile.txt');
    fs.writeFileSync(fileName, data, 'utf8');

    const conn = await base.createConnection({ prepareCacheLength: 0 });
    await conn.query('START TRANSACTION');
    const prepare = await conn.prepare('INSERT INTO big_test_table2 (a,b) VALUES (?, ?)');
    await prepare.execute([true, fs.createReadStream(fileName)]);
    await prepare.execute([fs.createReadStream(fileName), fs.createReadStream(fileName)]);
    await prepare.execute([fs.createReadStream(fileName), false]);
    prepare.close();
    const res = await conn.query('SELECT * from big_test_table2');

    assert.equal(res[0].a, '1');
    assert.equal(res[0].b, data);
    assert.equal(res[1].a, data);
    assert.equal(res[1].b, data);
    assert.equal(res[2].a, data);
    assert.equal(res[2].b, '0');
    conn.end();
    fs.unlink(fileName, (err) => {
      if (err) console.log(err);
    });
  });
});
