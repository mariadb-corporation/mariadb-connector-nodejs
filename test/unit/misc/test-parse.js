"use strict";

const Parse = require("../../../lib/misc/parse");
const { assert } = require("chai");

describe("parse", () => {
  describe("batch rewrite", () => {
    it("select", () => {
      const res = Parse.splitRewritableQuery("select '\\'' as a, ? as b, \"\\\"\" as c, ? as d");
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ["select '\\'' as a, ", "", ' as b, "\\"" as c, ', "", " as d"],
        reWritable: false
      });
    });

    it("rewritable with constant parameters ", () => {
      const res = Parse.splitRewritableQuery(
        "INSERT INTO TABLE(col1,col2,col3,col4, col5) VALUES (9, ?, 5, ?, 8) ON DUPLICATE KEY UPDATE col2=col2+10"
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: [
          "INSERT INTO TABLE(col1,col2,col3,col4, col5) VALUES",
          " (9, ",
          ", 5, ",
          ", 8)",
          " ON DUPLICATE KEY UPDATE col2=col2+10"
        ],
        reWritable: true
      });
    });

    it("test comments ", () => {
      const res = Parse.splitRewritableQuery(
        "/* insert Select INSERT INTO tt VALUES (?,?,?,?)  */" +
          " INSERT into " +
          "/* insert Select INSERT INTO tt VALUES (?,?,?,?)  */" +
          " tt VALUES " +
          "/* insert Select INSERT INTO tt VALUES (?,?,?,?)  */" +
          " (?) " +
          "/* insert Select INSERT INTO tt VALUES (?,?,?,?)  */"
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: [
          "/* insert Select INSERT INTO tt VALUES (?,?,?,?)  */" +
            " INSERT into " +
            "/* insert Select INSERT INTO tt VALUES (?,?,?,?)  */" +
            " tt VALUES",
          " /* insert Select INSERT INTO tt VALUES (?,?,?,?)  */ (",
          ")",
          " /* insert Select INSERT INTO tt VALUES (?,?,?,?)  */"
        ],
        reWritable: true
      });
    });

    it("rewritable with constant parameters and parameters after ", () => {
      const res = Parse.splitRewritableQuery(
        "INSERT INTO TABLE(col1,col2,col3,col4, col5) VALUES (9, ?, 5, ?, 8) ON DUPLICATE KEY UPDATE col2=?"
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: [
          "INSERT INTO TABLE(col1,col2,col3,col4, col5) VALUES",
          " (9, ",
          ", 5, ",
          ", 8) ON DUPLICATE KEY UPDATE col2=",
          "",
          ""
        ],
        reWritable: false
      });
    });

    it("rewritable with multiple values ", () => {
      const res = Parse.splitRewritableQuery("INSERT INTO TABLE(col1,col2) VALUES (?, ?), (?, ?)");
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ["INSERT INTO TABLE(col1,col2) VALUES", " (", ", ", "), (", ", ", ")", ""],
        reWritable: false
      });
    });

    it("Call", () => {
      const res = Parse.splitRewritableQuery("CALL dsdssd(?,?)");
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ["CALL dsdssd(", "", ",", ")", ""],
        reWritable: false
      });
    });

    it("Update", () => {
      const res = Parse.splitRewritableQuery("UPDATE MultiTestt4 SET test = ? WHERE test = ?");
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ["UPDATE MultiTestt4 SET test = ", "", " WHERE test = ", "", ""],
        reWritable: false
      });
    });

    it("insert select", () => {
      const res = Parse.splitRewritableQuery(
        "insert into test_insert_select ( field1) (select  TMP.field1 from " +
          "(select CAST(? as binary) `field1` from dual) TMP)"
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: [
          "insert into test_insert_select ( field1) (select  TMP.field1 from (select CAST(",
          "",
          " as binary) `field1` from dual) TMP)",
          ""
        ],
        reWritable: false
      });
    });

    it("select without parameter", () => {
      const res = Parse.splitRewritableQuery("SELECT testFunction()");
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ["SELECT testFunction()", "", ""],
        reWritable: false
      });
    });

    it("insert without parameter", () => {
      const res = Parse.splitRewritableQuery("INSERT VALUES (testFunction())");
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ["INSERT VALUES", " (testFunction())", ""],
        reWritable: true
      });
    });

    it("select without parenthesis", () => {
      const res = Parse.splitRewritableQuery("SELECT 1");
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ["SELECT 1", "", ""],
        reWritable: false
      });
    });

    it("insert without parameters", () => {
      const res = Parse.splitRewritableQuery("INSERT INTO tt VALUES (1)");
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ["INSERT INTO tt VALUES", " (1)", ""],
        reWritable: true
      });
    });

    it("semicolon", () => {
      const res = Parse.splitRewritableQuery(
        "INSERT INTO tt (tt) VALUES (?); INSERT INTO tt (tt) VALUES ('multiple')"
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: [
          "INSERT INTO tt (tt) VALUES",
          " (",
          ")",
          "; INSERT INTO tt (tt) VALUES ('multiple')"
        ],
        reWritable: false
      });
    });

    it("semicolon with empty data after", () => {
      const res = Parse.splitRewritableQuery("INSERT INTO table (column1) VALUES (?); ");
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ["INSERT INTO table (column1) VALUES", " (", ")", "; "],
        reWritable: false
      });
    });

    it("semicolon not rewritable if not at end", () => {
      const res = Parse.splitRewritableQuery("INSERT INTO table (column1) VALUES (?); SELECT 1");
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ["INSERT INTO table (column1) VALUES", " (", ")", "; SELECT 1"],
        reWritable: false
      });
    });

    it("line end comment", () => {
      const res = Parse.splitRewritableQuery("INSERT INTO tt (tt) VALUES (?) --fin");
      assert.deepEqual(res, {
        multipleQueries: false,
        partList: ["INSERT INTO tt (tt) VALUES", " (", ")", " --fin"],
        reWritable: true
      });
    });

    it("line finished comment", () => {
      const res = Parse.splitRewritableQuery("INSERT INTO tt (tt) VALUES --fin\n (?)");
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ["INSERT INTO tt (tt) VALUES", " --fin\n (", ")", ""],
        reWritable: true
      });
    });

    it("line finished comment", () => {
      const res = Parse.splitRewritableQuery(
        "INSERT INTO tt (tt, tt2) VALUES (LAST_INSERT_ID(), ?)"
      );
      assert.deepEqual(res, {
        multipleQueries: true,
        partList: ["INSERT INTO tt (tt, tt2) VALUES", " (LAST_INSERT_ID(), ", ")", ""],
        reWritable: false
      });
    });
  });
});
