"use strict";

const base = require("../../base.js");
const { assert } = require("chai");

describe("geometry data type", () => {
  it("Point format", done => {
    shareConn.query("CREATE TEMPORARY TABLE gis_point  (g POINT)");
    shareConn
      .query(
        "INSERT INTO gis_point VALUES\n" +
          "    (ST_PointFromText('POINT(10 10)')),\n" +
          "    (ST_PointFromText('POINT(20 10)')),\n" +
          "    (ST_PointFromText('POINT(20 20)')),\n" +
          "    (ST_PointFromText('POINT(10 20)'))"
      )
      .then(() => {
        return shareConn.query("SELECT * FROM gis_point");
      })
      .then(rows => {
        assert.deepEqual(rows, [
          {
            g: {
              type: "Point",
              coordinates: [10, 10]
            }
          },
          {
            g: {
              type: "Point",
              coordinates: [20, 10]
            }
          },
          {
            g: {
              type: "Point",
              coordinates: [20, 20]
            }
          },
          {
            g: {
              type: "Point",
              coordinates: [10, 20]
            }
          }
        ]);
        done();
      })
      .catch(done);
  });

  it("Point Insert", function(done) {
    //mysql < 8 doesn't permit sending empty data
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(8, 0, 0)) this.skip();

    shareConn.query("CREATE TEMPORARY TABLE gis_point_insert  (g POINT)");
    shareConn
      .query("INSERT INTO gis_point_insert VALUES (?)", [{ type: "Point", coordinates: [10, 10] }])
      .then(() => {
        return shareConn.query("INSERT INTO gis_point_insert VALUES (?)", [
          { type: "Point", coordinates: [20, 10] }
        ]);
      })
      .then(() => {
        return shareConn.query("INSERT INTO gis_point_insert VALUES (?)", [
          { type: "Point", coordinates: [] }
        ]);
      })
      .then(() => {
        return shareConn.query("INSERT INTO gis_point_insert VALUES (?)", [{ type: "Point" }]);
      })
      .then(() => {
        return shareConn.query("SELECT * FROM gis_point_insert");
      })
      .then(rows => {
        assert.deepEqual(rows, [
          {
            g: {
              type: "Point",
              coordinates: [10, 10]
            }
          },
          {
            g: {
              type: "Point",
              coordinates: [20, 10]
            }
          },
          {
            g: null
          },
          {
            g: null
          }
        ]);
        done();
      })
      .catch(done);
  });

  it("LineString format", done => {
    shareConn.query("CREATE TEMPORARY TABLE gis_line  (g LINESTRING)");
    shareConn
      .query(
        "INSERT INTO gis_line VALUES\n" +
          "    (ST_LineFromText('LINESTRING(0 0,0 10,10 0)')),\n" +
          "    (ST_LineStringFromText('LINESTRING(10 10,20 10,20 20,10 20,10 10)')),\n" +
          "    (ST_LineStringFromWKB(ST_AsWKB(LineString(Point(10, 10), Point(40, 10)))))"
      )
      .then(() => {
        return shareConn.query("SELECT * FROM gis_line");
      })
      .then(rows => {
        assert.deepEqual(rows, [
          {
            g: {
              type: "LineString",
              coordinates: [[0, 0], [0, 10], [10, 0]]
            }
          },
          {
            g: {
              type: "LineString",
              coordinates: [[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]
            }
          },
          {
            g: {
              type: "LineString",
              coordinates: [[10, 10], [40, 10]]
            }
          }
        ]);
        done();
      })
      .catch(done);
  });

  it("LineString insert", function(done) {
    //mysql < 8 doesn't permit sending empty data
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(8, 0, 0)) this.skip();

    shareConn.query("CREATE TEMPORARY TABLE gis_line_insert  (g LINESTRING)");
    shareConn
      .query("INSERT INTO gis_line_insert VALUES (?)", [
        { type: "LineString", coordinates: [[0, 0], [0, 10], [10, 0]] }
      ])
      .then(() => {
        return shareConn.query("INSERT INTO gis_line_insert VALUES (?)", [
          {
            type: "LineString",
            coordinates: [[0, 10]]
          }
        ]);
      })
      .then(() => {
        return shareConn.query("INSERT INTO gis_line_insert VALUES (?)", [
          {
            type: "LineString",
            coordinates: []
          }
        ]);
      })
      .then(() => {
        return shareConn.query("INSERT INTO gis_line_insert VALUES (?)", [{ type: "LineString" }]);
      })
      .then(() => {
        return shareConn.query("SELECT * FROM gis_line_insert");
      })
      .then(rows => {
        assert.deepEqual(rows, [
          {
            g: {
              type: "LineString",
              coordinates: [[0, 0], [0, 10], [10, 0]]
            }
          },
          {
            g: {
              type: "LineString",
              coordinates: [[0, 10]]
            }
          },
          {
            g: null
          },
          {
            g: null
          }
        ]);
        done();
      })
      .catch(done);
  });

  it("Polygon format", done => {
    shareConn.query("CREATE TEMPORARY TABLE gis_polygon (g POLYGON)");
    shareConn
      .query(
        "INSERT INTO gis_polygon VALUES\n" +
          "    (ST_PolygonFromText('POLYGON((10 10,20 10,20 20,10 20,10 10))')),\n" +
          "    (ST_PolyFromText('POLYGON((0 0,50 0,50 50,0 50,0 0), (10 10,20 10,20 20,10 20,10 10))')),\n" +
          "    (ST_PolyFromWKB(ST_AsWKB(Polygon(LineString(Point(0, 0), Point(30, 0), Point(30, 30), Point(0, 0))))))"
      )
      .then(() => {
        return shareConn.query("SELECT * FROM gis_polygon");
      })
      .then(rows => {
        assert.deepEqual(rows, [
          {
            g: {
              type: "Polygon",
              coordinates: [[[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]]
            }
          },
          {
            g: {
              type: "Polygon",
              coordinates: [
                [[0, 0], [50, 0], [50, 50], [0, 50], [0, 0]],
                [[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]
              ]
            }
          },
          {
            g: {
              type: "Polygon",
              coordinates: [[[0, 0], [30, 0], [30, 30], [0, 0]]]
            }
          }
        ]);
        done();
      })
      .catch(done);
  });

  it("Polygon insert", function(done) {
    //mysql < 8 doesn't permit sending empty data
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(8, 0, 0)) this.skip();

    shareConn.query("CREATE TEMPORARY TABLE gis_polygon_insert (g POLYGON)");
    shareConn
      .query("INSERT INTO gis_polygon_insert VALUES (?)", [
        { type: "Polygon", coordinates: [[[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]] }
      ])
      .then(() => {
        return shareConn.query("INSERT INTO gis_polygon_insert VALUES (?)", [
          {
            type: "Polygon",
            coordinates: [
              [[0, 0], [50, 0], [50, 50], [0, 50], [0, 0]],
              [[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]
            ]
          }
        ]);
      })
      .then(() => {
        return shareConn.query("INSERT INTO gis_polygon_insert VALUES (?)", [
          {
            type: "Polygon",
            coordinates: []
          }
        ]);
      })
      .then(() => {
        return shareConn.query("INSERT INTO gis_polygon_insert VALUES (?)", [{ type: "Polygon" }]);
      })
      .then(() => {
        return shareConn.query("SELECT * FROM gis_polygon_insert");
      })
      .then(rows => {
        assert.deepEqual(rows, [
          {
            g: {
              type: "Polygon",
              coordinates: [[[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]]
            }
          },
          {
            g: {
              type: "Polygon",
              coordinates: [
                [[0, 0], [50, 0], [50, 50], [0, 50], [0, 0]],
                [[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]
              ]
            }
          },
          {
            g: null
          },
          {
            g: null
          }
        ]);
        done();
      })
      .catch(done);
  });

  it("MultiPoint format", done => {
    shareConn.query("CREATE TEMPORARY TABLE gis_multi_point (g MULTIPOINT)");
    shareConn
      .query(
        "INSERT INTO gis_multi_point VALUES\n" +
          "    (ST_MultiPointFromText('MULTIPOINT(0 0,10 10,10 20,20 20)')),\n" +
          "    (ST_MPointFromText('MULTIPOINT(1 1,11 11,11 21,21 21)')),\n" +
          "    (ST_MPointFromWKB(ST_AsWKB(MultiPoint(Point(3, 6), Point(4, 10)))))"
      )
      .then(() => {
        return shareConn.query("SELECT * FROM gis_multi_point");
      })
      .then(rows => {
        assert.deepEqual(rows, [
          {
            g: {
              type: "MultiPoint",
              coordinates: [[0, 0], [10, 10], [10, 20], [20, 20]]
            }
          },
          {
            g: {
              type: "MultiPoint",
              coordinates: [[1, 1], [11, 11], [11, 21], [21, 21]]
            }
          },
          {
            g: {
              type: "MultiPoint",
              coordinates: [[3, 6], [4, 10]]
            }
          }
        ]);
        done();
      })
      .catch(done);
  });

  it("MultiPoint insert", function(done) {
    //mysql < 8 doesn't permit sending empty data
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(8, 0, 0)) this.skip();

    shareConn.query("CREATE TEMPORARY TABLE gis_multi_point_insert (g MULTIPOINT)");
    shareConn
      .query("INSERT INTO gis_multi_point_insert VALUES (?)", [
        { type: "MultiPoint", coordinates: [[0, 0], [10, 10], [10, 20], [20, 20]] }
      ])
      .then(() => {
        return shareConn.query("INSERT INTO gis_multi_point_insert VALUES (?)", [
          { type: "MultiPoint", coordinates: [[10, 0]] }
        ]);
      })
      .then(() => {
        return shareConn.query("INSERT INTO gis_multi_point_insert VALUES (?)", [
          { type: "MultiPoint", coordinates: [] }
        ]);
      })
      .then(() => {
        return shareConn.query("INSERT INTO gis_multi_point_insert VALUES (?)", [
          { type: "MultiPoint" }
        ]);
      })
      .then(() => {
        return shareConn.query("SELECT * FROM gis_multi_point_insert");
      })
      .then(rows => {
        assert.deepEqual(rows, [
          {
            g: {
              type: "MultiPoint",
              coordinates: [[0, 0], [10, 10], [10, 20], [20, 20]]
            }
          },
          {
            g: {
              type: "MultiPoint",
              coordinates: [[10, 0]]
            }
          },
          {
            g: null
          },
          {
            g: null
          }
        ]);
        done();
      })
      .catch(done);
  });

  it("Multi-line String format", done => {
    shareConn.query("CREATE TEMPORARY TABLE gis_multi_line (g MULTILINESTRING)");
    shareConn
      .query(
        "INSERT INTO gis_multi_line VALUES\n" +
          "    (ST_MultiLineStringFromText('MULTILINESTRING((10 48,10 21,10 0),(16 0,16 23,16 48))')),\n" +
          "    (ST_MLineFromText('MULTILINESTRING((10 48,10 21,10 0))')),\n" +
          "    (ST_MLineFromWKB(ST_AsWKB(MultiLineString(LineString(Point(1, 2), Point(3, 5)), LineString(Point(2, 5), Point(5, 8), Point(21, 7))))))"
      )
      .then(() => {
        return shareConn.query("SELECT * FROM gis_multi_line");
      })
      .then(rows => {
        assert.deepEqual(rows, [
          {
            g: {
              type: "MultiLineString",
              coordinates: [[[10, 48], [10, 21], [10, 0]], [[16, 0], [16, 23], [16, 48]]]
            }
          },
          {
            g: {
              type: "MultiLineString",
              coordinates: [[[10, 48], [10, 21], [10, 0]]]
            }
          },
          {
            g: {
              type: "MultiLineString",
              coordinates: [[[1, 2], [3, 5]], [[2, 5], [5, 8], [21, 7]]]
            }
          }
        ]);
        done();
      })
      .catch(done);
  });

  it("Multi-line insert", function(done) {
    //mysql < 8 doesn't permit sending empty data
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(8, 0, 0)) this.skip();

    shareConn.query("CREATE TEMPORARY TABLE gis_multi_line_insert (g MULTILINESTRING)");
    shareConn
      .query("INSERT INTO gis_multi_line_insert VALUES (?)", [
        {
          type: "MultiLineString",
          coordinates: [[[10, 48], [10, 21], [10, 0]], [[16, 0], [16, 23], [16, 48]]]
        }
      ])
      .then(() => {
        return shareConn.query("INSERT INTO gis_multi_line_insert VALUES (?)", [
          { type: "MultiLineString", coordinates: [[[10, 48], [10, 21], [10, 0]]] }
        ]);
      })
      .then(() => {
        return shareConn.query("INSERT INTO gis_multi_line_insert VALUES (?)", [
          { type: "MultiLineString", coordinates: [[]] }
        ]);
      })
      .then(() => {
        return shareConn.query("INSERT INTO gis_multi_line_insert VALUES (?)", [
          { type: "MultiLineString", coordinates: [] }
        ]);
      })
      .then(() => {
        return shareConn.query("INSERT INTO gis_multi_line_insert VALUES (?)", [
          { type: "MultiLineString" }
        ]);
      })
      .then(() => {
        return shareConn.query("SELECT * FROM gis_multi_line_insert");
      })
      .then(rows => {
        assert.deepEqual(rows, [
          {
            g: {
              type: "MultiLineString",
              coordinates: [[[10, 48], [10, 21], [10, 0]], [[16, 0], [16, 23], [16, 48]]]
            }
          },
          {
            g: {
              type: "MultiLineString",
              coordinates: [[[10, 48], [10, 21], [10, 0]]]
            }
          },
          {
            g: null
          },
          {
            g: null
          },
          {
            g: null
          }
        ]);
        done();
      })
      .catch(done);
  });

  it("Multi-polygon format", done => {
    shareConn.query("CREATE TEMPORARY TABLE gis_multi_polygon (g MULTIPOLYGON)");
    shareConn
      .query(
        "INSERT INTO gis_multi_polygon VALUES\n" +
          "    (ST_MultiPolygonFromText('MULTIPOLYGON(((28 26,28 0,84 0,84 42,28 26),(52 18,66 23,73 9,48 6,52 18)),((59 18,67 18,67 13,59 13,59 18)))')),\n" +
          "    (ST_MPolyFromText('MULTIPOLYGON(((28 26,28 0,84 0,84 42,28 26),(52 18,66 23,73 9,48 6,52 18)),((59 18,67 18,67 13,59 13,59 18)))')),\n" +
          "    (ST_MPolyFromWKB(ST_AsWKB(MultiPolygon(Polygon(LineString(Point(0, 3), Point(3, 3), Point(3, 0), Point(0, 3)))))))"
      )
      .then(() => {
        return shareConn.query("SELECT * FROM gis_multi_polygon");
      })
      .then(rows => {
        assert.deepEqual(rows, [
          {
            g: {
              type: "MultiPolygon",
              coordinates: [
                [
                  [[28, 26], [28, 0], [84, 0], [84, 42], [28, 26]],
                  [[52, 18], [66, 23], [73, 9], [48, 6], [52, 18]]
                ],
                [[[59, 18], [67, 18], [67, 13], [59, 13], [59, 18]]]
              ]
            }
          },
          {
            g: {
              type: "MultiPolygon",
              coordinates: [
                [
                  [[28, 26], [28, 0], [84, 0], [84, 42], [28, 26]],
                  [[52, 18], [66, 23], [73, 9], [48, 6], [52, 18]]
                ],
                [[[59, 18], [67, 18], [67, 13], [59, 13], [59, 18]]]
              ]
            }
          },
          {
            g: {
              type: "MultiPolygon",
              coordinates: [[[[0, 3], [3, 3], [3, 0], [0, 3]]]]
            }
          }
        ]);
        done();
      })
      .catch(done);
  });

  it("Multi-polygon insert", function(done) {
    //mysql < 8 doesn't permit sending empty data
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(8, 0, 0)) this.skip();

    shareConn.query("CREATE TEMPORARY TABLE gis_multi_polygon_insert (g MULTIPOLYGON)");
    shareConn
      .query("INSERT INTO gis_multi_polygon_insert VALUES (?)", [
        {
          type: "MultiPolygon",
          coordinates: [
            [
              [[28, 26], [28, 0], [84, 0], [84, 42], [28, 26]],
              [[52, 18], [66, 23], [73, 9], [48, 6], [52, 18]]
            ],
            [[[59, 18], [67, 18], [67, 13], [59, 13], [59, 18]]]
          ]
        }
      ])
      .then(() => {
        return shareConn.query("INSERT INTO gis_multi_polygon_insert VALUES (?)", [
          {
            type: "MultiPolygon",
            coordinates: [
              [
                [[28, 26], [28, 0], [84, 0], [84, 42], [28, 26]],
                [[52, 18], [66, 23], [73, 9], [48, 6], [52, 18]]
              ]
            ]
          }
        ]);
      })
      .then(() => {
        return shareConn.query("INSERT INTO gis_multi_polygon_insert VALUES (?)", [
          {
            type: "MultiPolygon",
            coordinates: [[[]]]
          }
        ]);
      })
      .then(() => {
        return shareConn.query("INSERT INTO gis_multi_polygon_insert VALUES (?)", [
          {
            type: "MultiPolygon",
            coordinates: [[]]
          }
        ]);
      })
      .then(() => {
        return shareConn.query("INSERT INTO gis_multi_polygon_insert VALUES (?)", [
          {
            type: "MultiPolygon",
            coordinates: []
          }
        ]);
      })
      .then(() => {
        return shareConn.query("INSERT INTO gis_multi_polygon_insert VALUES (?)", [
          { type: "MultiPolygon" }
        ]);
      })
      .then(() => {
        return shareConn.query("SELECT * FROM gis_multi_polygon_insert");
      })
      .then(rows => {
        assert.deepEqual(rows, [
          {
            g: {
              type: "MultiPolygon",
              coordinates: [
                [
                  [[28, 26], [28, 0], [84, 0], [84, 42], [28, 26]],
                  [[52, 18], [66, 23], [73, 9], [48, 6], [52, 18]]
                ],
                [[[59, 18], [67, 18], [67, 13], [59, 13], [59, 18]]]
              ]
            }
          },
          {
            g: {
              type: "MultiPolygon",
              coordinates: [
                [
                  [[28, 26], [28, 0], [84, 0], [84, 42], [28, 26]],
                  [[52, 18], [66, 23], [73, 9], [48, 6], [52, 18]]
                ]
              ]
            }
          },
          {
            g: null
          },
          {
            g: null
          },
          {
            g: null
          },
          {
            g: null
          }
        ]);
        done();
      })
      .catch(done);
  });

  it("Geometry collection format", done => {
    base
      .createConnection()
      .then(conn => {
        conn.query("CREATE TEMPORARY TABLE gis_geometrycollection (g GEOMETRYCOLLECTION)");
        conn
          .query(
            "INSERT INTO gis_geometrycollection VALUES\n" +
              "    (ST_GeomCollFromText('GEOMETRYCOLLECTION(POINT(0 0), LINESTRING(0 0,10 10))')),\n" +
              "    (ST_GeometryFromWKB(ST_AsWKB(GeometryCollection(Point(44, 6), LineString(Point(3, 6), Point(7, 9))))))" +
              (!shareConn.isMariaDB() && !shareConn.hasMinVersion(8, 0, 0)
                ? ""
                : ",(ST_GeomFromText('GeometryCollection()')),\n" +
                  "    (ST_GeomFromText('GeometryCollection EMPTY'))")
          )
          .then(() => {
            return conn.query("SELECT * FROM gis_geometrycollection");
          })
          .then(rows => {
            let expectedValue = [
              {
                g: {
                  type: "GeometryCollection",
                  geometries: [
                    {
                      type: "Point",
                      coordinates: [0, 0]
                    },
                    {
                      type: "LineString",
                      coordinates: [[0, 0], [10, 10]]
                    }
                  ]
                }
              },
              {
                g: {
                  type: "GeometryCollection",
                  geometries: [
                    {
                      type: "Point",
                      coordinates: [44, 6]
                    },
                    {
                      type: "LineString",
                      coordinates: [[3, 6], [7, 9]]
                    }
                  ]
                }
              },
              {
                g: {
                  type: "GeometryCollection",
                  geometries: []
                }
              },
              {
                g: {
                  type: "GeometryCollection",
                  geometries: []
                }
              }
            ];
            if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(8, 0, 0)) {
              expectedValue = [
                {
                  g: {
                    type: "GeometryCollection",
                    geometries: [
                      {
                        type: "Point",
                        coordinates: [0, 0]
                      },
                      {
                        type: "LineString",
                        coordinates: [[0, 0], [10, 10]]
                      }
                    ]
                  }
                },
                {
                  g: {
                    type: "GeometryCollection",
                    geometries: [
                      {
                        type: "Point",
                        coordinates: [44, 6]
                      },
                      {
                        type: "LineString",
                        coordinates: [[3, 6], [7, 9]]
                      }
                    ]
                  }
                }
              ];
            }
            assert.deepEqual(rows, expectedValue);
            conn.end();
            done();
          })
          .catch(err => {
            conn.end();
            done(err);
          });
      })
      .catch(done);
  });

  it("Geometry collection insert", function(done) {
    //mysql < 8 doesn't permit sending empty data
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(8, 0, 0)) this.skip();

    base
      .createConnection()
      .then(conn => {
        conn.query("CREATE TEMPORARY TABLE gis_geometrycollection_ins (g GEOMETRYCOLLECTION)");
        conn
          .query("INSERT INTO gis_geometrycollection_ins VALUES (?)", [
            {
              type: "GeometryCollection",
              geometries: [
                {
                  type: "Point",
                  coordinates: [10, 10]
                },
                {
                  type: "LineString",
                  coordinates: [[0, 0], [0, 10], [10, 0]]
                },
                {
                  type: "MultiPoint",
                  coordinates: [[0, 0], [10, 10], [10, 20], [20, 20]]
                },
                {
                  type: "MultiLineString",
                  coordinates: [[[10, 48], [10, 21], [10, 0]], [[16, 0], [16, 23], [16, 48]]]
                },
                {
                  type: "MultiPolygon",
                  coordinates: [
                    [
                      [[28, 26], [28, 0], [84, 0], [84, 42], [28, 26]],
                      [[52, 18], [66, 23], [73, 9], [48, 6], [52, 18]]
                    ],
                    [[[59, 18], [67, 18], [67, 13], [59, 13], [59, 18]]]
                  ]
                }
              ]
            }
          ])
          .then(() => {
            return conn.query("INSERT INTO gis_geometrycollection_ins VALUES (?)", [
              {
                type: "GeometryCollection",
                geometries: [
                  {
                    type: "Point",
                    coordinates: [10, 20]
                  }
                ]
              }
            ]);
          })
          .then(() => {
            return conn.query("INSERT INTO gis_geometrycollection_ins VALUES (?)", [
              {
                type: "GeometryCollection",
                geometries: [{}]
              }
            ]);
          })
          .then(() => {
            return conn.query("INSERT INTO gis_geometrycollection_ins VALUES (?)", [
              {
                type: "GeometryCollection",
                geometries: []
              }
            ]);
          })
          .then(() => {
            return conn.query("SELECT * FROM gis_geometrycollection_ins");
          })
          .then(rows => {
            assert.deepEqual(rows, [
              {
                g: {
                  type: "GeometryCollection",
                  geometries: [
                    {
                      type: "Point",
                      coordinates: [10, 10]
                    },
                    {
                      type: "LineString",
                      coordinates: [[0, 0], [0, 10], [10, 0]]
                    },
                    {
                      type: "MultiPoint",
                      coordinates: [[0, 0], [10, 10], [10, 20], [20, 20]]
                    },
                    {
                      type: "MultiLineString",
                      coordinates: [[[10, 48], [10, 21], [10, 0]], [[16, 0], [16, 23], [16, 48]]]
                    },
                    {
                      type: "MultiPolygon",
                      coordinates: [
                        [
                          [[28, 26], [28, 0], [84, 0], [84, 42], [28, 26]],
                          [[52, 18], [66, 23], [73, 9], [48, 6], [52, 18]]
                        ],
                        [[[59, 18], [67, 18], [67, 13], [59, 13], [59, 18]]]
                      ]
                    }
                  ]
                }
              },
              {
                g: {
                  type: "GeometryCollection",
                  geometries: [
                    {
                      type: "Point",
                      coordinates: [10, 20]
                    }
                  ]
                }
              },
              {
                g: {
                  type: "GeometryCollection",
                  geometries: []
                }
              },
              {
                g: {
                  type: "GeometryCollection",
                  geometries: []
                }
              }
            ]);
            conn.end();
            done();
          })
          .catch(err => {
            conn.end();
            done(err);
          });
      })
      .catch(done);
  });
});
