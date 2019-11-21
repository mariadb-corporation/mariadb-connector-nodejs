'use strict';

const Parse = require('../../../lib/misc/parse');
const { assert } = require('chai');

describe('parse', () => {
  describe('basic placeholder', () => {
    const values = [
      { id1: 1, id2: 2 },
      { id3: 3, id2: 4 },
      { id2: 5, id1: 6 }
    ];

    it('select', () => {
      const res = Parse.searchPlaceholder(
        'select \'\\\'\' as a, :id2 as b, "\\"" as c, :id1 as d',
        null,
        values
      );
      assert.deepEqual(res, {
        sql: 'select \'\\\'\' as a, ? as b, "\\"" as c, ? as d',
        values: [
          [2, 1],
          [4, null],
          [5, 6]
        ]
      });
    });

    it('rewritable with constant parameters ', () => {
      const res = Parse.searchPlaceholder(
        'INSERT INTO TABLE(col1,col2,col3,col4, col5) VALUES (9, :id2, 5, :id1, 8) ON DUPLICATE KEY UPDATE col2=col2+10',
        null,
        values
      );
      assert.deepEqual(res, {
        sql:
          'INSERT INTO TABLE(col1,col2,col3,col4, col5) VALUES (9, ?, 5, ?, 8) ON DUPLICATE KEY UPDATE col2=col2+10',
        values: [
          [2, 1],
          [4, null],
          [5, 6]
        ]
      });
    });

    it('test comments ', () => {
      const res = Parse.searchPlaceholder(
        '/* insert Select INSERT INTO tt VALUES (:id2,:id1,?,?)  */' +
          ' INSERT into ' +
          '/* insert Select INSERT INTO tt VALUES (?,:id2,?,?)  */' +
          ' tt VALUES ' +
          '/* insert Select INSERT INTO tt VALUES (?,?,:id2,?)  */' +
          ' (:id2) ' +
          '/* insert Select INSERT INTO tt VALUES (?,?,?,?)  */',
        null,
        values
      );
      assert.deepEqual(res, {
        sql:
          '/* insert Select INSERT INTO tt VALUES (:id2,:id1,?,?)  */' +
          ' INSERT into ' +
          '/* insert Select INSERT INTO tt VALUES (?,:id2,?,?)  */' +
          ' tt VALUES ' +
          '/* insert Select INSERT INTO tt VALUES (?,?,:id2,?)  */' +
          ' (?) ' +
          '/* insert Select INSERT INTO tt VALUES (?,?,?,?)  */',
        values: [[2], [4], [5]]
      });
    });

    it('rewritable with constant parameters and parameters after ', () => {
      const res = Parse.searchPlaceholder(
        'INSERT INTO TABLE(col1,col2,col3,col4, col5) VALUES (9, :id2, 5, :id1, 8) ON DUPLICATE KEY UPDATE col2=:id3',
        null,
        values
      );
      assert.deepEqual(res, {
        sql:
          'INSERT INTO TABLE(col1,col2,col3,col4, col5) VALUES (9, ?, 5, ?, 8) ON DUPLICATE KEY UPDATE col2=?',
        values: [
          [2, 1, null],
          [4, null, 3],
          [5, 6, null]
        ]
      });
    });

    it('rewritable with multiple values ', () => {
      const res = Parse.searchPlaceholder(
        'INSERT INTO TABLE(col1,col2) VALUES (:id2, :id3), (:id1, :id4)',
        null,
        values
      );
      assert.deepEqual(res, {
        sql: 'INSERT INTO TABLE(col1,col2) VALUES (?, ?), (?, ?)',
        values: [
          [2, null, 1, null],
          [4, 3, null, null],
          [5, null, 6, null]
        ]
      });
    });

    it('Call', () => {
      const res = Parse.searchPlaceholder('CALL dsdssd(:id1,:id2)', null, values);
      assert.deepEqual(res, {
        sql: 'CALL dsdssd(?,?)',
        values: [
          [1, 2],
          [null, 4],
          [6, 5]
        ]
      });
    });

    it('Update', () => {
      const res = Parse.searchPlaceholder(
        "UPDATE MultiTestt4 SET test = :id1 #comm :id3\n WHERE s='\\\\' and test = :id2",
        null,
        values
      );
      assert.deepEqual(res, {
        sql: "UPDATE MultiTestt4 SET test = ? #comm :id3\n WHERE s='\\\\' and test = ?",
        values: [
          [1, 2],
          [null, 4],
          [6, 5]
        ]
      });
    });

    it('insert select', () => {
      const res = Parse.searchPlaceholder(
        'insert into test_insert_select ( field1) (select  TMP.field1 from ' +
          '(select CAST(:id1 as binary) `field1` from dual) TMP)',
        null,
        values
      );
      assert.deepEqual(res, {
        sql:
          'insert into test_insert_select ( field1) (select  TMP.field1 from ' +
          '(select CAST(? as binary) `field1` from dual) TMP)',
        values: [[1], [null], [6]]
      });
    });

    it('select without parameter', () => {
      const res = Parse.searchPlaceholder('SELECT testFunction()', null, values);
      assert.deepEqual(res, {
        sql: 'SELECT testFunction()',
        values: [[], [], []]
      });
    });

    it('insert without parameter', () => {
      const res = Parse.searchPlaceholder('INSERT VALUES (testFunction())', null, values);
      assert.deepEqual(res, {
        sql: 'INSERT VALUES (testFunction())',
        values: [[], [], []]
      });
    });

    it('select without parenthesis', () => {
      const res = Parse.searchPlaceholder('SELECT 1', null, values);
      assert.deepEqual(res, {
        sql: 'SELECT 1',
        values: [[], [], []]
      });
    });

    it('insert without parameters', () => {
      const res = Parse.searchPlaceholder('INSERT INTO tt VALUES (1)', null, values);
      assert.deepEqual(res, {
        sql: 'INSERT INTO tt VALUES (1)',
        values: [[], [], []]
      });
    });

    it('semicolon', () => {
      const res = Parse.searchPlaceholder(
        "INSERT INTO tt (tt) VALUES (:id1); INSERT INTO tt (tt) VALUES ('multiple')",
        null,
        values
      );
      assert.deepEqual(res, {
        sql: "INSERT INTO tt (tt) VALUES (?); INSERT INTO tt (tt) VALUES ('multiple')",
        values: [[1], [null], [6]]
      });
    });

    it('semicolon with empty data after', () => {
      const res = Parse.searchPlaceholder(
        'INSERT INTO table (column1) VALUES (:id1); ',
        null,
        values
      );
      assert.deepEqual(res, {
        sql: 'INSERT INTO table (column1) VALUES (?); ',
        values: [[1], [null], [6]]
      });
    });

    it('semicolon not rewritable if not at end', () => {
      const res = Parse.searchPlaceholder(
        'INSERT INTO table (column1) VALUES (:id1); SELECT 1',
        null,
        values
      );
      assert.deepEqual(res, {
        sql: 'INSERT INTO table (column1) VALUES (?); SELECT 1',
        values: [[1], [null], [6]]
      });
    });

    it('line end comment', () => {
      const res = Parse.searchPlaceholder('INSERT INTO tt (tt) VALUES (:id1) --fin', null, values);
      assert.deepEqual(res, {
        sql: 'INSERT INTO tt (tt) VALUES (?) --fin',
        values: [[1], [null], [6]]
      });
    });

    it('line finished comment', () => {
      const res = Parse.searchPlaceholder(
        'INSERT INTO tt (tt) VALUES --fin\n (:id1)',
        null,
        values
      );
      assert.deepEqual(res, {
        sql: 'INSERT INTO tt (tt) VALUES --fin\n (?)',
        values: [[1], [null], [6]]
      });
    });

    it('line finished comment', () => {
      const res = Parse.splitRewritableNamedParameterQuery(
        'INSERT INTO select_tt (tt, tt2) VALUES (LAST_INSERT_ID(), :id1)',
        values
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['INSERT INTO select_tt (tt, tt2) VALUES', ' (LAST_INSERT_ID(), ', ')', ''],
        values: [[1], [null], [6]],
        reWritable: false
      });
    });
  });

  describe('batch rewrite', () => {
    it('select', () => {
      const res = Parse.splitRewritableQuery('select \'\\\'\' as a, ? as b, "\\"" as c, ? as d');
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ["select '\\'' as a, ", '', ' as b, "\\"" as c, ', '', ' as d'],
        reWritable: false
      });
    });

    it('comment hash', () => {
      const res = Parse.splitRewritableQuery('select ? #comment line \n ,?');
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['select ', '', ' #comment line \n ,', '', ''],
        reWritable: false
      });
    });

    it('rewritable with constant parameters ', () => {
      const res = Parse.splitRewritableQuery(
        'INSERT INTO SELECT_TABLE(col1,col2,col3,col4, col5) VALUES (9, ?, 5, ?, 8) ON DUPLICATE' +
          ' KEY UPDATE col2=col2+10'
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: [
          'INSERT INTO SELECT_TABLE(col1,col2,col3,col4, col5) VALUES',
          ' (9, ',
          ', 5, ',
          ', 8)',
          ' ON DUPLICATE KEY UPDATE col2=col2+10'
        ],
        reWritable: true
      });
    });

    it('rewritable with constant parameters ', () => {
      const res = Parse.splitRewritableQuery(
        'INSERT INTO SELECT_TABLE(col1,col2,col3,col4, col5) VALUES (9, ?, 5, ?, 8) ON DUPLICATE' +
          ' KEY UPDATE col2=col2+10'
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: [
          'INSERT INTO SELECT_TABLE(col1,col2,col3,col4, col5) VALUES',
          ' (9, ',
          ', 5, ',
          ', 8)',
          ' ON DUPLICATE KEY UPDATE col2=col2+10'
        ],
        reWritable: true
      });
    });

    it('test comments ', () => {
      const res = Parse.splitRewritableQuery(
        '/* insert Select INSERT INTO tt VALUES (?,?,?,?)  */' +
          ' INSERT into ' +
          '/* insert Select INSERT INTO tt VALUES (?,?,?,?)  */' +
          ' tt VALUES ' +
          '/* insert Select INSERT INTO tt VALUES (?,?,?,?)  */' +
          ' (?) ' +
          '/* insert Select INSERT INTO tt VALUES (?,?,?,?)  */'
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: [
          '/* insert Select INSERT INTO tt VALUES (?,?,?,?)  */' +
            ' INSERT into ' +
            '/* insert Select INSERT INTO tt VALUES (?,?,?,?)  */' +
            ' tt VALUES',
          ' /* insert Select INSERT INTO tt VALUES (?,?,?,?)  */ (',
          ')',
          ' /* insert Select INSERT INTO tt VALUES (?,?,?,?)  */'
        ],
        reWritable: true
      });
    });

    it('rewritable with constant parameters and parameters after ', () => {
      const res = Parse.splitRewritableQuery(
        'INSERT INTO TABLE(col1,col2,col3,col4, col5) VALUES (9, ?, 5, ?, 8) ON DUPLICATE KEY UPDATE col2=?'
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: [
          'INSERT INTO TABLE(col1,col2,col3,col4, col5) VALUES',
          ' (9, ',
          ', 5, ',
          ', 8) ON DUPLICATE KEY UPDATE col2=',
          '',
          ''
        ],
        reWritable: false
      });
    });

    it('rewritable with multiple values ', () => {
      const res = Parse.splitRewritableQuery('INSERT INTO TABLE(col1,col2) VALUES (?, ?), (?, ?)');
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['INSERT INTO TABLE(col1,col2) VALUES', ' (', ', ', '), (', ', ', ')', ''],
        reWritable: false
      });
    });

    it('Call', () => {
      const res = Parse.splitRewritableQuery('CALL dsdssd(?,?)');
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['CALL dsdssd(', '', ',', ')', ''],
        reWritable: false
      });
    });

    it('Update', () => {
      const res = Parse.splitRewritableQuery('UPDATE MultiTestt4 SET test = ? WHERE test = ?');
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['UPDATE MultiTestt4 SET test = ', '', ' WHERE test = ', '', ''],
        reWritable: false
      });
    });

    it('insert select', () => {
      const res = Parse.splitRewritableQuery(
        'insert into test_insert_select ( field1) (select  TMP.field1 from ' +
          '(select CAST(? as binary) `field1` from dual) TMP)'
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: [
          'insert into test_insert_select ( field1) (select  TMP.field1 from (select CAST(',
          '',
          ' as binary) `field1` from dual) TMP)',
          ''
        ],
        reWritable: false
      });
    });

    it('select without parameter', () => {
      const res = Parse.splitRewritableQuery('SELECT testFunction()');
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['SELECT testFunction()', '', ''],
        reWritable: false
      });
    });

    it('insert without parameter', () => {
      const res = Parse.splitRewritableQuery('INSERT VALUES (testFunction())');
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['INSERT VALUES', ' (testFunction())', ''],
        reWritable: true
      });
    });

    it('select without parenthesis', () => {
      const res = Parse.splitRewritableQuery('SELECT 1');
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['SELECT 1', '', ''],
        reWritable: false
      });
    });

    it('insert without parameters', () => {
      const res = Parse.splitRewritableQuery('INSERT INTO tt VALUES (1)');
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['INSERT INTO tt VALUES', ' (1)', ''],
        reWritable: true
      });
    });

    it('semicolon', () => {
      const res = Parse.splitRewritableQuery(
        "INSERT INTO tt (tt) VALUES ('\\\\', ?); INSERT INTO tt (tt) VALUES ('multiple')"
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: [
          'INSERT INTO tt (tt) VALUES',
          " ('\\\\', ",
          ')',
          "; INSERT INTO tt (tt) VALUES ('multiple')"
        ],
        reWritable: false
      });
    });

    it('semicolon with empty data after', () => {
      const res = Parse.splitRewritableQuery('INSERT INTO table (column1) VALUES (?); ');
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['INSERT INTO table (column1) VALUES', ' (', ')', '; '],
        reWritable: false
      });
    });

    it('semicolon not rewritable if not at end', () => {
      const res = Parse.splitRewritableQuery('INSERT INTO table (column1) VALUES (?); SELECT 1');
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['INSERT INTO table (column1) VALUES', ' (', ')', '; SELECT 1'],
        reWritable: false
      });
    });

    it('line end comment', () => {
      const res = Parse.splitRewritableQuery('INSERT INTO tt (tt) VALUES (?) --fin');
      assert.deepEqual(res, {
        multipleQueries: false,
        partList: ['INSERT INTO tt (tt) VALUES', ' (', ')', ' --fin'],
        reWritable: true
      });
    });

    it('line finished comment', () => {
      const res = Parse.splitRewritableQuery('INSERT INTO tt (tt) VALUES --fin\n (?)');
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['INSERT INTO tt (tt) VALUES', ' --fin\n (', ')', ''],
        reWritable: true
      });
    });

    it('line finished comment', () => {
      const res = Parse.splitRewritableQuery(
        'INSERT INTO tt (tt, tt2) VALUES (LAST_INSERT_ID(), ?)'
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['INSERT INTO tt (tt, tt2) VALUES', ' (LAST_INSERT_ID(), ', ')', ''],
        reWritable: false
      });
    });
  });

  describe('named parameter batch rewrite', () => {
    const values = [
      { id1: 1, id2: 2 },
      { id3: 3, id2: 4 },
      { id2: 5, id1: 6 }
    ];

    it('select', () => {
      const res = Parse.splitRewritableNamedParameterQuery(
        'select \'\\\'\' as a, :id2 as b, "\\"" as c, :id1 as d',
        values
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ["select '\\'' as a, ", '', ' as b, "\\"" as c, ', '', ' as d'],
        values: [
          [2, 1],
          [4, null],
          [5, 6]
        ],
        reWritable: false
      });
    });

    it('select comment', () => {
      const res = Parse.splitRewritableNamedParameterQuery('select "d\\\\" as a #test', values);
      assert.deepEqual(res, {
        multipleQueries: false,
        partList: ['select "d\\\\" as a #test', '', ''],
        values: [[], [], []],
        reWritable: false
      });
    });

    it('rewritable with constant parameters ', () => {
      const res = Parse.splitRewritableNamedParameterQuery(
        'INSERT INTO TABLE(col1,col2,col3,col4, col5) VALUES (9, :id2, 5, :id1, 8) ON DUPLICATE KEY UPDATE col2=col2+10',
        values
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: [
          'INSERT INTO TABLE(col1,col2,col3,col4, col5) VALUES',
          ' (9, ',
          ', 5, ',
          ', 8)',
          ' ON DUPLICATE KEY UPDATE col2=col2+10'
        ],
        values: [
          [2, 1],
          [4, null],
          [5, 6]
        ],
        reWritable: true
      });
    });

    it('test comments ', () => {
      const res = Parse.splitRewritableNamedParameterQuery(
        '/* insert Select INSERT INTO tt VALUES (:id2,:id1,?,?)  */' +
          ' INSERT into ' +
          '/* insert Select INSERT INTO tt VALUES (?,:id2,?,?)  */' +
          ' tt VALUES ' +
          '/* insert Select INSERT INTO tt VALUES (?,?,:id2,?)  */' +
          ' (:id2) ' +
          '/* insert Select INSERT INTO tt VALUES (?,?,?,?)  */',
        values
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: [
          '/* insert Select INSERT INTO tt VALUES (:id2,:id1,?,?)  */' +
            ' INSERT into ' +
            '/* insert Select INSERT INTO tt VALUES (?,:id2,?,?)  */' +
            ' tt VALUES',
          ' /* insert Select INSERT INTO tt VALUES (?,?,:id2,?)  */ (',
          ')',
          ' /* insert Select INSERT INTO tt VALUES (?,?,?,?)  */'
        ],
        values: [[2], [4], [5]],
        reWritable: true
      });
    });

    it('rewritable with constant parameters and parameters after ', () => {
      const res = Parse.splitRewritableNamedParameterQuery(
        'INSERT INTO TABLE(col1,col2,col3,col4, col5) VALUES (9, :id2, 5, :id1, 8) ON DUPLICATE KEY UPDATE col2=:id3',
        values
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: [
          'INSERT INTO TABLE(col1,col2,col3,col4, col5) VALUES',
          ' (9, ',
          ', 5, ',
          ', 8) ON DUPLICATE KEY UPDATE col2=',
          '',
          ''
        ],
        values: [
          [2, 1, null],
          [4, null, 3],
          [5, 6, null]
        ],
        reWritable: false
      });
    });

    it('rewritable with multiple values ', () => {
      const res = Parse.splitRewritableNamedParameterQuery(
        'INSERT INTO TABLE(col1,col2) VALUES (:id2, :id3), (:id1, :id4)',
        values
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['INSERT INTO TABLE(col1,col2) VALUES', ' (', ', ', '), (', ', ', ')', ''],
        values: [
          [2, null, 1, null],
          [4, 3, null, null],
          [5, null, 6, null]
        ],
        reWritable: false
      });
    });

    it('Call', () => {
      const res = Parse.splitRewritableNamedParameterQuery('CALL dsdssd(:id1,:id2)', values);
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['CALL dsdssd(', '', ',', ')', ''],
        values: [
          [1, 2],
          [null, 4],
          [6, 5]
        ],
        reWritable: false
      });
    });

    it('Update', () => {
      const res = Parse.splitRewritableNamedParameterQuery(
        'UPDATE MultiTestt4 SET test = :id1 WHERE test = :id2',
        values
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['UPDATE MultiTestt4 SET test = ', '', ' WHERE test = ', '', ''],
        values: [
          [1, 2],
          [null, 4],
          [6, 5]
        ],
        reWritable: false
      });
    });

    it('insert select', () => {
      const res = Parse.splitRewritableNamedParameterQuery(
        'insert into test_insert_select ( field1) (select  TMP.field1 from ' +
          '(select CAST(:id1 as binary) `field1` from dual) TMP)',
        values
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: [
          'insert into test_insert_select ( field1) (select  TMP.field1 from (select CAST(',
          '',
          ' as binary) `field1` from dual) TMP)',
          ''
        ],
        values: [[1], [null], [6]],
        reWritable: false
      });
    });

    it('select without parameter', () => {
      const res = Parse.splitRewritableNamedParameterQuery('SELECT testFunction()', values);
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['SELECT testFunction()', '', ''],
        values: [[], [], []],
        reWritable: false
      });
    });

    it('insert without parameter', () => {
      const res = Parse.splitRewritableNamedParameterQuery(
        'INSERT VALUES (testFunction())',
        values
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['INSERT VALUES', ' (testFunction())', ''],
        values: [[], [], []],
        reWritable: true
      });
    });

    it('select without parenthesis', () => {
      const res = Parse.splitRewritableNamedParameterQuery('SELECT 1', values);
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['SELECT 1', '', ''],
        values: [[], [], []],
        reWritable: false
      });
    });

    it('insert without parameters', () => {
      const res = Parse.splitRewritableNamedParameterQuery('INSERT INTO tt VALUES (1)', values);
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['INSERT INTO tt VALUES', ' (1)', ''],
        values: [[], [], []],
        reWritable: true
      });
    });

    it('semicolon', () => {
      const res = Parse.splitRewritableNamedParameterQuery(
        "INSERT INTO tt (tt) VALUES (:id1); INSERT INTO tt (tt) VALUES ('multiple')",
        values
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: [
          'INSERT INTO tt (tt) VALUES',
          ' (',
          ')',
          "; INSERT INTO tt (tt) VALUES ('multiple')"
        ],
        values: [[1], [null], [6]],
        reWritable: false
      });
    });

    it('semicolon with empty data after', () => {
      const res = Parse.splitRewritableNamedParameterQuery(
        'INSERT INTO table (column1) VALUES (:id1); ',
        values
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['INSERT INTO table (column1) VALUES', ' (', ')', '; '],
        values: [[1], [null], [6]],
        reWritable: false
      });
    });

    it('semicolon not rewritable if not at end', () => {
      const res = Parse.splitRewritableNamedParameterQuery(
        'INSERT INTO table (column1) VALUES (:id1); SELECT 1',
        values
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['INSERT INTO table (column1) VALUES', ' (', ')', '; SELECT 1'],
        values: [[1], [null], [6]],
        reWritable: false
      });
    });

    it('line end comment', () => {
      const res = Parse.splitRewritableNamedParameterQuery(
        'INSERT INTO tt (tt) VALUES (:id1) --fin',
        values
      );
      assert.deepEqual(res, {
        multipleQueries: false,
        partList: ['INSERT INTO tt (tt) VALUES', ' (', ')', ' --fin'],
        values: [[1], [null], [6]],
        reWritable: true
      });
    });

    it('line finished comment', () => {
      const res = Parse.splitRewritableNamedParameterQuery(
        'INSERT INTO tt (tt) VALUES --fin\n (:id1)',
        values
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['INSERT INTO tt (tt) VALUES', ' --fin\n (', ')', ''],
        values: [[1], [null], [6]],
        reWritable: true
      });
    });

    it('line finished comment', () => {
      const res = Parse.splitRewritableNamedParameterQuery(
        'INSERT INTO tt (tt, tt2) VALUES (LAST_INSERT_ID(), :id1)',
        values
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ['INSERT INTO tt (tt, tt2) VALUES', ' (LAST_INSERT_ID(), ', ')', ''],
        values: [[1], [null], [6]],
        reWritable: false
      });
    });

    it('validateFileName', () => {
      assert.isTrue(
        Parse.validateFileName(
          "LOAD DATA LOCAL INFILE 'smallFileName' INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)",
          null,
          'smallFileName'
        )
      );
      assert.isFalse(
        Parse.validateFileName(
          "LOAD DATA LOCAL INFILE 'smallFileName' INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)",
          null,
          'smallFileName2'
        )
      );
      assert.isTrue(
        Parse.validateFileName(
          "LOAD DATA LOCAL INFILE ? INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)",
          ['smallFileName'],
          'smallFileName'
        )
      );
      assert.isFalse(
        Parse.validateFileName(
          "LOAD DATA LOCAL INFILE ? INTO TABLE smallLocalInfile FIELDS TERMINATED BY ',' (id, test)",
          ['smallFileName'],
          'smallFileName2'
        )
      );
    });
  });
});
