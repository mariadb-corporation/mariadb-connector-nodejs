"use strict";

const base = require("../base.js");
const { assert } = require("chai");
const Collations = require("../../lib/const/collations.js");
const FieldType = require("../../lib/const/field-type");

describe("metadata", () => {
  it("result metadata values", function(done) {
    shareConn
      .query(
        "CREATE TEMPORARY TABLE metadatatable (id BIGINT not null primary key auto_increment, t varchar(32) UNIQUE, d DECIMAL(10,4) UNSIGNED ZEROFILL) COLLATE='utf8mb4_unicode_ci'"
      )
      .then(() => {
        return shareConn.query("SELECT id as id1, t as t1, d as d1 FROM metadatatable as tm");
      })
      .then(rows => {
        assert.equal(rows.meta.length, 3);

        assert.equal(rows.meta[0].db, "testn");
        assert.equal(rows.meta[0].schema, "testn");
        assert.equal(rows.meta[0].table, "tm");
        assert.equal(rows.meta[0].orgTable, "metadatatable");
        assert.equal(rows.meta[0].name, "id1");
        assert.equal(rows.meta[0].orgName, "id");
        assert.equal(rows.meta[0].collation, Collations.fromName("BINARY"));
        assert.equal(rows.meta[0].columnLength, 20);
        assert.equal(rows.meta[0].columnType, FieldType.LONGLONG);
        assert.equal(rows.meta[0].decimals, 0);
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
        assert.equal(rows.meta[1].decimals, 0);
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
        assert.equal(rows.meta[2].decimals, 4);
        assert.equal(rows.meta[2].isUnsigned(), true);
        assert.equal(rows.meta[2].canBeNull(), true);
        assert.equal(rows.meta[2].isPrimaryKey(), false);
        assert.equal(rows.meta[2].isUniqueKey(), false);
        assert.equal(rows.meta[2].isMultipleKey(), false);
        assert.equal(rows.meta[2].isBlob(), false);
        assert.equal(rows.meta[2].isZeroFill(), true);
        assert.equal(rows.meta[2].isBinary(), true);
        assert.equal(rows.meta[2].isAutoIncrement(), false);
        assert.equal(rows.meta[2].getPrecision(), 11);
        assert.equal(rows.meta[2].getDisplaySize(), 11);
        done();
      })
      .catch(done);
  });
});
