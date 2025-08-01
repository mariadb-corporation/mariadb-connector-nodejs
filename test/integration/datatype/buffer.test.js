//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import { createConnection, utf8Collation } from '../../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import Conf from '../../conf.js';

describe('buffer', () => {
  let shareConn;
  beforeAll(async () => {
    shareConn = await createConnection(Conf.baseConfig);
  });
  afterAll(async () => {
    await shareConn.end();
    shareConn = null;
  });
  test('query a basic buffer', async () => {
    const rows = await shareConn.query("SELECT x'FF00' val");
    assert.deepEqual(rows[0].val, Buffer.from([255, 0]));
  });

  test('prepare a basic buffer', async ({ skip }) => {
    if (!shareConn.info.isMariaDB()) {
      skip();
      return;
    }
    const rows = await shareConn.execute("SELECT x'FF00' val");
    assert.deepEqual(rows[0].val, Buffer.from([255, 0]));
  });

  const buf = Buffer.from("let's rocks\n😊 🤘");
  const hex = buf.toString('hex').toUpperCase();

  test('buffer escape', async function () {
    const buf = Buffer.from(utf8Collation() ? "let's r\0cks\n😊 🤘" : "let's r\0cks\nmore simple");
    assert.equal(
      shareConn.escape(buf),
      utf8Collation() ? "_binary'let\\'s r\\0cks\\n😊 🤘'" : "_binary'let\\'s r\\0cks\\nmore simple'"
    );
    await shareConn.query('DROP TABLE IF EXISTS BufEscape');
    await shareConn.query('CREATE TABLE BufEscape(b blob)');
    let rows = await shareConn.query(' SELECT ' + shareConn.escape(buf) + ' t');
    assert.deepEqual(rows, [{ t: buf }]);

    await shareConn.query('INSERT INTO BufEscape VALUE (' + shareConn.escape(buf) + '), (?)', buf);
    rows = await shareConn.query('SELECT * FROM BufEscape');
    assert.deepEqual(rows, [{ b: buf }, { b: buf }]);
  });

  test('buffer escape binary', async function () {
    const buf = Buffer.from(utf8Collation() ? "let's r\0cks\n😊 🤘" : "let's r\0cks\nmore simple");
    assert.equal(
      shareConn.escape(buf),
      utf8Collation() ? "_binary'let\\'s r\\0cks\\n😊 🤘'" : "_binary'let\\'s r\\0cks\\nmore simple'"
    );
    await shareConn.query('DROP TABLE IF EXISTS BufEscape');
    await shareConn.query('CREATE TABLE BufEscape(b blob)');
    let rows = await shareConn.query(' SELECT ' + shareConn.escape(buf) + ' t');
    assert.deepEqual(rows, [{ t: buf }]);
    await shareConn.beginTransaction();
    await shareConn.execute('INSERT INTO BufEscape VALUE (' + shareConn.escape(buf) + ')');
    await shareConn.execute('INSERT INTO BufEscape VALUE (?)', buf);
    rows = await shareConn.execute('SELECT * FROM BufEscape');
    assert.deepEqual(rows, [{ b: buf }, { b: buf }]);
    shareConn.commit();
  });

  test('text multi bytes characters', async ({ skip }) => {
    if (!utf8Collation()) {
      skip();
      return;
    }
    const toInsert1 = '\u00D8bbcdefgh\njklmn"';
    const toInsert2 = '\u00D8abcdefgh\njklmn"';

    await shareConn.query('DROP TABLE IF EXISTS BlobTeststreamtest2');
    await shareConn.query(
      'CREATE TABLE BlobTeststreamtest2 (id int primary key not null, st varchar(20), strm text) CHARSET utf8'
    );
    await shareConn.beginTransaction();
    await shareConn.query('insert into BlobTeststreamtest2 values(?, ?, ?)', [2, toInsert1, toInsert2]);
    let rows = await shareConn.query('select * from BlobTeststreamtest2');
    assert.deepEqual(rows, [{ id: 2, st: toInsert1, strm: toInsert2 }]);
    shareConn.commit();
  });

  test('text multi bytes characters binary', async ({ skip }) => {
    if (!utf8Collation()) {
      skip();
      return;
    }
    const toInsert1 = '\u00D8bbcdefgh\njklmn"';
    const toInsert2 = '\u00D8abcdefgh\njklmn"';

    await shareConn.query('DROP TABLE IF EXISTS BlobTeststreamtest2');
    await shareConn.query(
      'CREATE TABLE BlobTeststreamtest2 (id int primary key not null, st varchar(20), strm text) CHARSET utf8'
    );
    await shareConn.beginTransaction();
    await shareConn.execute('insert into BlobTeststreamtest2 values(?, ?, ?)', [2, toInsert1, toInsert2]);
    let rows = await shareConn.execute('select * from BlobTeststreamtest2');
    assert.deepEqual(rows, [{ id: 2, st: toInsert1, strm: toInsert2 }]);
    shareConn.commit();
  });

  test('query hex() function result', async function () {
    let rows = await shareConn.query('SELECT HEX(?) t', [buf]);
    assert.deepEqual(rows, [{ t: hex }]);
  });

  test('query hex() function result binary', async function () {
    let rows = await shareConn.execute('SELECT HEX(?) t', [buf]);
    assert.deepEqual(rows, [{ t: hex }]);
  });

  test('blobs to buffer type', async function () {
    await shareConn.query('DROP TABLE IF EXISTS blobToBuff');
    await shareConn.query(
      'CREATE TABLE blobToBuff (id int not null primary key auto_increment, test longblob, test2 blob, test3 text)'
    );
    await shareConn.beginTransaction();
    await shareConn.query("insert into blobToBuff values(null, 'a','b','c')");
    const rows = await shareConn.query('SELECT * FROM blobToBuff', [buf]);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].id, 1);
    assert.deepStrictEqual(rows[0].test, Buffer.from('a'));
    assert.deepStrictEqual(rows[0].test2, Buffer.from('b'));
    assert.strictEqual(rows[0].test3, 'c');
    shareConn.commit();
  });

  test('blobs to buffer type binary', async function () {
    await shareConn.query('DROP TABLE IF EXISTS blobToBuff');
    await shareConn.query(
      'CREATE TABLE blobToBuff (id int not null primary key auto_increment, test longblob, test2 blob, test3 text)'
    );
    await shareConn.beginTransaction();
    await shareConn.execute("insert into blobToBuff values(null, 'a','b','c')");
    const rows = await shareConn.execute('SELECT * FROM blobToBuff', [buf]);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].id, 1);
    assert.deepStrictEqual(rows[0].test, Buffer.from('a'));
    assert.deepStrictEqual(rows[0].test2, Buffer.from('b'));
    assert.strictEqual(rows[0].test3, 'c');
    shareConn.commit();
  });

  test('blob empty and null', async function () {
    await shareConn.query('DROP TABLE IF EXISTS blobEmpty');
    await shareConn.query('CREATE TABLE blobEmpty (val LONGBLOB)');
    await shareConn.beginTransaction();
    await shareConn.query('insert into blobEmpty values (?)', ['']);
    await shareConn.query('insert into blobEmpty values (?)', ['hello']);
    await shareConn.query('insert into blobEmpty values (?)', [null]);
    const rows = await shareConn.query('select * from blobEmpty');
    assert.deepEqual(rows, [{ val: Buffer.from('') }, { val: Buffer.from('hello') }, { val: null }]);
    shareConn.commit();
  });

  test('blob empty and null binary', async function () {
    await shareConn.query('DROP TABLE IF EXISTS blobEmpty');
    await shareConn.query('CREATE TABLE blobEmpty (val LONGBLOB)');
    await shareConn.beginTransaction();
    await shareConn.execute('insert into blobEmpty values (?)', ['']);
    await shareConn.execute('insert into blobEmpty values (?)', ['hello']);
    await shareConn.execute('insert into blobEmpty values (?)', [null]);
    const rows = await shareConn.execute('select * from blobEmpty');
    assert.deepEqual(rows, [{ val: Buffer.from('') }, { val: Buffer.from('hello') }, { val: null }]);
    shareConn.commit();
  });
});
