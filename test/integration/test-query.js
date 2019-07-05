'use strict';

const base = require('../base.js');
const { assert } = require('chai');

describe('basic query', () => {
  it('query with value without placeholder', function(done) {
    base
      .createConnection()
      .then(conn => {
        conn
          .query('select 1', [2])
          .then(rows => {
            assert.deepEqual(rows, [{ '1': 1 }]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('parameter last', done => {
    const value = "'`\\";
    base
      .createConnection()
      .then(conn => {
        conn.query('CREATE TEMPORARY TABLE parse(t varchar(128))');
        conn.query('INSERT INTO `parse` value (?)', value);
        conn
          .query('select * from `parse` where t = ?', value)
          .then(res => {
            assert.strictEqual(res[0].t, value);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('array parameter', function(done) {
    base
      .createConnection({
        user: 'root',
        debug: true,
        permitSetMultiParamEntries: true
      })
      .then(conn => {
        conn.query('CREATE TEMPORARY TABLE arrayParam (id int, val varchar(10))');
        conn.query("INSERT INTO arrayParam VALUES (1, 'a'), (2, 'b'), (3, 'c'), (4, 'd')");
        conn
          .query('SELECT * FROM arrayParam WHERE val IN ?', [['b', 'c', 1]])
          .then(rows => {
            assert.deepEqual(rows, [
              {
                id: 2,
                val: 'b'
              },
              {
                id: 3,
                val: 'c'
              }
            ]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);

  });
  it('permitSetMultiParamEntries set', done => {
    const jsonValue = { id: 1, val: 'test' };
    base
      .createConnection({ permitSetMultiParamEntries: true })
      .then(conn => {
        conn.query('CREATE TEMPORARY TABLE setTable(id int, val varchar(128))');
        conn.query('INSERT INTO setTable SET ?', jsonValue);
        conn
          .query('select * from setTable')
          .then(res => {
            assert.deepEqual(res[0], jsonValue);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('query with escape values', function(done) {
    base
      .createConnection()
      .then(conn => {
        conn
          .query(
            'select /* \\ ? ` # */ \'\\\\"\\\'?\' as a, \' \' as b, ? as c, "\\\\\'\\"?" as d, " " as e\n' +
              ', ? -- comment \n' +
              '  as f # another comment',
            ['val', 'val2']
          )
          .then(rows => {
            assert.deepEqual(rows, [
              {
                a: '\\"\'?',
                b: ' ',
                c: 'val',
                d: '\\\'"?',
                e: ' ',
                f: 'val2'
              }
            ]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('query with end of line comment', function(done) {
    base
      .createConnection()
      .then(conn => {
        conn
          .query('select /* blabla */ 1 -- test comment\n , ?', ['val'])
          .then(rows => {
            assert.deepEqual(rows, [
              {
                1: 1,
                val: 'val'
              }
            ]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('query with # end of line comment', function(done) {
    base
      .createConnection()
      .then(conn => {
        conn
          .query('select /* blabla */ 1 # test comment\n , ?', ['val'])
          .then(rows => {
            assert.deepEqual(rows, [
              {
                1: 1,
                val: 'val'
              }
            ]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('query warning', function(done) {
    //mysql 8 force truncation as error, even with SQL_MODE disable it.
    if (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0))
      this.skip();
    base
      .createConnection()
      .then(conn => {
        conn.query(
          "set @@SQL_MODE = 'ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION'"
        );
        conn.query('create TEMPORARY table h (c1 varchar(5))');
        conn
          .query("insert into h values ('123456')")
          .then(res => {
            assert.equal(res.warningStatus, 1);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('255 columns', done => {
    let table = 'CREATE TEMPORARY TABLE myTable(';
    let insert = 'INSERT INTO myTable VALUES (';
    let expRes = {};
    for (let i = 0; i < 255; i++) {
      if (i != 0) {
        table += ',';
        insert += ',';
      }
      table += 'i' + i + ' int';
      insert += i;
      expRes['i' + i] = i;
    }
    table += ')';
    insert += ')';

    base
      .createConnection()
      .then(conn => {
        conn.query(table);
        conn.query(insert);
        conn
          .query('SELECT * FROM myTable')
          .then(res => {
            assert.deepEqual(res[0], expRes);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });
});
