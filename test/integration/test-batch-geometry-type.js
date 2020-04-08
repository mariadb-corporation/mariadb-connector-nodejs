'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const Conf = require('../conf');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('batch geometry type', () => {

  const useBulk = Conf.baseConfig.bulk === undefined ? true : Conf.baseConfig.bulk;

  it('Point format', function (done) {
    if (!shareConn.info.isMariaDB()) this.skip();

    shareConn.query('CREATE TEMPORARY TABLE gis_point_batch  (g POINT)');
    shareConn
      .batch('INSERT INTO gis_point_batch VALUES (?)', [
        [
          {
            type: 'Point',
            coordinates: [10, 10]
          }
        ],
        [
          {
            type: 'Point',
            coordinates: [20, 10]
          }
        ],
        [
          {
            type: 'Point',
            coordinates: [20, 20]
          }
        ],
        [
          {
            type: 'Point',
            coordinates: [10, 20]
          }
        ],
        [
          {
            type: 'Point',
            coordinates: []
          }
        ],
        [
          {
            type: 'Point'
          }
        ]
      ])
      .then(() => {
        return shareConn.query('SELECT * FROM gis_point_batch');
      })
      .then((rows) => {
        assert.deepEqual(rows, [
          {
            g: {
              type: 'Point',
              coordinates: [10, 10]
            }
          },
          {
            g: {
              type: 'Point',
              coordinates: [20, 10]
            }
          },
          {
            g: {
              type: 'Point',
              coordinates: [20, 20]
            }
          },
          {
            g: {
              type: 'Point',
              coordinates: [10, 20]
            }
          },
          {
            g:
              shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 5, 2)
                ? { type: 'Point' }
                : null
          },
          {
            g:
              shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 5, 2)
                ? { type: 'Point' }
                : null
          }
        ]);
        done();
      })
      .catch(done);
  });

  it('LineString insert', function (done) {
    if (!shareConn.info.isMariaDB()) this.skip();
    shareConn.query('CREATE TEMPORARY TABLE gis_line_batch (g LINESTRING)');
    shareConn
      .batch('INSERT INTO gis_line_batch VALUES (?)', [
        [
          {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [0, 10],
              [10, 0]
            ]
          }
        ],
        [
          {
            type: 'LineString',
            coordinates: [[0, 10]]
          }
        ],
        [
          {
            type: 'LineString',
            coordinates: []
          }
        ],
        [
          {
            type: 'LineString'
          }
        ]
      ])
      .then(() => {
        return shareConn.query('SELECT * FROM gis_line_batch');
      })
      .then((rows) => {
        if (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 2, 0)) {
          assert.deepEqual(rows, [
            {
              g: {
                type: 'LineString',
                coordinates: [
                  [0, 0],
                  [0, 10],
                  [10, 0]
                ]
              }
            },
            {
              g: {
                type: 'LineString',
                coordinates: [[0, 10]]
              }
            },
            {
              g: useBulk ? {
                "coordinates": [],
                "type": "LineString"
              } : (shareConn.info.hasMinVersion(10, 5, 2) ? { type: 'LineString' } : null)
            },
            {
              g: shareConn.info.hasMinVersion(10, 5, 2) ? { type: 'LineString' } : null
            }
          ]);
        } else {
          assert.deepEqual(rows, [
            {
              g: {
                type: 'LineString',
                coordinates: [
                  [0, 0],
                  [0, 10],
                  [10, 0]
                ]
              }
            },
            {
              g: {
                type: 'LineString',
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
        }
        done();
      })
      .catch(done);
  });

  it('Polygon insert', function (done) {
    if (!shareConn.info.isMariaDB()) this.skip();
    shareConn.query('CREATE TEMPORARY TABLE gis_polygon_batch (g POLYGON)');
    shareConn
      .batch('INSERT INTO gis_polygon_batch VALUES (?)', [
        [
          {
            type: 'Polygon',
            coordinates: [
              [
                [10, 10],
                [20, 10],
                [20, 20],
                [10, 20],
                [10, 10]
              ]
            ]
          }
        ],
        [
          {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [50, 0],
                [50, 50],
                [0, 50],
                [0, 0]
              ],
              [
                [10, 10],
                [20, 10],
                [20, 20],
                [10, 20],
                [10, 10]
              ]
            ]
          }
        ],
        [
          {
            type: 'Polygon',
            coordinates: [
              [[0, 0], [50]],
              [
                [10, 10],
                [20, 10]
              ]
            ]
          }
        ],
        [
          {
            type: 'Polygon',
            coordinates: []
          }
        ],
        [
          {
            type: 'Polygon'
          }
        ]
      ])
      .then(() => {
        return shareConn.query('SELECT * FROM gis_polygon_batch');
      })
      .then((rows) => {
        if (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 2, 0)) {
          assert.deepEqual(rows, [
            {
              g: {
                type: 'Polygon',
                coordinates: [
                  [
                    [10, 10],
                    [20, 10],
                    [20, 20],
                    [10, 20],
                    [10, 10]
                  ]
                ]
              }
            },
            {
              g: {
                type: 'Polygon',
                coordinates: [
                  [
                    [0, 0],
                    [50, 0],
                    [50, 50],
                    [0, 50],
                    [0, 0]
                  ],
                  [
                    [10, 10],
                    [20, 10],
                    [20, 20],
                    [10, 20],
                    [10, 10]
                  ]
                ]
              }
            },
            {
              g: shareConn.info.hasMinVersion(10, 5, 2) ? { type: 'Polygon' } : null
            },
            {
              g: useBulk ? {
                type: 'Polygon',
                coordinates: []
              } : (shareConn.info.hasMinVersion(10, 5, 2) ? { type: 'Polygon' } : null)
            },
            {
              g: shareConn.info.hasMinVersion(10, 5, 2) ? { type: 'Polygon' } : null
            }
          ]);
        } else {
          assert.deepEqual(rows, [
            {
              g: {
                type: 'Polygon',
                coordinates: [
                  [
                    [10, 10],
                    [20, 10],
                    [20, 20],
                    [10, 20],
                    [10, 10]
                  ]
                ]
              }
            },
            {
              g: {
                type: 'Polygon',
                coordinates: [
                  [
                    [0, 0],
                    [50, 0],
                    [50, 50],
                    [0, 50],
                    [0, 0]
                  ],
                  [
                    [10, 10],
                    [20, 10],
                    [20, 20],
                    [10, 20],
                    [10, 10]
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
            }
          ]);
        }
        done();
      })
      .catch(done);
  });

  it('MultiPoint insert', function (done) {
    if (!shareConn.info.isMariaDB()) this.skip();
    shareConn.query('CREATE TEMPORARY TABLE gis_multi_point_batch (g MULTIPOINT)');
    shareConn
      .batch('INSERT INTO gis_multi_point_batch VALUES (?)', [
        [
          {
            type: 'MultiPoint',
            coordinates: [
              [30, 30],
              [10, 10],
              [10, 20],
              [20, 20]
            ]
          }
        ],
        [{ type: 'MultiPoint', coordinates: [[10, 0]] }],
        [{ type: 'MultiPoint', coordinates: [] }],
        [{ type: 'MultiPoint' }]
      ])
      .then(() => {
        return shareConn.query('SELECT * FROM gis_multi_point_batch');
      })
      .then((rows) => {
        if (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 2, 0)) {
          assert.deepEqual(rows, [
            {
              g: {
                type: 'MultiPoint',
                coordinates: [
                  [30, 30],
                  [10, 10],
                  [10, 20],
                  [20, 20]
                ]
              }
            },
            {
              g: {
                type: 'MultiPoint',
                coordinates: [[10, 0]]
              }
            },
            {
              g: useBulk ? {
                type: 'MultiPoint',
                coordinates: []
              } : (shareConn.info.hasMinVersion(10, 5, 2) ? { type: 'MultiPoint' } : null)
            },
            {
              g: useBulk ? {
                type: 'MultiPoint',
                coordinates: []
              } : (shareConn.info.hasMinVersion(10, 5, 2) ? { type: 'MultiPoint' } : null)
            }
          ]);
        } else {
          assert.deepEqual(rows, [
            {
              g: {
                type: 'MultiPoint',
                coordinates: [
                  [30, 30],
                  [10, 10],
                  [10, 20],
                  [20, 20]
                ]
              }
            },
            {
              g: {
                type: 'MultiPoint',
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
        }
        done();
      })
      .catch(done);
  });

  it('Multi-line insert', function (done) {
    if (!shareConn.info.isMariaDB()) this.skip();
    shareConn.query('CREATE TEMPORARY TABLE gis_multi_line_batch (g MULTILINESTRING)');
    shareConn
      .batch('INSERT INTO gis_multi_line_batch VALUES (?)', [
        [
          {
            type: 'MultiLineString',
            coordinates: [
              [
                [10, 48],
                [10, 21],
                [10, 0]
              ],
              [
                [16, 0],
                [16, 23],
                [16, 48]
              ]
            ]
          }
        ],
        [
          {
            type: 'MultiLineString',
            coordinates: [
              [
                [10, 48],
                [10, 21],
                [10, 0]
              ]
            ]
          }
        ],
        [{ type: 'MultiLineString', coordinates: [[]] }],
        [{ type: 'MultiLineString', coordinates: [] }],
        [{ type: 'MultiLineString' }]
      ])
      .then(() => {
        return shareConn.query('SELECT * FROM gis_multi_line_batch');
      })
      .then((rows) => {
        if (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 2, 0)) {
          assert.deepEqual(rows, [
            {
              g: {
                type: 'MultiLineString',
                coordinates: [
                  [
                    [10, 48],
                    [10, 21],
                    [10, 0]
                  ],
                  [
                    [16, 0],
                    [16, 23],
                    [16, 48]
                  ]
                ]
              }
            },
            {
              g: {
                type: 'MultiLineString',
                coordinates: [
                  [
                    [10, 48],
                    [10, 21],
                    [10, 0]
                  ]
                ]
              }
            },
            {
              g: useBulk ? {
                type: 'MultiLineString',
                coordinates: [[]]
              } : (shareConn.info.hasMinVersion(10, 5, 2) ? { type: 'MultiLineString' } : null)
            },
            {
              g: useBulk ? {
                type: 'MultiLineString',
                coordinates: []
              } : (shareConn.info.hasMinVersion(10, 5, 2) ? { type: 'MultiLineString' } : null)
            },
            {
              g: useBulk ? {
                type: 'MultiLineString',
                coordinates: []
              } : (shareConn.info.hasMinVersion(10, 5, 2) ? { type: 'MultiLineString' } : null)
            }
          ]);
        } else {
          assert.deepEqual(rows, [
            {
              g: {
                type: 'MultiLineString',
                coordinates: [
                  [
                    [10, 48],
                    [10, 21],
                    [10, 0]
                  ],
                  [
                    [16, 0],
                    [16, 23],
                    [16, 48]
                  ]
                ]
              }
            },
            {
              g: {
                type: 'MultiLineString',
                coordinates: [
                  [
                    [10, 48],
                    [10, 21],
                    [10, 0]
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
            }
          ]);
        }
        done();
      })
      .catch(done);
  });

  it('Multi-polygon insert', function (done) {
    if (!shareConn.info.isMariaDB()) this.skip();

    shareConn.query('CREATE TEMPORARY TABLE gis_multi_polygon_batch (g MULTIPOLYGON)');
    shareConn
      .batch('INSERT INTO gis_multi_polygon_batch VALUES (?)', [
        [
          {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [28, 26],
                  [28, 0],
                  [84, 0],
                  [84, 42],
                  [28, 26]
                ],
                [
                  [52, 18],
                  [66, 23],
                  [73, 9],
                  [48, 6],
                  [52, 18]
                ]
              ],
              [
                [
                  [59, 18],
                  [67, 18],
                  [67, 13],
                  [59, 13],
                  [59, 18]
                ]
              ]
            ]
          }
        ],
        [
          {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [28, 26],
                  [28, 0],
                  [84, 0],
                  [84, 42],
                  [28, 26]
                ],
                [
                  [52, 18],
                  [66, 23],
                  [73, 9],
                  [48, 6],
                  [52, 18]
                ]
              ]
            ]
          }
        ],
        [
          {
            type: 'MultiPolygon',
            coordinates: [[[]]]
          }
        ],
        [
          {
            type: 'MultiPolygon',
            coordinates: [[]]
          }
        ],
        [
          {
            type: 'MultiPolygon',
            coordinates: []
          }
        ],
        [
          {
            type: 'MultiPolygon'
          }
        ]
      ])
      .then(() => {
        return shareConn.query('SELECT * FROM gis_multi_polygon_batch');
      })
      .then((rows) => {
        if (shareConn.info.isMariaDB() && shareConn.info.hasMinVersion(10, 2, 0)) {
          assert.deepEqual(rows, [
            {
              g: {
                type: 'MultiPolygon',
                coordinates: [
                  [
                    [
                      [28, 26],
                      [28, 0],
                      [84, 0],
                      [84, 42],
                      [28, 26]
                    ],
                    [
                      [52, 18],
                      [66, 23],
                      [73, 9],
                      [48, 6],
                      [52, 18]
                    ]
                  ],
                  [
                    [
                      [59, 18],
                      [67, 18],
                      [67, 13],
                      [59, 13],
                      [59, 18]
                    ]
                  ]
                ]
              }
            },
            {
              g: {
                type: 'MultiPolygon',
                coordinates: [
                  [
                    [
                      [28, 26],
                      [28, 0],
                      [84, 0],
                      [84, 42],
                      [28, 26]
                    ],
                    [
                      [52, 18],
                      [66, 23],
                      [73, 9],
                      [48, 6],
                      [52, 18]
                    ]
                  ]
                ]
              }
            },
            {
              g: useBulk ? {
                type: 'MultiPolygon',
                coordinates: [[[]]]
              } : (shareConn.info.hasMinVersion(10, 5, 2) ? { type: 'MultiPolygon' } : null)
            },
            {
              g: useBulk ? {
                type: 'MultiPolygon',
                coordinates: [[]]
              } : (shareConn.info.hasMinVersion(10, 5, 2) ? { type: 'MultiPolygon' } : null)
            },
            {
              g: useBulk ? {
                type: 'MultiPolygon',
                coordinates: []
              } : (shareConn.info.hasMinVersion(10, 5, 2) ? { type: 'MultiPolygon' } : null)
            },
            {
              g: useBulk ? {
                type: 'MultiPolygon',
                coordinates: []
              } : (shareConn.info.hasMinVersion(10, 5, 2) ? { type: 'MultiPolygon' } : null)
            }
          ]);
        } else {
          assert.deepEqual(rows, [
            {
              g: {
                type: 'MultiPolygon',
                coordinates: [
                  [
                    [
                      [28, 26],
                      [28, 0],
                      [84, 0],
                      [84, 42],
                      [28, 26]
                    ],
                    [
                      [52, 18],
                      [66, 23],
                      [73, 9],
                      [48, 6],
                      [52, 18]
                    ]
                  ],
                  [
                    [
                      [59, 18],
                      [67, 18],
                      [67, 13],
                      [59, 13],
                      [59, 18]
                    ]
                  ]
                ]
              }
            },
            {
              g: {
                type: 'MultiPolygon',
                coordinates: [
                  [
                    [
                      [28, 26],
                      [28, 0],
                      [84, 0],
                      [84, 42],
                      [28, 26]
                    ],
                    [
                      [52, 18],
                      [66, 23],
                      [73, 9],
                      [48, 6],
                      [52, 18]
                    ]
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
        }
        done();
      })
      .catch(done);
  });

  it('Geometry collection insert', function (done) {
    if (!shareConn.info.isMariaDB()) this.skip();

    base
      .createConnection()
      .then((conn) => {
        conn.query('CREATE TEMPORARY TABLE gis_geometrycollection_batch (g GEOMETRYCOLLECTION)');
        conn
          .batch('INSERT INTO gis_geometrycollection_batch VALUES (?)', [
            [
              {
                type: 'GeometryCollection',
                geometries: [
                  {
                    type: 'Point',
                    coordinates: [10, 10]
                  },
                  {
                    type: 'LineString',
                    coordinates: [
                      [0, 0],
                      [0, 10],
                      [10, 0]
                    ]
                  },
                  {
                    type: 'MultiPoint',
                    coordinates: [
                      [0, 0],
                      [10, 10],
                      [10, 20],
                      [20, 20]
                    ]
                  },
                  {
                    type: 'MultiLineString',
                    coordinates: [
                      [
                        [10, 48],
                        [10, 21],
                        [10, 0]
                      ],
                      [
                        [16, 0],
                        [16, 23],
                        [16, 48]
                      ]
                    ]
                  },
                  {
                    type: 'MultiPolygon',
                    coordinates: [
                      [
                        [
                          [28, 26],
                          [28, 0],
                          [84, 0],
                          [84, 42],
                          [28, 26]
                        ],
                        [
                          [52, 18],
                          [66, 23],
                          [73, 9],
                          [48, 6],
                          [52, 18]
                        ]
                      ],
                      [
                        [
                          [59, 18],
                          [67, 18],
                          [67, 13],
                          [59, 13],
                          [59, 18]
                        ]
                      ]
                    ]
                  }
                ]
              }
            ],
            [
              {
                type: 'GeometryCollection',
                geometries: [
                  {
                    type: 'Point',
                    coordinates: [10, 20]
                  }
                ]
              }
            ],
            [
              {
                type: 'GeometryCollection',
                geometries: [{}]
              }
            ],
            [
              {
                type: 'GeometryCollection',
                geometries: []
              }
            ],
            [
              {
                type: 'GeometryCollection'
              }
            ]
          ])
          .then(() => {
            return conn.query('SELECT * FROM gis_geometrycollection_batch');
          })
          .then((rows) => {
            assert.deepEqual(rows, [
              {
                g: {
                  type: 'GeometryCollection',
                  geometries: [
                    {
                      type: 'Point',
                      coordinates: [10, 10]
                    },
                    {
                      type: 'LineString',
                      coordinates: [
                        [0, 0],
                        [0, 10],
                        [10, 0]
                      ]
                    },
                    {
                      type: 'MultiPoint',
                      coordinates: [
                        [0, 0],
                        [10, 10],
                        [10, 20],
                        [20, 20]
                      ]
                    },
                    {
                      type: 'MultiLineString',
                      coordinates: [
                        [
                          [10, 48],
                          [10, 21],
                          [10, 0]
                        ],
                        [
                          [16, 0],
                          [16, 23],
                          [16, 48]
                        ]
                      ]
                    },
                    {
                      type: 'MultiPolygon',
                      coordinates: [
                        [
                          [
                            [28, 26],
                            [28, 0],
                            [84, 0],
                            [84, 42],
                            [28, 26]
                          ],
                          [
                            [52, 18],
                            [66, 23],
                            [73, 9],
                            [48, 6],
                            [52, 18]
                          ]
                        ],
                        [
                          [
                            [59, 18],
                            [67, 18],
                            [67, 13],
                            [59, 13],
                            [59, 18]
                          ]
                        ]
                      ]
                    }
                  ]
                }
              },
              {
                g: {
                  type: 'GeometryCollection',
                  geometries: [
                    {
                      type: 'Point',
                      coordinates: [10, 20]
                    }
                  ]
                }
              },
              {
                g: {
                  type: 'GeometryCollection',
                  geometries: []
                }
              },
              {
                g: {
                  type: 'GeometryCollection',
                  geometries: []
                }
              },
              {
                g: {
                  type: 'GeometryCollection',
                  geometries: []
                }
              }
            ]);
            conn.end();
            done();
          })
          .catch((err) => {
            conn.end();
            done(err);
          });
      })
      .catch(done);
  });
});
