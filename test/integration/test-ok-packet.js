'use strict';

const base = require('../base.js');
const { assert } = require('chai');

describe('ok packet', () => {
  it('insertId', function (done) {
    shareConn
      .query('DROP TABLE IF EXISTS autoInc')
      .then(() => {
        return shareConn.query(
          'CREATE TABLE autoInc (id BIGINT not null primary key auto_increment)'
        );
      })
      .then(() => {
        return shareConn.query('INSERT INTO autoInc values ()');
      })
      .then((rows) => {
        assert.equal(rows.insertId, 1);
        return shareConn.query('INSERT INTO autoInc values ()');
      })
      .then((rows) => {
        assert.equal(rows.insertId, 2);
        return shareConn.query('INSERT INTO autoInc values (245)');
      })
      .then((rows) => {
        assert.equal(rows.insertId, 245);
        return shareConn.query('INSERT INTO autoInc values (32767)');
      })
      .then((rows) => {
        assert.equal(rows.insertId, 32767);
        return shareConn.query('INSERT INTO autoInc values (65535)');
      })
      .then((rows) => {
        assert.equal(rows.insertId, 65535);
        return shareConn.query('INSERT INTO autoInc values ()');
      })
      .then((rows) => {
        assert.equal(rows.insertId, 65536);
        return shareConn.query('INSERT INTO autoInc values (16777215)');
      })
      .then((rows) => {
        assert.equal(rows.insertId, 16777215);
        return shareConn.query('INSERT INTO autoInc values ()');
      })
      .then((rows) => {
        assert.equal(rows.insertId, 16777216);
        return shareConn.query('INSERT INTO autoInc values (4294967295)');
      })
      .then((rows) => {
        assert.equal(rows.insertId, 4294967295);
        return shareConn.query('INSERT INTO autoInc values ()');
      })
      .then((rows) => {
        assert.equal(rows.insertId, 4294967296);
        return shareConn.query('INSERT INTO autoInc values (9007199254740992)');
      })
      .then((rows) => {
        assert.equal(rows.insertId.toString(10), '9007199254740992');
        done();
      })
      .catch(done);
  });

  it('negative insertId', function (done) {
    shareConn
      .query('DROP TABLE IF EXISTS negAutoInc')
      .then(() => {
        return shareConn.query(
          'CREATE TABLE negAutoInc (id BIGINT not null primary key auto_increment)'
        );
      })
      .then(() => {
        return shareConn.query('INSERT INTO negAutoInc values (-9007199254740990)');
      })
      .then((rows) => {
        assert.equal(rows.insertId, -9007199254740990);
        return shareConn.query('INSERT INTO negAutoInc values (-9007199254740989)');
      })
      .then((rows) => {
        assert.equal(rows.insertId, -9007199254740989);
        return shareConn.query('INSERT INTO negAutoInc values (-2147483648)');
      })
      .then((rows) => {
        assert.equal(rows.insertId, -2147483648);
        return shareConn.query('INSERT INTO negAutoInc values (-2147483647)');
      })
      .then((rows) => {
        assert.equal(rows.insertId, -2147483647);
        return shareConn.query('INSERT INTO negAutoInc values (-8388608)');
      })
      .then((rows) => {
        assert.equal(rows.insertId, -8388608);
        return shareConn.query('INSERT INTO negAutoInc values (-8388607)');
      })
      .then((rows) => {
        assert.equal(rows.insertId, -8388607);
        return shareConn.query('INSERT INTO negAutoInc values (-32768)');
      })
      .then((rows) => {
        assert.equal(rows.insertId, -32768);
        return shareConn.query('INSERT INTO negAutoInc values (-245)');
      })
      .then((rows) => {
        assert.equal(rows.insertId, -245);
        return shareConn.query('INSERT INTO negAutoInc values (-9007199254740992)');
      })
      .then((rows) => {
        assert.equal(rows.insertId.toString(10), '-9007199254740992');
        done();
      })
      .catch(done);
  });

  it('basic insert result', function (done) {
    shareConn
      .query('DROP TABLE IF EXISTS insertResultSet1')
      .then(() => {
        return shareConn.query(
          'CREATE TABLE insertResultSet1(' +
            'id int(11) unsigned NOT NULL AUTO_INCREMENT,' +
            'val varchar(256),' +
            'PRIMARY KEY (id))'
        );
      })
      .then(() => {
        return shareConn.query('INSERT INTO insertResultSet1(val) values (?)', ['t']);
      })
      .then((rows) => {
        assert.ok(!Array.isArray(rows));
        assert.strictEqual(typeof rows, 'object');
        assert.strictEqual(rows.insertId, 1);
        assert.strictEqual(rows.affectedRows, 1);
        assert.strictEqual(rows.warningStatus, 0);
        done();
      })
      .catch(done);
  });

  it('multiple insert result', function (done) {
    if (process.env.SKYSQL || process.env.SKYSQL_HA) this.skip();
    base
      .createConnection({ multipleStatements: true })
      .then((conn) => {
        conn
          .query('DROP TABLE IF EXISTS multiple_insert_result')
          .then(() => {
            return conn.query(
              'CREATE TABLE multiple_insert_result(' +
                'id int(11) unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,' +
                'val varchar(256))'
            );
          })
          .then(() => {
            return conn.query(
              'INSERT INTO multiple_insert_result(val) values (?); ' +
                "INSERT INTO multiple_insert_result(id,val) values (9, 't2'); " +
                'INSERT INTO multiple_insert_result(val) values (?)',
              ['t1', 't3']
            );
          })
          .then((rows) => {
            assert.ok(Array.isArray(rows));
            assert.strictEqual(rows.length, 3);
            assert.strictEqual(rows[0].insertId, 1);
            assert.strictEqual(rows[0].affectedRows, 1);
            assert.strictEqual(rows[0].warningStatus, 0);
            assert.strictEqual(rows[1].insertId, 9);
            assert.strictEqual(rows[1].affectedRows, 1);
            assert.strictEqual(rows[1].warningStatus, 0);
            assert.strictEqual(rows[2].insertId, 10);
            assert.strictEqual(rows[2].affectedRows, 1);
            assert.strictEqual(rows[2].warningStatus, 0);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('update result text', function (done) {
    shareConn
      .query('DROP TABLE IF EXISTS updateResultSet1')
      .then(() => {
        return shareConn.query('CREATE TABLE updateResultSet1(id int(11))');
      })
      .then(() => {
        return shareConn.query('INSERT INTO updateResultSet1 values (1), (1), (2), (3)');
      })
      .then(() => {
        return shareConn.query('UPDATE updateResultSet1 set id = 1');
      })
      .then((res) => {
        assert.ok(!Array.isArray(res));
        assert.strictEqual(typeof res, 'object');
        assert.strictEqual(res.insertId, 0);
        assert.strictEqual(res.affectedRows, 4);
        assert.strictEqual(res.warningStatus, 0);
        return shareConn.query('UPDATE updateResultSet1 set id = 1');
      })
      .then((res) => {
        assert.ok(!Array.isArray(res));
        assert.strictEqual(typeof res, 'object');
        assert.strictEqual(res.insertId, 0);
        assert.strictEqual(res.affectedRows, 4);
        assert.strictEqual(res.warningStatus, 0);
        done();
      })
      .catch(done);
  });

  it('update result text changedRows', function (done) {
    base
      .createConnection({ foundRows: false })
      .then((conn) => {
        conn
          .query('DROP TABLE IF EXISTS updateResultSet1')
          .then(() => {
            return conn.query('CREATE TABLE updateResultSet1(id int(11))');
          })
          .then(() => {
            return conn.query('INSERT INTO updateResultSet1 values (1), (1), (2), (3)');
          })
          .then(() => {
            return conn.query('UPDATE updateResultSet1 set id = 1');
          })
          .then((res) => {
            assert.ok(!Array.isArray(res));
            assert.strictEqual(typeof res, 'object');
            assert.strictEqual(res.insertId, 0);
            assert.strictEqual(res.affectedRows, 2);
            assert.strictEqual(res.warningStatus, 0);
            return conn.query('UPDATE updateResultSet1 set id = 1');
          })
          .then((res) => {
            assert.ok(!Array.isArray(res));
            assert.strictEqual(typeof res, 'object');
            assert.strictEqual(res.insertId, 0);
            assert.strictEqual(res.affectedRows, 0);
            assert.strictEqual(res.warningStatus, 0);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });
});
