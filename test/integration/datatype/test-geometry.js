"use strict";

const base = require("../../base.js");
const { assert } = require("chai");

describe("geometry data type", () => {
  it("Point format", done => {
    let prefix = "";
    if (!shareConn.isMariaDB() && shareConn.hasMinVersion(8, 0, 0)) prefix = "ST_";

    shareConn.query("CREATE TEMPORARY TABLE gis_point  (g POINT)");
    shareConn
      .query(
        "INSERT INTO gis_point VALUES\n" +
          "    (" +
          prefix +
          "PointFromText('POINT(10 10)')),\n" +
          "    (" +
          prefix +
          "PointFromText('POINT(20 10)')),\n" +
          "    (" +
          prefix +
          "PointFromText('POINT(20 20)')),\n" +
          "    (" +
          prefix +
          "PointFromText('POINT(10 20)'))"
      )
      .then(() => {
        return shareConn.query("SELECT * FROM gis_point");
      })
      .then(rows => {
        assert.deepEqual(rows, [
          { g: { x: 10, y: 10 } },
          { g: { x: 20, y: 10 } },
          { g: { x: 20, y: 20 } },
          { g: { x: 10, y: 20 } }
        ]);
        done();
      })
      .catch(done);
  });

  it("LineString format", done => {
    let prefix = "";
    if (!shareConn.isMariaDB() && shareConn.hasMinVersion(8, 0, 0)) prefix = "ST_";

    shareConn.query("CREATE TEMPORARY TABLE gis_line  (g LINESTRING)");
    shareConn
      .query(
        "INSERT INTO gis_line VALUES\n" +
          "    (" +
          prefix +
          "LineFromText('LINESTRING(0 0,0 10,10 0)')),\n" +
          "    (" +
          prefix +
          "LineStringFromText('LINESTRING(10 10,20 10,20 20,10 20,10 10)')),\n" +
          "    (" +
          prefix +
          "LineStringFromWKB(" +
          prefix +
          "AsWKB(LineString(Point(10, 10), Point(40, 10)))))"
      )
      .then(() => {
        return shareConn.query("SELECT * FROM gis_line");
      })
      .then(rows => {
        assert.deepEqual(rows, [
          { g: [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 0 }] },
          {
            g: [
              { x: 10, y: 10 },
              { x: 20, y: 10 },
              { x: 20, y: 20 },
              { x: 10, y: 20 },
              { x: 10, y: 10 }
            ]
          },
          { g: [{ x: 10, y: 10 }, { x: 40, y: 10 }] }
        ]);
        done();
      })
      .catch(done);
  });

  it("Polygon format", done => {
    let prefix = "";
    if (!shareConn.isMariaDB() && shareConn.hasMinVersion(8, 0, 0)) prefix = "ST_";

    shareConn.query("CREATE TEMPORARY TABLE gis_polygon (g POLYGON)");
    shareConn
      .query(
        "INSERT INTO gis_polygon VALUES\n" +
          "    (" +
          prefix +
          "PolygonFromText('POLYGON((10 10,20 10,20 20,10 20,10 10))')),\n" +
          "    (" +
          prefix +
          "PolyFromText('POLYGON((0 0,50 0,50 50,0 50,0 0), (10 10,20 10,20 20,10 20,10 10))')),\n" +
          "    (" +
          prefix +
          "PolyFromWKB(" +
          prefix +
          "AsWKB(Polygon(LineString(Point(0, 0), Point(30, 0), Point(30, 30), Point(0, 0))))))"
      )
      .then(() => {
        return shareConn.query("SELECT * FROM gis_polygon");
      })
      .then(rows => {
        assert.deepEqual(rows, [
          {
            g: [
              [
                { x: 10, y: 10 },
                { x: 20, y: 10 },
                { x: 20, y: 20 },
                { x: 10, y: 20 },
                { x: 10, y: 10 }
              ]
            ]
          },
          {
            g: [
              [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }, { x: 0, y: 0 }],
              [
                { x: 10, y: 10 },
                { x: 20, y: 10 },
                { x: 20, y: 20 },
                { x: 10, y: 20 },
                { x: 10, y: 10 }
              ]
            ]
          },
          { g: [[{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 0 }]] }
        ]);
        done();
      })
      .catch(done);
  });

  it("MultiPoint format", done => {
    let prefix = "";
    if (!shareConn.isMariaDB() && shareConn.hasMinVersion(8, 0, 0)) prefix = "ST_";

    shareConn.query("CREATE TEMPORARY TABLE gis_multi_point (g MULTIPOINT)");
    shareConn
      .query(
        "INSERT INTO gis_multi_point VALUES\n" +
          "    (" +
          prefix +
          "MultiPointFromText('MULTIPOINT(0 0,10 10,10 20,20 20)')),\n" +
          "    (" +
          prefix +
          "MPointFromText('MULTIPOINT(1 1,11 11,11 21,21 21)')),\n" +
          "    (" +
          prefix +
          "MPointFromWKB(" +
          prefix +
          "AsWKB(MultiPoint(Point(3, 6), Point(4, 10)))))"
      )
      .then(() => {
        return shareConn.query("SELECT * FROM gis_multi_point");
      })
      .then(rows => {
        assert.deepEqual(rows, [
          { g: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 20 }, { x: 20, y: 20 }] },
          { g: [{ x: 1, y: 1 }, { x: 11, y: 11 }, { x: 11, y: 21 }, { x: 21, y: 21 }] },
          { g: [{ x: 3, y: 6 }, { x: 4, y: 10 }] }
        ]);
        done();
      })
      .catch(done);
  });

  it("Multi-line String format", done => {
    let prefix = "";
    if (!shareConn.isMariaDB() && shareConn.hasMinVersion(8, 0, 0)) prefix = "ST_";

    shareConn.query("CREATE TEMPORARY TABLE gis_multi_line (g MULTILINESTRING)");
    shareConn
      .query(
        "INSERT INTO gis_multi_line VALUES\n" +
          "    (" +
          prefix +
          "MultiLineStringFromText('MULTILINESTRING((10 48,10 21,10 0),(16 0,16 23,16 48))')),\n" +
          "    (" +
          prefix +
          "MLineFromText('MULTILINESTRING((10 48,10 21,10 0))')),\n" +
          "    (" +
          prefix +
          "MLineFromWKB(" +
          prefix +
          "AsWKB(MultiLineString(LineString(Point(1, 2), Point(3, 5)), LineString(Point(2, 5), Point(5, 8), Point(21, 7))))))"
      )
      .then(() => {
        return shareConn.query("SELECT * FROM gis_multi_line");
      })
      .then(rows => {
        assert.deepEqual(rows, [
          {
            g: [
              [{ x: 10, y: 48 }, { x: 10, y: 21 }, { x: 10, y: 0 }],
              [{ x: 16, y: 0 }, { x: 16, y: 23 }, { x: 16, y: 48 }]
            ]
          },
          { g: [[{ x: 10, y: 48 }, { x: 10, y: 21 }, { x: 10, y: 0 }]] },
          {
            g: [[{ x: 1, y: 2 }, { x: 3, y: 5 }], [{ x: 2, y: 5 }, { x: 5, y: 8 }, { x: 21, y: 7 }]]
          }
        ]);
        done();
      })
      .catch(done);
  });

  it("Multi-polygone format", done => {
    let prefix = "";
    if (!shareConn.isMariaDB() && shareConn.hasMinVersion(8, 0, 0)) prefix = "ST_";

    shareConn.query("CREATE TEMPORARY TABLE gis_multi_polygon (g MULTIPOLYGON)");
    shareConn
      .query(
        "INSERT INTO gis_multi_polygon VALUES\n" +
          "    (" +
          prefix +
          "MultiPolygonFromText('MULTIPOLYGON(((28 26,28 0,84 0,84 42,28 26),(52 18,66 23,73 9,48 6,52 18)),((59 18,67 18,67 13,59 13,59 18)))')),\n" +
          "    (" +
          prefix +
          "MPolyFromText('MULTIPOLYGON(((28 26,28 0,84 0,84 42,28 26),(52 18,66 23,73 9,48 6,52 18)),((59 18,67 18,67 13,59 13,59 18)))')),\n" +
          "    (" +
          prefix +
          "MPolyFromWKB(" +
          prefix +
          "AsWKB(MultiPolygon(Polygon(LineString(Point(0, 3), Point(3, 3), Point(3, 0), Point(0, 3)))))))"
      )
      .then(() => {
        return shareConn.query("SELECT * FROM gis_multi_polygon");
      })
      .then(rows => {
        assert.deepEqual(rows, [
          {
            g: [
              [
                [
                  { x: 28, y: 26 },
                  { x: 28, y: 0 },
                  { x: 84, y: 0 },
                  { x: 84, y: 42 },
                  { x: 28, y: 26 }
                ],
                [
                  { x: 52, y: 18 },
                  { x: 66, y: 23 },
                  { x: 73, y: 9 },
                  { x: 48, y: 6 },
                  { x: 52, y: 18 }
                ]
              ],
              [
                [
                  { x: 59, y: 18 },
                  { x: 67, y: 18 },
                  { x: 67, y: 13 },
                  { x: 59, y: 13 },
                  { x: 59, y: 18 }
                ]
              ]
            ]
          },
          {
            g: [
              [
                [
                  { x: 28, y: 26 },
                  { x: 28, y: 0 },
                  { x: 84, y: 0 },
                  { x: 84, y: 42 },
                  { x: 28, y: 26 }
                ],
                [
                  { x: 52, y: 18 },
                  { x: 66, y: 23 },
                  { x: 73, y: 9 },
                  { x: 48, y: 6 },
                  { x: 52, y: 18 }
                ]
              ],
              [
                [
                  { x: 59, y: 18 },
                  { x: 67, y: 18 },
                  { x: 67, y: 13 },
                  { x: 59, y: 13 },
                  { x: 59, y: 18 }
                ]
              ]
            ]
          },
          { g: [[[{ x: 0, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 0 }, { x: 0, y: 3 }]]] }
        ]);
        done();
      })
      .catch(done);
  });

  it("Geometry collection format", done => {
    let prefix = "";
    if (!shareConn.isMariaDB() && shareConn.hasMinVersion(8, 0, 0)) prefix = "ST_";

    shareConn.query("CREATE TEMPORARY TABLE gis_geometrycollection (g GEOMETRYCOLLECTION)");
    shareConn
      .query(
        "INSERT INTO gis_geometrycollection VALUES\n" +
          "    (" +
          prefix +
          "GeomCollFromText('GEOMETRYCOLLECTION(POINT(0 0), LINESTRING(0 0,10 10))')),\n" +
          "    (" +
          prefix +
          "GeometryFromWKB(" +
          prefix +
          "AsWKB(GeometryCollection(Point(44, 6), LineString(Point(3, 6), Point(7, 9)))))),\n" +
          "    (" +
          prefix +
          "GeomFromText('GeometryCollection()')),\n" +
          "    (" +
          prefix +
          "GeomFromText('GeometryCollection EMPTY'))"
      )
      .then(() => {
        return shareConn.query("SELECT * FROM gis_geometrycollection");
      })
      .then(rows => {
        assert.deepEqual(rows, [
          { g: [{ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 10, y: 10 }]] },
          { g: [{ x: 44, y: 6 }, [{ x: 3, y: 6 }, { x: 7, y: 9 }]] },
          { g: [] },
          { g: [] }
        ]);
        done();
      })
      .catch(done);
  });
});
