//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import { createConnection, isWindows } from '../base.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import Conf from '../conf.js';

describe.concurrent('local-infile', () => {
  const smallFileName = path.join(os.tmpdir(), 'smallLocalInfile.txt');
  const smallFileName2 = path.join(os.tmpdir(), 'smallLocalInfile2.txt');
  const smallFileName3 = path.join(os.tmpdir(), 'smallLocalInfile3.txt');
  const smallFileName4 = path.join(os.tmpdir(), 'smallLocalInfile4.txt');
  const smallFileName5 = path.join(os.tmpdir(), 'smallLocalInfile5.txt');
  const nonReadableFile = path.join(os.tmpdir(), 'nonReadableFile.txt');
  const bigFileName = path.join(os.tmpdir(), 'bigLocalInfile.txt');
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
    fs.unlink(smallFileName, (err) => {});
    fs.unlink(smallFileName2, (err) => {});
    fs.unlink(smallFileName3, (err) => {});
    fs.unlink(smallFileName4, (err) => {});
    fs.unlink(smallFileName5, (err) => {});
    fs.unlink(nonReadableFile, (err) => {});
    fs.unlink(bigFileName, (err) => {});
  });

  test('local infile disable when permitLocalInfile option is set', async () => {
    const conn = await createConnection({ permitLocalInfile: false });
    let errorFound = false;
    try {
      await conn.query("LOAD DATA LOCAL INFILE 'dummy.tsv' INTO TABLE t (id, test)");
    } catch (err) {
      errorFound = true;
      switch (err.code) {
        case 'ER_LOAD_INFILE_CAPABILITY_DISABLED':
          assert.equal(err.errno, 4166);
          assert.equal(err.sqlState, 'HY000');
          break;
        case 'ER_NO_SUCH_TABLE':
          assert.equal(err.errno, 1146);
          assert.equal(err.sqlState, 'HY000');
          break;
        default:
          assert.isTrue(err.errno === 1148 || err.errno === 3948);
          assert.equal(err.sqlState, '42000');
          break;
      }
      assert(!err.fatal);
    }
    await conn.end();
    if (!errorFound) {
      throw new Error('must have thrown error !');
    }
  });

  test('local infile disable when pipelining option is set', async () => {
    const conn = await createConnection({ pipelining: true });
    try {
      await conn.query("LOAD DATA LOCAL INFILE 'dummy.tsv' INTO TABLE t (id, test)");
      throw new Error('must have thrown error !');
    } catch (err) {
      switch (err.code) {
        case 'ER_LOAD_INFILE_CAPABILITY_DISABLED':
          assert.equal(err.errno, 4166);
          assert.equal(err.sqlState, 'HY000');
          break;
        case 'ER_NO_SUCH_TABLE':
          assert.equal(err.errno, 1146);
          assert.equal(err.sqlState, 'HY000');
          break;
        default:
          assert.isTrue(err.errno === 1148 || err.errno === 3948);
          assert.equal(err.sqlState, '42000');
          break;
      }
    }
    await conn.end();
  });

  test('local infile and init functions', async () => {
    const conn = await createConnection({ permitLocalInfile: true, initSql: "set time_zone='+00:00'" });
    await conn.query('SELECT 1');
    await conn.end();
  });

  test('local infile disable using default options', async () => {
    const conn = await createConnection({ pipelining: undefined, permitLocalInfile: undefined });
    try {
      await conn.query("LOAD DATA LOCAL INFILE 'dummy.tsv' INTO TABLE t (id, test)");
      throw new Error('must have thrown error !');
    } catch (err) {
      switch (err.code) {
        case 'ER_LOAD_INFILE_CAPABILITY_DISABLED':
          assert.equal(err.errno, 4166);
          assert.equal(err.sqlState, 'HY000');
          break;
        case 'ER_NO_SUCH_TABLE':
          assert.equal(err.errno, 1146);
          assert.equal(err.sqlState, 'HY000');
          break;
        default:
          assert.isTrue(err.errno === 1148 || err.errno === 3948);
          assert.equal(err.sqlState, '42000');
          break;
      }
      assert(!err.fatal);
    }
    await conn.end();
  });

  test('file error missing', async ({ skip }) => {
    const rows = await shareConn.query('select @@local_infile');
    if (rows[0]['@@local_infile'] === 0 || (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0))) {
      return skip();
    }
    const conn = await createConnection({ permitLocalInfile: true });
    await shareConn.query('DROP TABLE IF EXISTS smallLocalInfile');
    await conn.query('CREATE TABLE smallLocalInfile(id int, test varchar(100))');
    try {
      await conn.query(
        "LOAD DATA LOCAL INFILE '" +
          path.join(os.tmpdir(), 'notExistFile.txt').replace(/\\/g, '/') +
          "' INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)"
      );
      throw new Error('must have thrown error !');
    } catch (err) {
      assert(err.message.includes('LOCAL INFILE command failed: ENOENT: no such file or directory'));
      assert.equal(err.sqlState, '22000');
      assert(!err.fatal);
      await conn.end();
    }
  });

  test('small local infile', async ({ skip }) => {
    const rows = await shareConn.query('select @@local_infile');
    if (rows[0]['@@local_infile'] === 0 || (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0))) {
      return skip();
    }
    await new Promise(function (resolve, reject) {
      fs.writeFile(smallFileName, '1,hello\n2,world\n', 'utf8', function (err) {
        if (err) reject(err);
        else resolve();
      });
    });
    const conn = await createConnection({ permitLocalInfile: true });
    await conn.query('DROP TABLE IF EXISTS smallLocalInfile7');
    await conn.query('CREATE TABLE smallLocalInfile7(id int, test varchar(100))');
    await conn.beginTransaction();
    await conn.query(
      "LOAD DATA LOCAL INFILE '" +
        smallFileName.replace(/\\/g, '\\\\') +
        "' INTO TABLE smallLocalInfile7 FIELDS TERMINATED BY ',' (id, test)"
    );
    const rows2 = await conn.query('SELECT * FROM smallLocalInfile7');
    assert.deepEqual(rows2, [
      { id: 1, test: 'hello' },
      { id: 2, test: 'world' }
    ]);
    await conn.end();
  });

  test('small infileStreamFactory connection lvl', async ({ skip }) => {
    const rows = await shareConn.query('select @@local_infile');
    if (rows[0]['@@local_infile'] === 0 || (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0))) {
      return skip();
    }
    await new Promise(function (resolve, reject) {
      fs.writeFile(smallFileName2, '1,hello\n2,world\n', 'utf8', function (err) {
        if (err) reject(err);
        else resolve();
      });
    });
    const conn = await createConnection({
      permitLocalInfile: true,
      infileStreamFactory: () => {
        return fs.createReadStream(smallFileName2);
      }
    });
    await conn.query('DROP TABLE IF EXISTS smallLocalInfile2');
    await conn.query('CREATE TABLE smallLocalInfile2(id int, test varchar(100))');
    await conn.beginTransaction();
    await conn.query(
      "LOAD DATA LOCAL INFILE 'no_file' INTO TABLE smallLocalInfile2 FIELDS TERMINATED BY ',' (id, test)"
    );
    const rows2 = await conn.query('SELECT * FROM smallLocalInfile2');
    assert.deepEqual(rows2, [
      { id: 1, test: 'hello' },
      { id: 2, test: 'world' }
    ]);
    await conn.end();
  });

  test('infileStreamFactory Error', async ({ skip }) => {
    const rows = await shareConn.query('select @@local_infile');
    if (rows[0]['@@local_infile'] === 0 || (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0))) {
      return skip();
    }

    const conn = await createConnection({
      permitLocalInfile: true,
      infileStreamFactory: () => {
        throw new Error('Expect to throw Error');
      }
    });
    await conn.query('DROP TABLE IF EXISTS smallLocalInfile3');
    await conn.query('CREATE TABLE smallLocalInfile3(id int, test varchar(100))');
    await conn.beginTransaction();
    try {
      await conn.query(
        "LOAD DATA LOCAL INFILE 'no_file' INTO TABLE smallLocalInfile3 FIELDS TERMINATED BY ',' (id, test)"
      );
      throw new Error('Expect to have thrown an error');
    } catch (err) {
      assert.equal(err.errno, 45022);
      assert.equal(err.sqlState, '22000');
    }
    const rows2 = await conn.query('SELECT * FROM smallLocalInfile3');
    assert.deepEqual(rows2, []);
    await conn.end();
  });

  test('small infileStreamFactory query lvl', async ({ skip }) => {
    const rows = await shareConn.query('select @@local_infile');
    if (rows[0]['@@local_infile'] === 0 || (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0))) {
      return skip();
    }
    await new Promise(function (resolve, reject) {
      fs.writeFile(smallFileName3, '1,hello\n2,world\n', 'utf8', function (err) {
        if (err) reject(err);
        else resolve();
      });
    });
    const conn = await createConnection({ permitLocalInfile: true });
    await conn.query('DROP TABLE IF EXISTS smallLocalInfile4');
    await conn.query('CREATE TABLE smallLocalInfile4(id int, test varchar(100))');
    await conn.beginTransaction();
    await conn.query({
      sql: "LOAD DATA LOCAL INFILE 'no_file' INTO TABLE smallLocalInfile4 FIELDS TERMINATED BY ',' (id, test)",
      infileStreamFactory: () => {
        return fs.createReadStream(smallFileName3);
      }
    });
    const rows2 = await conn.query('SELECT * FROM smallLocalInfile4');
    assert.deepEqual(rows2, [
      { id: 1, test: 'hello' },
      { id: 2, test: 'world' }
    ]);
    await conn.end();
  });

  test('small local infile with parameter', async ({ skip }) => {
    const rows = await shareConn.query('select @@local_infile');
    if (rows[0]['@@local_infile'] === 0 || (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0))) {
      return skip();
    }
    await new Promise(function (resolve, reject) {
      fs.writeFile(smallFileName4, '1,hello\n2,world\n', 'utf8', function (err) {
        if (err) reject(err);
        else resolve();
      });
    });
    const conn = await createConnection({ permitLocalInfile: true });
    await conn.query('DROP TABLE IF EXISTS smallLocalInfile5');
    await conn.query('CREATE TABLE smallLocalInfile5(id int, test varchar(100))');
    await conn.beginTransaction();
    await conn.query(
      "LOAD DATA LOCAL INFILE ? INTO TABLE smallLocalInfile5 FIELDS TERMINATED BY ',' (id, test)",
      smallFileName4
    );
    await conn.query("LOAD DATA LOCAL INFILE ? INTO TABLE smallLocalInfile5 FIELDS TERMINATED BY ',' (id, test)", [
      smallFileName4
    ]);

    const rows2 = await conn.query('SELECT * FROM smallLocalInfile5');
    assert.deepEqual(rows2, [
      { id: 1, test: 'hello' },
      { id: 2, test: 'world' },
      { id: 1, test: 'hello' },
      { id: 2, test: 'world' }
    ]);
    await conn.end();
  });

  test('small local infile with non supported node.js encoding', async ({ skip }) => {
    const rows = await shareConn.query('select @@local_infile');
    if (rows[0]['@@local_infile'] === 0 || (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0))) {
      return skip();
    }

    await new Promise(function (resolve, reject) {
      fs.writeFile(smallFileName5, '1,hello\n2,world\n', 'utf8', function (err) {
        if (err) reject(err);
        else resolve();
      });
    });
    const conn = await createConnection({ permitLocalInfile: true, charset: 'big5' });
    await conn.query('DROP TABLE IF EXISTS smallLocalInfile6');
    await conn.query('CREATE TABLE smallLocalInfile6(id int, test varchar(100))');
    await conn.beginTransaction();
    await conn.query(
      "LOAD DATA LOCAL INFILE '" +
        smallFileName5.replace(/\\/g, '/') +
        "' INTO TABLE smallLocalInfile6 FIELDS TERMINATED BY ',' (id, test)"
    );
    const rows2 = await conn.query('SELECT * FROM smallLocalInfile6');
    assert.deepEqual(rows2, [
      { id: 1, test: 'hello' },
      { id: 2, test: 'world' }
    ]);
    await conn.end();
  });

  test('non readable local infile', async ({ skip }) => {
    //on windows, fs.chmodSync doesn't remove read access.
    if (isWindows()) return skip();

    const rows = await shareConn.query('select @@local_infile');
    if (rows[0]['@@local_infile'] === 0 || (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0))) {
      return skip();
    }

    await new Promise(function (resolve, reject) {
      fs.writeFile(nonReadableFile, '1,hello\n2,world\n', 'utf8', function (err) {
        if (err) reject(err);
        else resolve();
      });
    });
    fs.chmodSync(nonReadableFile, 0o222);
    const conn = await createConnection({ permitLocalInfile: true });
    await conn.query('DROP TABLE IF EXISTS nonReadableFile');
    await conn.query('CREATE TABLE nonReadableFile(id int, test varchar(100))');
    try {
      await conn.query(
        "LOAD DATA LOCAL INFILE '" +
          nonReadableFile.replace(/\\/g, '/') +
          "' INTO TABLE nonReadableFile FIELDS TERMINATED BY ',' (id, test)"
      );
      // expected result is to throw error, but superuser might still read file.
    } catch (err) {
      assert.equal(err.sqlState, '22000');
      assert(!err.fatal);
    }
    await conn.end();
  });

  test('big local infile', async ({ skip }) => {
    let size;
    let rows = await shareConn.query('select @@local_infile');
    if (rows[0]['@@local_infile'] === 0 || (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0))) {
      return skip();
    }

    rows = await shareConn.query('SELECT @@max_allowed_packet as t');
    const maxAllowedSize = Number(rows[0].t);
    if (maxAllowedSize > 50000000) return skip();
    size = Math.round((maxAllowedSize - 300) / 16);
    const header = '"a","b"\n';
    const headerLen = header.length;
    const buf = Buffer.allocUnsafe(size * 16 + headerLen);
    buf.write(header);
    for (let i = 0; i < size; i++) {
      buf.write('"a' + padStartZero(i, 8) + '","b"\n', i * 16 + headerLen);
    }
    await new Promise(function (resolve, reject) {
      fs.writeFile(bigFileName, buf, function (err) {
        if (err) reject(err);
        else resolve();
      });
    });
    const conn = await createConnection({ permitLocalInfile: true });
    await conn.query('DROP TABLE IF EXISTS bigLocalInfile');
    await conn.query('CREATE TABLE bigLocalInfile(t1 varchar(10), t2 varchar(2))');
    await conn.beginTransaction();

    const sql =
      "LOAD DATA LOCAL INFILE '" +
      bigFileName.replace(/\\/g, '/') +
      "' INTO TABLE bigLocalInfile " +
      "COLUMNS TERMINATED BY ',' ENCLOSED BY '\\\"' ESCAPED BY '\\\\' " +
      "LINES TERMINATED BY '\\n' IGNORE 1 LINES " +
      '(t1, t2)';

    await conn.query(sql);
    rows = await conn.query('SELECT * FROM bigLocalInfile');
    assert.equal(rows.length, size);
    for (let i = 0; i < size; i++) {
      if (rows[i].t1 !== 'a' + padStartZero(i, 8) && rows[i].t2 !== 'b') {
        console.log(
          'result differ (no:' + i + ') t1=' + rows[i].t1 + ' != ' + padStartZero(i, 8) + ' t2=' + rows[i].t2
        );
      }
    }
    await conn.end();
  }, 180000);

  function padStartZero(val, length) {
    val = '' + val;
    const stringLength = val.length;
    let add = '';
    while (add.length + stringLength < length) add += '0';
    return add + val;
  }
});
