'use strict';

const base = require('../../base');
const { assert } = require('chai');

describe('buffer', () => {
  it('query a basic buffer', (done) => {
    shareConn
      .query("SELECT x'FF00' val")
      .then((rows) => {
        assert.deepEqual(rows[0].val, Buffer.from([255, 0]));
        done();
      })
      .catch(done);
  });

  const buf = Buffer.from("let's rocks\n😊 🤘");
  const hex = buf.toString('hex').toUpperCase();

  it('buffer escape', function (done) {
    const buf = Buffer.from(
      base.utf8Collation() ? "let's rocks\n😊 🤘" : "let's rocks\nmore simple"
    );
    assert.equal(
      shareConn.escape(buf),
      base.utf8Collation()
        ? "_binary'let\\'s rocks\\n😊 🤘'"
        : "_binary'let\\'s rocks\\nmore simple'"
    );
    shareConn
      .query('DROP TABLE IF EXISTS BufEscape')
      .then(() => {
        return shareConn.query('CREATE TABLE BufEscape(b blob)');
      })
      .then(() => {
        return shareConn.query(' SELECT ' + shareConn.escape(buf) + ' t');
      })
      .then((rows) => {
        assert.deepEqual(rows, [{ t: buf }]);
        return shareConn.query('INSERT INTO BufEscape VALUE (' + shareConn.escape(buf) + ')');
      })
      .then(() => {
        return shareConn.query('INSERT INTO BufEscape VALUE (?)', buf);
      })
      .then(() => {
        return shareConn.query('SELECT * FROM BufEscape');
      })
      .then((rows) => {
        assert.deepEqual(rows, [{ b: buf }, { b: buf }]);
        done();
      })
      .catch(done);
  });

  it('text multi bytes characters', function (done) {
    if (!base.utf8Collation()) this.skip();
    const toInsert1 = '\u00D8bbcdefgh\njklmn"';
    const toInsert2 = '\u00D8abcdefgh\njklmn"';

    shareConn
      .query('DROP TABLE IF EXISTS BlobTeststreamtest2')
      .then(() => {
        return shareConn.query(
          'CREATE TABLE BlobTeststreamtest2 (id int primary key not null, st varchar(20), strm text) CHARSET utf8'
        );
      })
      .then(() => {
        return shareConn.query('insert into BlobTeststreamtest2 values(?, ?, ?)', [
          2,
          toInsert1,
          toInsert2
        ]);
      })
      .then(() => {
        return shareConn.query('select * from BlobTeststreamtest2');
      })
      .then((rows) => {
        assert.deepEqual(rows, [{ id: 2, st: toInsert1, strm: toInsert2 }]);
        done();
      })
      .catch(done);
  });

  it('query hex() function result', function (done) {
    shareConn
      .query('SELECT HEX(?) t', [buf])
      .then((rows) => {
        assert.deepEqual(rows, [{ t: hex }]);
        done();
      })
      .catch(done);
  });

  it('blobs to buffer type', function (done) {
    shareConn
      .query('DROP TABLE IF EXISTS blobToBuff')
      .then(() => {
        return shareConn.query(
          'CREATE TABLE blobToBuff (id int not null primary key auto_increment, test longblob, test2 blob, test3 text)'
        );
      })
      .then(() => {
        return shareConn.query("insert into blobToBuff values(null, 'a','b','c')");
      })
      .then(() => {
        return shareConn.query('SELECT * FROM blobToBuff', [buf]);
      })
      .then((rows) => {
        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].id, 1);
        assert.deepStrictEqual(rows[0].test, Buffer.from('a'));
        assert.deepStrictEqual(rows[0].test2, Buffer.from('b'));
        assert.strictEqual(rows[0].test3, 'c');
        done();
      })
      .catch(done);
  });

  it('blob empty and null', function (done) {
    shareConn
      .query('DROP TABLE IF EXISTS blobEmpty')
      .then(() => {
        return shareConn.query('CREATE TABLE blobEmpty (val LONGBLOB)');
      })
      .then(() => {
        return shareConn.query('insert into blobEmpty values (?)', ['']);
      })
      .then(() => {
        return shareConn.query('insert into blobEmpty values (?)', ['hello']);
      })
      .then(() => {
        return shareConn.query('insert into blobEmpty values (?)', [null]);
      })
      .then(() => {
        return shareConn.query('select * from blobEmpty');
      })
      .then((rows) => {
        assert.deepEqual(rows, [
          { val: Buffer.from('') },
          { val: Buffer.from('hello') },
          { val: null }
        ]);
        done();
      })
      .catch(done);
  });
});
