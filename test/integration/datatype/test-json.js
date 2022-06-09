'use strict';

const base = require('../../base.js');
const { assert } = require('chai');

describe('json', () => {
  it('json escape', async function () {
    const buf = { id: 2, val: "t'est" };
    assert.equal(shareConn.escape(buf), '\'{\\"id\\":2,\\"val\\":\\"t\\\'est\\"}\'');

    const rows = await shareConn.query(' SELECT ' + shareConn.escape(buf) + ' t');
    assert.deepEqual(rows, [{ t: '{"id":2,"val":"t\'est"}' }]);
  });

  it('insert json format', async function () {
    //server permit JSON format
    if (
      (shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(10, 2, 7)) ||
      (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 7, 8))
    ) {
      this.skip();
    }
    await testJsonInsertFormat(shareConn);
    const con = await base.createConnection({ charset: 'latin7' });
    await testJsonInsertFormat(con);
    await con.end();
  });

  const testJsonInsertFormat = async function (conn) {
    const obj = { id: 2, val: 'tes\\t' };
    const obj2 = { id: 3, val: 'test3' };
    await conn.query('DROP TABLE IF EXISTS `test-json-insert-type`');
    await conn.query('CREATE TABLE `test-json-insert-type` (val1 JSON)');
    await conn.query(
      {
        stringifyObjects: true,
        sql: 'INSERT INTO `test-json-insert-type` values (?)'
      },
      [obj]
    );
    await conn.execute(
      {
        stringifyObjects: true,
        sql: 'INSERT INTO `test-json-insert-type` values (?)'
      },
      [obj]
    );
    await conn.query('INSERT INTO `test-json-insert-type` values (?)', [JSON.stringify(obj2)]);
    await conn.execute('INSERT INTO `test-json-insert-type` values (?)', [JSON.stringify(obj2)]);
    const rows = await conn.query('SELECT * FROM `test-json-insert-type`');
    if (
      (conn.info.isMariaDB() && !conn.info.hasMinVersion(10, 5, 2)) ||
      process.env.srv === 'maxscale' ||
      process.env.srv === 'skysql-ha'
    ) {
      const val1 = JSON.parse(rows[0].val1);
      const val2 = JSON.parse(rows[1].val1);
      const val3 = JSON.parse(rows[2].val1);
      const val4 = JSON.parse(rows[3].val1);
      assert.equal(val1.id, 2);
      assert.equal(val1.val, 'tes\\t');
      assert.equal(val2.id, 2);
      assert.equal(val2.val, 'tes\\t');
      assert.equal(val3.id, 3);
      assert.equal(val3.val, 'test3');
      assert.equal(val4.id, 3);
      assert.equal(val4.val, 'test3');
    } else {
      assert.equal(rows[0]['val1'].id, 2);
      assert.equal(rows[0].val1.val, 'tes\\t');
      assert.equal(rows[1].val1.id, 2);
      assert.equal(rows[1].val1.val, 'tes\\t');
      assert.equal(rows[2].val1.id, 3);
      assert.equal(rows[2].val1.val, 'test3');
      assert.equal(rows[3].val1.id, 3);
      assert.equal(rows[3].val1.val, 'test3');
    }
  };

  it('select json format', async function () {
    //server permit JSON format
    if (
      (shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(10, 2, 7)) ||
      (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 7, 8))
    ) {
      this.skip();
    }

    const obj = { id: 2, val: 'test' };
    const jsonString = JSON.stringify(obj);

    await shareConn.query('DROP TABLE IF EXISTS `test-json-return-type`');
    await shareConn.query('CREATE TABLE `test-json-return-type` (val1 JSON, val2 LONGTEXT, val3 LONGBLOB)');
    await shareConn.query(
      "INSERT INTO `test-json-return-type` values ('" + jsonString + "','" + jsonString + "','" + jsonString + "')"
    );
    let rows = await shareConn.query('SELECT * FROM `test-json-return-type`');
    if (shareConn.info.isMariaDB()) {
      if (
        shareConn.info.isMariaDB() &&
        shareConn.info.hasMinVersion(10, 5, 2) &&
        process.env.srv !== 'maxscale' &&
        process.env.srv !== 'skysql-ha'
      ) {
        assert.deepEqual(rows[0].val1, obj);
      } else {
        assert.equal(rows[0].val1, jsonString);
      }
    } else {
      assert.equal(rows[0].val1.id, 2);
      assert.equal(rows[0].val1.val, 'test');
    }
    assert.equal(rows[0].val2, jsonString);
    assert.equal(rows[0].val3, jsonString);

    rows = await shareConn.execute('SELECT * FROM `test-json-return-type`');
    if (shareConn.info.isMariaDB()) {
      if (
        shareConn.info.isMariaDB() &&
        shareConn.info.hasMinVersion(10, 5, 2) &&
        process.env.srv !== 'maxscale' &&
        process.env.srv !== 'skysql-ha'
      ) {
        assert.deepEqual(rows[0].val1, obj);
      } else {
        assert.equal(rows[0].val1, jsonString);
      }
    } else {
      assert.equal(rows[0].val1.id, 2);
      assert.equal(rows[0].val1.val, 'test');
    }
    assert.equal(rows[0].val2, jsonString);
    assert.equal(rows[0].val3, jsonString);
  });

  it('disable json format', async function () {
    //server permit JSON format
    if (
      (shareConn.info.isMariaDB() &&
        (!shareConn.info.hasMinVersion(10, 5, 2) ||
          process.env.srv === 'maxscale' ||
          process.env.srv === 'skysql-ha')) ||
      !shareConn.info.isMariaDB()
    ) {
      this.skip();
    }
    const conn = await base.createConnection({ autoJsonMap: false });
    const obj = { id: 2, val: 'test' };
    const jsonString = JSON.stringify(obj);
    await conn.query('DROP TABLE IF EXISTS `test-json-return-type`');
    await conn.query('CREATE TABLE `test-json-return-type` (val1 JSON, val2 LONGTEXT, val3 LONGBLOB)');
    await conn.query(
      "INSERT INTO `test-json-return-type` values ('" + jsonString + "','" + jsonString + "','" + jsonString + "')"
    );

    let rows = await conn.query('SELECT * FROM `test-json-return-type`');
    assert.equal(rows[0].val1, jsonString);
    assert.equal(rows[0].val2, jsonString);
    assert.equal(rows[0].val3, jsonString);

    rows = await conn.execute('SELECT * FROM `test-json-return-type`');
    assert.equal(rows[0].val1, jsonString);
    assert.equal(rows[0].val2, jsonString);
    assert.equal(rows[0].val3, jsonString);

    conn.close();
  });
});
