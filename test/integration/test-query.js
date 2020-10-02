'use strict';

const base = require('../base.js');
const { assert } = require('chai');

describe('basic query', () => {
  it('query with value without placeholder', function (done) {
    base
      .createConnection()
      .then((conn) => {
        conn
          .query('select 1', [2])
          .then((rows) => {
            assert.deepEqual(rows, [{ 1: 1 }]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('parameter last', (done) => {
    const value = "'`\\";
    base
      .createConnection()
      .then((conn) => {
        conn.query('CREATE TEMPORARY TABLE parse(t varchar(128))');
        conn.query('INSERT INTO `parse` value (?)', value);
        conn
          .query('select * from `parse` where t = ?', value)
          .then((res) => {
            assert.strictEqual(res[0].t, value);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('array parameter', function (done) {
    base
      .createConnection()
      .then((conn) => {
        conn.query('CREATE TEMPORARY TABLE arrayParam (id int, val varchar(10))');
        conn.query("INSERT INTO arrayParam VALUES (1, 'a'), (2, 'b'), (3, 'c'), (4, 'd')");
        conn
          .query('SELECT * FROM arrayParam WHERE val IN ?', [['b', 'c', 1]])
          .then((rows) => {
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

  it('array parameter with null value', function (done) {
    base
      .createConnection()
      .then((conn) => {
        conn.query('CREATE TEMPORARY TABLE arrayParam (id int, val varchar(10))');
        conn.query('INSERT INTO arrayParam VALUES ?', [[1, null]]);
        conn.query('INSERT INTO arrayParam VALUES ?', [[2, 'a']]);
        conn
          .query('SELECT * FROM arrayParam')
          .then((rows) => {
            assert.deepEqual(rows, [
              {
                id: 1,
                val: null
              },
              {
                id: 2,
                val: 'a'
              }
            ]);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('permitSetMultiParamEntries set', (done) => {
    const jsonValue = { id: 1, val: 'test' };
    base
      .createConnection({ permitSetMultiParamEntries: true })
      .then((conn) => {
        conn.query('CREATE TEMPORARY TABLE setTable(id int, val varchar(128))');
        conn.query('INSERT INTO setTable SET ?', jsonValue);
        conn
          .query('select * from setTable')
          .then((res) => {
            assert.deepEqual(res[0], jsonValue);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('query with escape values', function (done) {
    base
      .createConnection()
      .then((conn) => {
        conn
          .query(
            'select /* \\ ? ` # */ \'\\\\"\\\'?\' as a, \' \' as b, ? as c, "\\\\\'\\"?" as d, " " as e\n' +
              ', ? -- comment \n' +
              '  as f # another comment',
            ['val', 'val2']
          )
          .then((rows) => {
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

  it('query with end of line comment', function (done) {
    base
      .createConnection()
      .then((conn) => {
        conn
          .query('select /* blabla */ 1 -- test comment\n , ?', ['val'])
          .then((rows) => {
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

  it('query with # end of line comment', function (done) {
    base
      .createConnection()
      .then((conn) => {
        conn
          .query('select /* blabla */ 1 # test comment\n , ?', ['val'])
          .then((rows) => {
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

  it('query warning', function (done) {
    //mysql 8 force truncation as error, even with SQL_MODE disable it.
    if (!shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(8, 0, 0)) this.skip();
    base
      .createConnection()
      .then((conn) => {
        conn.query(
          "set @@SQL_MODE = 'ERROR_FOR_DIVISION_BY_ZERO,NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION'"
        );
        conn.query('create TEMPORARY table h (c1 varchar(5))');
        conn
          .query("insert into h values ('123456')")
          .then((res) => {
            assert.equal(res.warningStatus, 1);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('255 columns', (done) => {
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
      .then((conn) => {
        conn.query(table);
        conn.query(insert);
        conn
          .query('SELECT * FROM myTable')
          .then((res) => {
            assert.deepEqual(res[0], expRes);
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('escape validation', function (done) {
    if (!base.utf8Collation()) this.skip();
    shareConn.query('CREATE TEMPORARY TABLE tt1 (id int, tt varchar(256)) CHARSET utf8mb4');
    shareConn.query('INSERT INTO tt1 VALUES (?,?)', [1, 'jack\nkमस्']);
    shareConn
      .query('SELECT * FROM tt1')
      .then((res) => {
        assert.equal(res[0].tt, 'jack\nkमस्');
        done();
      })
      .catch(done);
  });

  it('permitSetMultiParamEntries escape ', function (done) {
    const fctStr = new Object();
    fctStr.toSqlString = () => {
      return "bla'bla";
    };
    const arr = {
      stg: "let'g'o😊",
      bool: false,
      nullVal: null,
      fctSt: fctStr
    };

    base.createConnection({ permitSetMultiParamEntries: true }).then((conn) => {
      assert.equal(
        conn.escape(arr),
        "`stg`='let\\'g\\'o😊',`bool`=false,`nullVal`=NULL,`fctSt`='bla\\'bla'"
      );
      conn.end();
      base.createConnection({ permitSetMultiParamEntries: false }).then((conn2) => {
        assert.equal(
          conn2.escape(arr),
          '\'{\\"stg\\":\\"let\\\'g\\\'o😊\\",\\"bool\\":false,\\"nullVal\\":null,\\"fctSt\\":{}}\''
        );
        conn2.end();
        done();
      });
    });
  });

  it('timeout', function (done) {
    this.timeout(20000);
    const initTime = Date.now();
    const query =
      'select c1.* from information_schema.columns as c1, ' +
      'information_schema.tables, information_schema.tables as t2'; //takes more than 20s
    shareConn
      .query({ sql: query, timeout: 100 })
      .then((res) => {
        done(new Error('must have thrown an error'));
      })
      .catch(testTimeout.bind(this, done, initTime));
  });

  it('timeout with parameter', function (done) {
    this.timeout(20000);
    const initTime = Date.now();
    const query =
      'select c1.* from information_schema.columns as c1, ' +
      'information_schema.tables, information_schema.tables as t2 WHERE 1 = ?'; //takes more than 20s
    shareConn
      .query({ sql: query, timeout: 100 }, [1])
      .then((res) => {
        done(new Error('must have thrown an error'));
      })
      .catch(testTimeout.bind(this, done, initTime));
  });

  const testTimeout = (done, initTime, err) => {
    if (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 1, 2)) {
      const elapse = Date.now() - initTime;
      assert.isOk(elapse < 10000, 'elapse time was ' + elapse + ' but must be less around 100');
      assert.isTrue(
        err.message.includes('Query execution was interrupted (max_statement_time exceeded)')
      );
      assert.equal(err.errno, 1969);
      assert.equal(err.sqlState, 70100);
      assert.equal(err.code, 'ER_STATEMENT_TIMEOUT');
    } else {
      if (shareConn.info.isMariaDB()) {
        assert.isTrue(
          err.message.includes(
            'Cannot use timeout for MariaDB server before 10.1.2. timeout value:'
          )
        );
      } else {
        assert.isTrue(err.message.includes('Cannot use timeout for MySQL server. timeout value:'));
      }
      assert.equal(err.errno, 45038);
      assert.equal(err.sqlState, 'HY000');
      assert.equal(err.code, 'ER_TIMEOUT_NOT_SUPPORTED');
    }
    done();
  };
});
