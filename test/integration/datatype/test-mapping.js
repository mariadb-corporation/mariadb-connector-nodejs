"use strict";

const base = require("../../base.js");
const assert = require("chai").assert;

describe("mapping", () => {
  const dateNoMillis = new Date(Date.UTC(2018, 2, 1, 15, 20, 10));
  const dateMillis = new Date(Date.UTC(2018, 2, 1, 15, 20, 10));
  dateMillis.setUTCMilliseconds(556);

  const initValue = [
    Buffer.from([0x01]), //bit1
    Buffer.from([0x03]), //bit2
    -10, //TINYINT
    150, //TINYINT UNSIGNED
    0, //BOOL
    32767, //SMALLINT
    65535, //SMALLINT UNSIGNED
    55000, //MEDIUMINT
    70000, //MEDIUMINT UNSIGNED
    2147483647, //INT
    2147483647, //INT UNSIGNED
    Number.MAX_SAFE_INTEGER, //BIGINT
    Number.MAX_SAFE_INTEGER, //BIGINT UNSIGNED
    45.12, //FLOAT
    2147483647.12, //DOUBLE
    5512, //DECIMAL
    2147483647.2147, //DECIMAL(15,4)
    new Date(2018, 1, 1, 0, 0, 0), //DATE
    dateMillis, //DATETIME(6)
    dateMillis, //TIMESTAMP
    dateNoMillis, //TIMESTAMP(0)
    dateNoMillis, //TIMESTAMP
    "22:11:05.123456", //TIME(6)
    18, //YEAR 2/4
    2125, //YEAR 4
    "A", //CHAR(1)
    "B", //CHAR(1) binary
    "0", //VARCHAR(1)
    "ABC", //VARCHAR(10) BINARY
    Buffer.from([0xff, 0x00, 0xff, 0x00, 0xff, 0x00, 0xff, 0x00, 0xff, 0x00]), //BINARY(10)
    Buffer.from([0xff, 0x00, 0xff, 0x00, 0xff]) //VARBINARY(10)
  ];

  const utc2001Date = new Date(2001, 0, 1, 0, 0, 0);

  const nullValue = [
    null, //bit1
    null, //bit2
    null, //TINYINT
    null, //TINYINT UNSIGNED
    1, //BOOL
    1, //SMALLINT
    0, //SMALLINT UNSIGNED
    1, //MEDIUMINT
    0, //MEDIUMINT UNSIGNED
    1, //INT
    0, //INT UNSIGNED
    1, //BIGINT
    0, //BIGINT UNSIGNED
    0.0, //FLOAT
    1, //DOUBLE
    0.0, //DECIMAL
    0.0, //DECIMAL(15,4)
    utc2001Date, //DATE
    utc2001Date, //DATETIME(6)
    utc2001Date, //TIMESTAMP
    utc2001Date, //TIMESTAMP(0)
    null, //TIMESTAMP
    "22:11:00.560001", //TIME(6)
    99, //YEAR 2/4
    2011, //YEAR 4
    "0", //CHAR(1)
    "0", //CHAR(1) binary
    "1", //VARCHAR(1)
    "Z", //VARCHAR(10) BINARY
    Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), //BINARY(10)
    Buffer.from([0x01]) //VARBINARY(10)
  ];

  before(done => {
    shareConn.query(
      "CREATE TEMPORARY TABLE nullMappingTable(" +
        "t1 BIT(1) NULL," +
        "t2 BIT(2) NULL," +
        "t3 TINYINT NULL," +
        "t4 TINYINT UNSIGNED NULL," +
        "t5 BOOL NULL," +
        "t6 SMALLINT NULL," +
        "t7 SMALLINT UNSIGNED NULL," +
        "t8 MEDIUMINT NULL," +
        "t9 MEDIUMINT UNSIGNED NULL," +
        "t10 INT NULL," +
        "t11 INT UNSIGNED NULL," +
        "t12 BIGINT NULL," +
        "t13 BIGINT UNSIGNED NULL," +
        "t14 FLOAT NULL," +
        "t15 DOUBLE NULL," +
        "t16 DECIMAL NULL," +
        "t17 DATE NULL," +
        "t18 DATETIME NULL," +
        "t19 TIMESTAMP NULL," +
        "t20 TIME NULL," +
        "t21 YEAR NULL," +
        "t22 CHAR(1) NULL," +
        "t23 CHAR(1) binary NULL," +
        "t24 VARCHAR(1) NULL," +
        "t25 VARCHAR(10) BINARY NULL," +
        "t26 BINARY(10) NULL," +
        "t27 VARBINARY(10) NULL)"
    );
    shareConn.query("INSERT INTO nullMappingTable values ()");
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 6)) {
      //MySQL 5.5 doesn't permit DATETIME/TIMESTAMP with microseconds
      done();
    } else {
      //MySQL 5.6 delete YEAR(2) type
      if (!shareConn.isMariaDB() && shareConn.hasMinVersion(5, 6)) {
        initValue[23] = 2018;
        nullValue[23] = 1999;
      }
      shareConn.query(
        "CREATE TEMPORARY TABLE mappingTable(" +
          "t1 BIT(1)," +
          "t2 BIT(2)," +
          "t3 TINYINT," +
          "t4 TINYINT UNSIGNED," +
          "t5 BOOL default 1," +
          "t6 SMALLINT default 1," +
          "t7 SMALLINT UNSIGNED default 0," +
          "t8 MEDIUMINT default 1," +
          "t9 MEDIUMINT UNSIGNED default 0," +
          "t10 INT default 1," +
          "t11 INT UNSIGNED default 0," +
          "t12 BIGINT default 1," +
          "t13 BIGINT UNSIGNED default 0," +
          "t14 FLOAT default 0," +
          "t15 DOUBLE default 1," +
          "t16 DECIMAL default 0," +
          "t17 DECIMAL(15,4) default 0," +
          "t18 DATE default '2001-01-01'," +
          "t19 DATETIME(6) default '2001-01-01 00:00:00'," +
          "t20 TIMESTAMP(6) default  '2001-01-01 00:00:00'," +
          "t21 TIMESTAMP(0) null default  '2001-01-01 00:00:00'," +
          "t22 TIMESTAMP  null, " +
          "t23 TIME(6) default '22:11:00.560001'," +
          (!shareConn.isMariaDB() && shareConn.hasMinVersion(5, 6)
            ? "t24 YEAR(4) default 99,"
            : "t24 YEAR(2) default 99,") +
          "t25 YEAR(4) default 2011," +
          "t26 CHAR(1) default '0'," +
          "t27 CHAR(1) binary default '0'," +
          "t28 VARCHAR(1) default '1'," +
          "t29 VARCHAR(10) BINARY default 0x5a," +
          "t30 BINARY(10) default 0x1," +
          "t31 VARBINARY(10) default 0x1" +
          ")",
        function(err) {
          if (err) return done(err);
          shareConn.query(
            "INSERT INTO mappingTable VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            initValue,
            function(err) {
              if (err) return done(err);
              shareConn.query("INSERT INTO mappingTable VALUES ()", function(err) {
                if (err) return done(err);
                done();
              });
            }
          );
        }
      );
    }
  });

  it("query mapping field", function(done) {
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 6)) {
      //MySQL 5.5 doesn't permit DATETIME/TIMESTAMP with microseconds
      this.skip();
    }

    shareConn.query("SELECT * FROM mappingTable", function(err, rows) {
      if (err) return done(err);
      for (let i = 0; i < initValue.length; i++) {
        assert.deepStrictEqual(rows[0]["t" + (i + 1)], initValue[i]);
      }
      for (let i = 0; i < initValue.length; i++) {
        assert.deepStrictEqual(rows[1]["t" + (i + 1)], nullValue[i]);
      }
      done();
    });
  });

  it("execute mapping field", function(done) {
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 6)) {
      //MySQL 5.5 doesn't permit DATETIME/TIMESTAMP with microseconds
      this.skip();
    }

    shareConn.execute("SELECT * FROM mappingTable", function(err, rows) {
      if (err) return done(err);
      for (let i = 0; i < initValue.length; i++) {
        if (i === 13) {
          //float doesn't have exact precision
          assert.ok(rows[0].t14 > initValue[13] - 0.001 && rows[0].t14 < initValue[13] + 0.001);
        } else {
          assert.deepStrictEqual(rows[0]["t" + (i + 1)], initValue[i]);
        }
      }
      for (let i = 0; i < initValue.length; i++) {
        assert.deepStrictEqual(rows[1]["t" + (i + 1)], nullValue[i]);
      }
      done();
    });
  });

  it("query null mapping field", done => {
    shareConn.query("SELECT * FROM nullMappingTable", function(err, rows) {
      if (err) return done(err);
      for (let i = 0; i < 27; i++) {
        assert.equal(rows[0]["t" + (i + 1)], null);
      }
      done();
    });
  });

  it("execute null mapping field", done => {
    shareConn.execute("SELECT * FROM nullMappingTable", function(err, rows) {
      if (err) return done(err);
      for (let i = 0; i < 27; i++) {
        assert.equal(rows[0]["t" + (i + 1)], null);
      }
      done();
    });
  });

  it("dataType with null", done => {
    shareConn.query(
      "CREATE TEMPORARY TABLE dataTypeWithNull (id int not null primary key auto_increment, test longblob, test2 blob, test3 text)"
    );
    shareConn.query("insert into dataTypeWithNull values(null, 'a','b','c')");
    shareConn.query("SELECT * FROM dataTypeWithNull", function(err, rows) {
      if (err) return done(err);
      assert.ok(Buffer.isBuffer(rows[0].test));
      assert.ok(Buffer.isBuffer(rows[0].test2));
      assert.ok(typeof typeof rows[0].test3 === "string" || typeof rows[0].test3 instanceof String);
      done();
    });
  });
});
