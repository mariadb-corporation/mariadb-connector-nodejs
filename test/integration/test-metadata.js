"use strict";

const base = require("../base.js");
const { assert } = require("chai");
const Collations = require("../../lib/const/collations.js");
const FieldType = require("../../lib/const/field-type");

describe("metadata", () => {
  it("result metadata values", function(done) {
    shareConn
      .query(
        "CREATE TEMPORARY TABLE metadatatable (id BIGINT not null primary key auto_increment, " +
          "t varchar(32) UNIQUE, " +
          "d DECIMAL(10,4) UNSIGNED ZEROFILL, " +
          "ds DECIMAL(10,4) SIGNED, " +
          "d2 DECIMAL(10,0) UNSIGNED, " +
          "ds2 DECIMAL(10,0) SIGNED " +
          ") COLLATE='utf8mb4_unicode_ci'"
      )
      .then(() => {
        return shareConn.query(
          "SELECT id as id1, t as t1, d as d1, ds as d2, d2 as d3, ds2 as d4 FROM metadatatable as tm"
        );
      })
      .then(rows => {
        assert.equal(rows.meta.length, 6);

        assert.equal(rows.meta[0].db, "testn");
        assert.equal(rows.meta[0].schema, "testn");
        assert.equal(rows.meta[0].table, "tm");
        assert.equal(rows.meta[0].orgTable, "metadatatable");
        assert.equal(rows.meta[0].name, "id1");
        assert.equal(rows.meta[0].orgName, "id");
        assert.equal(rows.meta[0].collation, Collations.fromName("BINARY"));
        assert.equal(rows.meta[0].columnLength, 20);
        assert.equal(rows.meta[0].columnType, FieldType.LONGLONG);
        assert.equal(rows.meta[0].isUnsigned(), false);
        assert.equal(rows.meta[0].canBeNull(), false);
        assert.equal(rows.meta[0].isPrimaryKey(), true);
        assert.equal(rows.meta[0].isUniqueKey(), false);
        assert.equal(rows.meta[0].isMultipleKey(), false);
        assert.equal(rows.meta[0].isBlob(), false);
        assert.equal(rows.meta[0].isZeroFill(), false);
        assert.equal(rows.meta[0].isBinary(), true);
        assert.equal(rows.meta[0].isAutoIncrement(), true);
        assert.equal(rows.meta[0].getPrecision(), 20);
        assert.equal(rows.meta[0].getScale(), 0);
        assert.equal(rows.meta[0].getDisplaySize(), 20);

        assert.equal(rows.meta[1].db, "testn");
        assert.equal(rows.meta[1].schema, "testn");
        assert.equal(rows.meta[1].table, "tm");
        assert.equal(rows.meta[1].orgTable, "metadatatable");
        assert.equal(rows.meta[1].name, "t1");
        assert.equal(rows.meta[1].orgName, "t");
        assert.equal(rows.meta[1].collation, Collations.fromName("UTF8MB4_UNICODE_CI"));
        assert.equal(rows.meta[1].columnLength, 128);
        assert.equal(rows.meta[1].columnType, FieldType.VAR_STRING);
        assert.equal(rows.meta[1].isUnsigned(), false);
        assert.equal(rows.meta[1].canBeNull(), true);
        assert.equal(rows.meta[1].isPrimaryKey(), false);
        assert.equal(rows.meta[1].isUniqueKey(), true);
        assert.equal(rows.meta[1].isMultipleKey(), false);
        assert.equal(rows.meta[1].isBlob(), false);
        assert.equal(rows.meta[1].isZeroFill(), false);
        assert.equal(rows.meta[1].isBinary(), false);
        assert.equal(rows.meta[1].isAutoIncrement(), false);
        assert.equal(rows.meta[1].getPrecision(), 128);
        assert.equal(rows.meta[1].getScale(), 0);
        assert.equal(rows.meta[1].getDisplaySize(), 32);

        assert.equal(rows.meta[2].db, "testn");
        assert.equal(rows.meta[2].schema, "testn");
        assert.equal(rows.meta[2].table, "tm");
        assert.equal(rows.meta[2].orgTable, "metadatatable");
        assert.equal(rows.meta[2].name, "d1");
        assert.equal(rows.meta[2].orgName, "d");
        assert.equal(rows.meta[2].collation, Collations.fromName("BINARY"));
        assert.equal(rows.meta[2].columnLength, 11);
        assert.equal(rows.meta[2].columnType, FieldType.NEWDECIMAL);
        assert.equal(rows.meta[2].isUnsigned(), true);
        assert.equal(rows.meta[2].canBeNull(), true);
        assert.equal(rows.meta[2].isPrimaryKey(), false);
        assert.equal(rows.meta[2].isUniqueKey(), false);
        assert.equal(rows.meta[2].isMultipleKey(), false);
        assert.equal(rows.meta[2].isBlob(), false);
        assert.equal(rows.meta[2].isZeroFill(), true);
        assert.equal(rows.meta[2].isBinary(), true);
        assert.equal(rows.meta[2].isAutoIncrement(), false);
        assert.equal(rows.meta[2].getPrecision(), 10);
        assert.equal(rows.meta[2].getScale(), 4);
        assert.equal(rows.meta[2].getDisplaySize(), 11);

        assert.equal(rows.meta[3].db, "testn");
        assert.equal(rows.meta[3].schema, "testn");
        assert.equal(rows.meta[3].table, "tm");
        assert.equal(rows.meta[3].orgTable, "metadatatable");
        assert.equal(rows.meta[3].name, "d2");
        assert.equal(rows.meta[3].orgName, "ds");
        assert.equal(rows.meta[3].collation, Collations.fromName("BINARY"));
        assert.equal(rows.meta[3].columnLength, 12);
        assert.equal(rows.meta[3].columnType, FieldType.NEWDECIMAL);
        assert.equal(rows.meta[3].isUnsigned(), false);
        assert.equal(rows.meta[3].canBeNull(), true);
        assert.equal(rows.meta[3].isPrimaryKey(), false);
        assert.equal(rows.meta[3].isUniqueKey(), false);
        assert.equal(rows.meta[3].isMultipleKey(), false);
        assert.equal(rows.meta[3].isBlob(), false);
        assert.equal(rows.meta[3].isZeroFill(), false);
        assert.equal(rows.meta[3].isBinary(), true);
        assert.equal(rows.meta[3].isAutoIncrement(), false);
        assert.equal(rows.meta[3].getPrecision(), 10);
        assert.equal(rows.meta[3].getScale(), 4);
        assert.equal(rows.meta[3].getDisplaySize(), 12);

        assert.equal(rows.meta[4].getPrecision(), 10);
        assert.equal(rows.meta[4].getScale(), 0);
        assert.equal(rows.meta[4].getDisplaySize(), 10);

        assert.equal(rows.meta[5].getPrecision(), 10);
        assert.equal(rows.meta[5].getScale(), 0);
        assert.equal(rows.meta[5].getDisplaySize(), 11);

        done();
      })
      .catch(done);
  });
});
