//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB plc

'use strict';

import { createConnection, utf8Collation } from '../../base.js';
import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import Conf from '../../conf.js';

describe.concurrent('buffer', () => {
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
    await shareConn.query('DROP TABLE IF EXISTS BufEscape2');
    await shareConn.query('CREATE TABLE BufEscape2(b blob)');
    let rows = await shareConn.query(' SELECT ' + shareConn.escape(buf) + ' t');
    assert.deepEqual(rows, [{ t: buf }]);
    await shareConn.beginTransaction();
    await shareConn.execute('INSERT INTO BufEscape2 VALUE (' + shareConn.escape(buf) + ')');
    await shareConn.execute('INSERT INTO BufEscape2 VALUE (?)', buf);
    rows = await shareConn.execute('SELECT * FROM BufEscape2');
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

    await shareConn.query('DROP TABLE IF EXISTS BlobTeststreamtest3');
    await shareConn.query(
      'CREATE TABLE BlobTeststreamtest3 (id int primary key not null, st varchar(20), strm text) CHARSET utf8'
    );
    await shareConn.beginTransaction();
    await shareConn.execute('insert into BlobTeststreamtest3 values(?, ?, ?)', [2, toInsert1, toInsert2]);
    let rows = await shareConn.execute('select * from BlobTeststreamtest3');
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
    await shareConn.query('DROP TABLE IF EXISTS blobToBuff2');
    await shareConn.query(
      'CREATE TABLE blobToBuff2 (id int not null primary key auto_increment, test longblob, test2 blob, test3 text)'
    );
    await shareConn.beginTransaction();
    await shareConn.execute("insert into blobToBuff2 values(null, 'a','b','c')");
    const rows = await shareConn.execute('SELECT * FROM blobToBuff2', [buf]);
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
    await shareConn.query('DROP TABLE IF EXISTS blobEmpty2');
    await shareConn.query('CREATE TABLE blobEmpty2 (val LONGBLOB)');
    await shareConn.beginTransaction();
    await shareConn.execute('insert into blobEmpty2 values (?)', ['']);
    await shareConn.execute('insert into blobEmpty2 values (?)', ['hello']);
    await shareConn.execute('insert into blobEmpty2 values (?)', [null]);
    const rows = await shareConn.execute('select * from blobEmpty2');
    assert.deepEqual(rows, [{ val: Buffer.from('') }, { val: Buffer.from('hello') }, { val: null }]);
    shareConn.commit();
  });

  // a Uint8Array that is not a Buffer (TextEncoder, crypto.getRandomValues, fetch body) is bound as its bytes
  const u8 = new Uint8Array([0, 39, 92, 255]);
  // a view on part of a larger ArrayBuffer: only the viewed bytes are bound
  const u8View = new Uint8Array([9, 9, 0, 39, 92, 255, 9]).subarray(2, 6);
  const u8Hex = '00275CFF';

  test('query plain Uint8Array', async function () {
    let rows = await shareConn.query('SELECT HEX(?) t, HEX(?) t2', [u8, u8View]);
    assert.deepEqual(rows, [{ t: u8Hex, t2: u8Hex }]);
    await shareConn.query('DROP TABLE IF EXISTS u8Query');
    await shareConn.query('CREATE TABLE u8Query (id int, val blob)');
    await shareConn.query('INSERT INTO u8Query VALUES (?, ?), (?, ?)', [1, u8, 2, u8View]);
    rows = await shareConn.query('SELECT * FROM u8Query ORDER BY id');
    assert.deepEqual(rows, [
      { id: 1, val: Buffer.from(u8) },
      { id: 2, val: Buffer.from(u8) }
    ]);
  });

  test('execute plain Uint8Array', async function () {
    let rows = await shareConn.execute('SELECT HEX(?) t, HEX(?) t2', [u8, u8View]);
    assert.deepEqual(rows, [{ t: u8Hex, t2: u8Hex }]);
    await shareConn.query('DROP TABLE IF EXISTS u8Execute');
    await shareConn.query('CREATE TABLE u8Execute (id int, val longblob)');
    await shareConn.execute('INSERT INTO u8Execute VALUES (?, ?)', [1, u8]);
    await shareConn.execute('INSERT INTO u8Execute VALUES (?, ?)', [2, u8View]);
    // 16K and more is sent as long data
    const big = new Uint8Array(20000).map((_, i) => i % 256);
    const bigView = new Uint8Array(20010).map((_, i) => (i + 251) % 256).subarray(5, 20005);
    await shareConn.execute('INSERT INTO u8Execute VALUES (?, ?)', [3, big]);
    await shareConn.execute('INSERT INTO u8Execute VALUES (?, ?)', [4, bigView]);
    rows = await shareConn.execute('SELECT * FROM u8Execute ORDER BY id');
    assert.deepEqual(rows, [
      { id: 1, val: Buffer.from(u8) },
      { id: 2, val: Buffer.from(u8) },
      { id: 3, val: Buffer.from(big) },
      { id: 4, val: Buffer.from(big) }
    ]);
  });

  test('batch plain Uint8Array', async function () {
    await shareConn.query('DROP TABLE IF EXISTS u8Batch');
    await shareConn.query('CREATE TABLE u8Batch (id int, val blob)');
    await shareConn.batch('INSERT INTO u8Batch VALUES (?, ?)', [
      [1, u8],
      [2, u8View],
      [3, Buffer.from(u8)]
    ]);
    const rows = await shareConn.query('SELECT * FROM u8Batch ORDER BY id');
    assert.deepEqual(rows, [
      { id: 1, val: Buffer.from(u8) },
      { id: 2, val: Buffer.from(u8) },
      { id: 3, val: Buffer.from(u8) }
    ]);
  });

  test('escape plain Uint8Array', async function () {
    const bytes = new globalThis.TextEncoder().encode("..let's r\0cks\\..").subarray(2, 14);
    assert.equal(shareConn.escape(bytes), "_binary'let\\'s r\\0cks\\\\'");
    assert.equal(shareConn.escape(bytes), shareConn.escape(Buffer.from(bytes)));
    const rows = await shareConn.query('SELECT ' + shareConn.escape(bytes) + ' t');
    assert.deepEqual(rows, [{ t: Buffer.from(bytes) }]);
  });
});
