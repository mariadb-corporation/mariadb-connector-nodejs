//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

const Parse = require('../../../lib/misc/parse');
const { assert } = require('chai');

describe('parse', () => {
  const values = [
    { id1: 1, id2: 2 },
    { id3: 3, id2: 4 },
    { id2: 5, id1: 6 }
  ];

  describe('split', () => {
    it('EOF', () => {
      const res = Parse.splitQuery(Buffer.from('select ? // comment ? \n , ?', 'utf8'));
      assert.deepEqual(res, [7, 8, 26, 27]);
    });
  });

  describe('split queries', () => {
    it('Normal', () => {
      const sqlBytes = Buffer.from('select ? // comment ? \n , ?;\nINSERT 1\n;', 'utf8');
      const buf = {
        buffer: sqlBytes,
        offset: 0,
        end: sqlBytes.length
      };
      const res = Parse.parseQueries(buf);
      assert.deepEqual(res, ['select ? // comment ? \n , ?', '\nINSERT 1\n']);
    });
    it('Normal ending semicolon', () => {
      const sqlBytes = Buffer.from('select ? // comment ? \n , ?;\nINSERT 1;', 'utf8');
      const buf = {
        buffer: sqlBytes,
        offset: 0,
        end: sqlBytes.length
      };
      const res = Parse.parseQueries(buf);
      assert.deepEqual(res, ['select ? // comment ? \n , ?', '\nINSERT 1']);
    });
    it('EOF', () => {
      const sqlBytes = Buffer.from('select ? // comment ; \n , ?;\nINSERT 1\n;', 'utf8');
      const buf = {
        buffer: sqlBytes,
        offset: 0,
        end: sqlBytes.length
      };
      const res = Parse.parseQueries(buf);
      assert.deepEqual(res, ['select ? // comment ; \n , ?', '\nINSERT 1\n']);
    });

    it('EOF in comment', () => {
      const sqlBytes = Buffer.from('select ? "// comment ; "\n , ?;\nINSERT 1\n;', 'utf8');
      const buf = {
        buffer: sqlBytes,
        offset: 0,
        end: sqlBytes.length
      };
      const res = Parse.parseQueries(buf);
      assert.deepEqual(res, ['select ? "// comment ; "\n , ?', '\nINSERT 1\n']);
    });

    it('EOF in comment 2', () => {
      const sqlBytes = Buffer.from("select ? '// comment ; '\n , ?;\nINSERT 1\n;", 'utf8');
      const buf = {
        buffer: sqlBytes,
        offset: 0,
        end: sqlBytes.length
      };
      const res = Parse.parseQueries(buf);
      assert.deepEqual(res, ["select ? '// comment ; '\n , ?", '\nINSERT 1\n']);
    });

    it('EOF in comment 3', () => {
      const sqlBytes = Buffer.from("select ? \\'// comment ; '\n , ?;\nINSERT 1\n;", 'utf8');
      const buf = {
        buffer: sqlBytes,
        offset: 0,
        end: sqlBytes.length
      };
      const res = Parse.parseQueries(buf);
      assert.deepEqual(res, ["select ? \\'// comment ; '\n , ?", '\nINSERT 1\n']);
    });

    it('escape quotes', () => {
      const sqlBytes = Buffer.from('select ? "// comment \\"; "\n , ?;\nINSERT 1\n;', 'utf8');
      const buf = {
        buffer: sqlBytes,
        offset: 0,
        end: sqlBytes.length
      };
      const res = Parse.parseQueries(buf);
      assert.deepEqual(res, ['select ? "// comment \\"; "\n , ?', '\nINSERT 1\n']);
    });

    it('Hash', () => {
      const sqlBytes = Buffer.from('select ? # comment ; \n , ?;\nINSERT 1\n;', 'utf8');
      const buf = {
        buffer: sqlBytes,
        offset: 0,
        end: sqlBytes.length
      };
      const res = Parse.parseQueries(buf);
      assert.deepEqual(res, ['select ? # comment ; \n , ?', '\nINSERT 1\n']);
    });

    it('multiples', () => {
      const sqlBytes = Buffer.from('select ? # comment ; \n , ?;\nINSERT 1\n; SELECT', 'utf8');
      const buf = {
        buffer: sqlBytes,
        offset: 0,
        end: sqlBytes.length
      };
      const res = Parse.parseQueries(buf);
      assert.deepEqual(res, ['select ? # comment ; \n , ?', '\nINSERT 1\n']);
    });
  });

  describe('basic placeholder', () => {
    it('select', () => {
      const res = Parse.searchPlaceholder('select \'\\\'\' as a, :id2 as b, "\\"" as c, :id1 as d', null, values);
      assert.deepEqual(res, {
        placeHolderIndex: ['id2', 'id1'],
        sql: 'select \'\\\'\' as a, ? as b, "\\"" as c, ? as d'
      });
    });

    it('EOF', () => {
      const res = Parse.searchPlaceholder('select :id1 // comment :id2 \n , :id3');
      assert.deepEqual(res, {
        placeHolderIndex: ['id1', 'id2', 'id3'],
        sql: 'select ? // comment ? \n , ?'
      });
    });

    it('question mark', () => {
      const sql = 'select :id1 // comment :id2 \n , ?';
      const res = Parse.splitQueryPlaceholder(Buffer.from(sql, 'utf8'), null, { id1: 1, id2: 2, id3: 3 }, () => sql);
      assert.deepEqual(res, {
        paramPositions: [7, 11, 32, 33],
        values: [1]
      });
    });

    it('rewritable with constant parameters ', () => {
      const res = Parse.searchPlaceholder(
        'INSERT INTO TABLE(col1,col2,col3,col4, col5) VALUES (9, :id2, 5, :id1, 8) ON DUPLICATE KEY UPDATE col2=col2+10',
        null,
        values
      );
      assert.deepEqual(res, {
        placeHolderIndex: ['id2', 'id1'],
        sql: 'INSERT INTO TABLE(col1,col2,col3,col4, col5) VALUES (9, ?, 5, ?, 8) ON DUPLICATE KEY UPDATE col2=col2+10'
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
        placeHolderIndex: ['id2'],
        sql: '/* insert Select INSERT INTO tt VALUES (:id2,:id1,?,?)  */ INSERT into /* insert Select INSERT INTO tt VALUES (?,:id2,?,?)  */ tt VALUES /* insert Select INSERT INTO tt VALUES (?,?,:id2,?)  */ (?) /* insert Select INSERT INTO tt VALUES (?,?,?,?)  */'
      });
    });

    it('rewritable with constant parameters and parameters after ', () => {
      const res = Parse.searchPlaceholder(
        'INSERT INTO TABLE(col1,col2,col3,col4, col5) VALUES (9, :id2, 5, :id1, 8) ON DUPLICATE KEY UPDATE col2=:id3',
        null,
        values
      );
      assert.deepEqual(res, {
        placeHolderIndex: ['id2', 'id1', 'id3'],
        sql: 'INSERT INTO TABLE(col1,col2,col3,col4, col5) VALUES (9, ?, 5, ?, 8) ON DUPLICATE KEY UPDATE col2=?'
      });
    });

    it('rewritable with multiple values ', () => {
      const res = Parse.searchPlaceholder(
        'INSERT INTO TABLE(col1,col2) VALUES (:id2, :id3), (:id1, :id4)',
        null,
        values
      );
      assert.deepEqual(res, {
        placeHolderIndex: ['id2', 'id3', 'id1', 'id4'],
        sql: 'INSERT INTO TABLE(col1,col2) VALUES (?, ?), (?, ?)'
      });
    });

    it('Call', () => {
      const res = Parse.searchPlaceholder('CALL dsdssd(:id1,:id2)', null, values);
      assert.deepEqual(res, {
        placeHolderIndex: ['id1', 'id2'],
        sql: 'CALL dsdssd(?,?)'
      });
    });

    it('Update', () => {
      const res = Parse.searchPlaceholder(
        "UPDATE MultiTestt4 SET test = :id1 #comm :id3\n WHERE s='\\\\' and test = :id2",
        null,
        values
      );
      assert.deepEqual(res, {
        placeHolderIndex: ['id1', 'id2'],
        sql: "UPDATE MultiTestt4 SET test = ? #comm :id3\n WHERE s='\\\\' and test = ?"
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
        placeHolderIndex: ['id1'],
        sql: 'insert into test_insert_select ( field1) (select  TMP.field1 from (select CAST(? as binary) `field1` from dual) TMP)'
      });
    });

    it('select without parameter', () => {
      const res = Parse.searchPlaceholder('SELECT testFunction()', null, values);
      assert.deepEqual(res, {
        placeHolderIndex: [],
        sql: 'SELECT testFunction()'
      });
    });

    it('insert without parameter', () => {
      const res = Parse.searchPlaceholder('INSERT VALUES (testFunction())', null, values);
      assert.deepEqual(res, {
        placeHolderIndex: [],
        sql: 'INSERT VALUES (testFunction())'
      });
    });

    it('select without parenthesis', () => {
      const res = Parse.searchPlaceholder('SELECT 1', null, values);
      assert.deepEqual(res, {
        placeHolderIndex: [],
        sql: 'SELECT 1'
      });
    });

    it('insert without parameters', () => {
      const res = Parse.searchPlaceholder('INSERT INTO tt VALUES (1)', null, values);
      assert.deepEqual(res, {
        placeHolderIndex: [],
        sql: 'INSERT INTO tt VALUES (1)'
      });
    });

    it('semicolon', () => {
      const res = Parse.searchPlaceholder(
        "INSERT INTO tt (tt) VALUES (:id1); INSERT INTO tt (tt) VALUES ('multiple')",
        null,
        values
      );
      assert.deepEqual(res, {
        placeHolderIndex: ['id1'],
        sql: "INSERT INTO tt (tt) VALUES (?); INSERT INTO tt (tt) VALUES ('multiple')"
      });
    });

    it('semicolon with empty data after', () => {
      const res = Parse.searchPlaceholder('INSERT INTO table (column1) VALUES (:id1); ', null, values);
      assert.deepEqual(res, {
        placeHolderIndex: ['id1'],
        sql: 'INSERT INTO table (column1) VALUES (?); '
      });
    });

    it('semicolon not rewritable if not at end', () => {
      const res = Parse.searchPlaceholder('INSERT INTO table (column1) VALUES (:id1); SELECT 1', null, values);
      assert.deepEqual(res, {
        placeHolderIndex: ['id1'],
        sql: 'INSERT INTO table (column1) VALUES (?); SELECT 1'
      });
    });

    it('line end comment', () => {
      const res = Parse.searchPlaceholder('INSERT INTO tt (tt) VALUES (:id1) --fin', null, values);
      assert.deepEqual(res, {
        placeHolderIndex: ['id1'],
        sql: 'INSERT INTO tt (tt) VALUES (?) --fin'
      });
    });

    it('line finished comment', () => {
      const res = Parse.searchPlaceholder('INSERT INTO tt (tt) VALUES --fin\n (:id1)', null, values);
      assert.deepEqual(res, {
        placeHolderIndex: ['id1'],
        sql: 'INSERT INTO tt (tt) VALUES --fin\n (?)'
      });
    });

    it('multiple parenthesis', () => {
      const res = Parse.searchPlaceholder('INSERT INTO select_tt (tt, tt2) VALUES (LAST_INSERT_ID(), :id1)', values);
      assert.deepEqual(res, {
        placeHolderIndex: ['id1'],
        sql: 'INSERT INTO select_tt (tt, tt2) VALUES (LAST_INSERT_ID(), ?)'
      });
    });
  });

  describe('validate file name', () => {
    it('error', () => {
      assert.isTrue(Parse.validateFileName("LOAD DATA LOCAL INFILE 'C:/Temp/myFile.txt'", [], 'C:/Temp/myFile.txt'));
      assert.isFalse(Parse.validateFileName("LOAD DATA LOCAL INFILE 'C:/Temp/myFile.txt'", [], 'C:/myFile.txt'));
      assert.isTrue(Parse.validateFileName('LOAD DATA LOCAL INFILE ?', ['C:/Temp/myFile.txt'], 'C:/Temp/myFile.txt'));
      assert.isFalse(Parse.validateFileName('LOAD DATA LOCAL INFILE ?', [], 'C:/Temp/myFile.txt'));
    });
  });
});
